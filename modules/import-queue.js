// FR-C1 导入体验增强（拖拽 / 批量 / 最近文件）
//
// 这块最容易写成「一把梭的 DOM 回调」，所以刻意把三件事拆成可测的纯逻辑：
//   - 文件筛选：什么能收、什么必须给出原因（静默忽略是导入体验的头号杀手）
//   - 队列：串行执行 + 单个失败不中断（批量导入第 3 个坏了，前 2 个不该白导）
//   - 最近文件：容量上限 + 按「名称+大小」去重 + 新→旧排序

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB，超过浏览器解析体验就会明显变差
export const RECENT_LIMIT = 8;

export const REJECT_REASONS = {
  NOT_TXT: "not-txt",
  TOO_LARGE: "too-large",
  EMPTY: "empty",
  DUPLICATE: "duplicate"
};

// 扩展名兜底：有些系统拖拽进来的 File.type 是空字符串
export function isTxtFile(file) {
  if (!file) {
    return false;
  }
  const name = String(file.name || "").toLowerCase();
  if (name.endsWith(".txt")) {
    return true;
  }
  const type = String(file.type || "").toLowerCase();
  // 部分平台给的是 octet-stream（跟 <input accept> 里一样放行），但必须有 .txt 后缀之外的证据
  return type === "text/plain";
}

export function fileKey(file) {
  return `${String(file?.name || "")}::${Number(file?.size || 0)}`;
}

/**
 * 拖拽/批量选择的文件筛选。
 *
 * @param {Array<{name?: string, size?: number, type?: string}>} files
 * @param {{maxBytes?: number, selected?: Array<object>}} options selected 用于同批次内去重
 * @returns {{accepted: object[], rejected: Array<{name: string, reason: string}>}}
 */
export function classifyDroppedFiles(files, { maxBytes = MAX_FILE_BYTES, selected = [] } = {}) {
  const accepted = [];
  const rejected = [];
  const seen = new Set((selected || []).map(fileKey));

  for (const file of Array.from(files || [])) {
    const name = String(file?.name || "");
    if (!isTxtFile(file)) {
      rejected.push({ name, reason: REJECT_REASONS.NOT_TXT });
      continue;
    }
    const size = Number(file?.size || 0);
    if (size <= 0) {
      // 空文件在读入后也会失败，早点拒绝能少一次无谓的解析
      rejected.push({ name, reason: REJECT_REASONS.EMPTY });
      continue;
    }
    if (size > maxBytes) {
      rejected.push({ name, reason: REJECT_REASONS.TOO_LARGE });
      continue;
    }
    const key = fileKey(file);
    if (seen.has(key)) {
      rejected.push({ name, reason: REJECT_REASONS.DUPLICATE });
      continue;
    }
    seen.add(key);
    accepted.push(file);
  }

  return { accepted, rejected };
}

/**
 * 串行导入队列。
 *
 * @param {{importOne: (file: object) => Promise<any>, onProgress?: (payload: object) => void}} options
 */
export function createImportQueue({ importOne, onProgress = null } = {}) {
  if (typeof importOne !== "function") {
    throw new Error("createImportQueue 需要 importOne 函数");
  }

  const items = [];
  let running = false;

  function snapshot() {
    return items.map((item) => ({
      name: item.file?.name || "",
      status: item.status,
      error: item.error ? String(item.error.message || item.error) : null,
      result: item.result ?? null
    }));
  }

  function summary() {
    return {
      total: items.length,
      succeeded: items.filter((item) => item.status === "done").length,
      failed: items.filter((item) => item.status === "failed").length,
      results: snapshot()
    };
  }

  return {
    enqueue(files) {
      for (const file of Array.from(files || [])) {
        items.push({ file, status: "pending", error: null, result: null });
      }
      return items.length;
    },
    size() {
      return items.length;
    },
    results: snapshot,
    summary,
    async run() {
      if (running) {
        return summary();
      }
      running = true;
      try {
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];
          if (item.status !== "pending") {
            continue;
          }
          item.status = "running";
          onProgress?.({ index, total: items.length, name: item.file?.name || "", status: "running" });
          try {
            item.result = await importOne(item.file);
            item.status = "done";
          } catch (error) {
            // 单个失败必须被吞掉：批量导入里一个坏文件不该让后面全部作废
            item.status = "failed";
            item.error = error;
            onProgress?.({ index, total: items.length, name: item.file?.name || "", status: "failed", error });
          }
          onProgress?.({
            index,
            total: items.length,
            name: item.file?.name || "",
            status: item.status,
            ...summary()
          });
        }
      } finally {
        running = false;
      }
      return summary();
    }
  };
}

/**
 * 最近文件列表更新（不可变）。
 * 同一本书再次导入时移到最前，而不是堆两条。
 */
export function pushRecentFile(list, entry, { limit = RECENT_LIMIT } = {}) {
  const current = Array.isArray(list) ? list : [];
  if (!entry || !entry.name) {
    return current.slice(0, limit);
  }
  const key = fileKey(entry);
  const next = [{ ...entry }, ...current.filter((item) => fileKey(item) !== key)];
  return next.slice(0, limit);
}

export function listRecentFiles(list, { limit = RECENT_LIMIT } = {}) {
  const current = Array.isArray(list) ? list : [];
  return current
    .filter((item) => item && item.name)
    .slice()
    .sort((left, right) => Number(right.importedAt || 0) - Number(left.importedAt || 0))
    .slice(0, limit);
}

/** 把导入结果压成一条最近文件记录。 */
export function toRecentEntry(imported, { bookId = null, importedAt = Date.now() } = {}) {
  if (!imported?.name) {
    return null;
  }
  return {
    name: imported.name,
    size: Number(imported.size || 0),
    bookId: bookId || imported.id || null,
    encoding: imported.encoding || "",
    importedAt
  };
}

/** 拒绝原因 → i18n 文案键，UI 直接用，避免文案散落在多处。 */
export const REJECT_MESSAGE_KEY = {
  [REJECT_REASONS.NOT_TXT]: "importRejectNotTxt",
  [REJECT_REASONS.TOO_LARGE]: "importRejectTooLarge",
  [REJECT_REASONS.EMPTY]: "importRejectEmpty",
  [REJECT_REASONS.DUPLICATE]: "importRejectDuplicate"
};
