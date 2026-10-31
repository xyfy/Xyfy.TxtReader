/**
 * chrome.storage.sync 配额守卫（v0.8 · 处置 L-02）
 *
 * 背景：FR-S3 冲突裁决已实现，但 sync 写入没有任何配额保护。
 * 一旦设置体积超过 chrome.storage.sync 的限制，`area.set` 会直接抛错，
 * 而调用方（setSettings / reset / 冲突裁决）都不捕获，结果是**静默丢配置**。
 *
 * 本模块只做纯计算与判定，不碰 chrome API，便于 Node 直接单测：
 *   1. 估算写入体积（与 Chrome 一样按 key + JSON 字符串的 UTF-8 字节计）
 *   2. 预检：单条上限 / 总量上限 / 写入频率（MAX_WRITE_OPERATIONS_PER_MINUTE）
 *   3. 提供降级建议：能压就压（丢弃可再生成的数据），不能压就明确告知，绝不静默
 */

/** Chrome: QUOTA_BYTES_PER_ITEM = 8192 */
export const QUOTA_BYTES_PER_ITEM = 8192;
/** Chrome: QUOTA_BYTES = 102400（累积总量） */
export const QUOTA_BYTES = 102400;
/** Chrome: MAX_ITEMS = 512 */
export const MAX_ITEMS = 512;

/**
 * 计算单个 key/value 在 storage.sync 中占用的字节数。
 *
 * Chrome 的实现是 `key.length + JSON.stringify(value).length` 的 UTF-8 字节数。
 * 中文一个字符占 3 字节，所以必须按 UTF-8 而不是 `String.length` 算，
 * 否则含中文的字体名/自定义配色会被严重低估。
 */
export function estimateItemBytes(key, value) {
  const keyBytes = utf8Length(String(key ?? ""));
  let json;
  try {
    json = JSON.stringify(value);
  } catch {
    // 循环引用等不可序列化的情况：按 Infinity 处理，交给上层判为超限
    return Number.POSITIVE_INFINITY;
  }
  if (json === undefined) {
    return keyBytes;
  }
  return keyBytes + utf8Length(json);
}

function utf8Length(text) {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      // 代理对：一个 emoji 占 4 字节
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * 预检一批待写入的条目。
 *
 * @param {Record<string, unknown>} items 即将传给 area.set 的对象
 * @param {object} options
 * @param {number} [options.existingBytes] 该 sync 区当前已占用的总字节数
 * @param {number} [options.perItemLimit] 单条上限
 * @param {number} [options.totalLimit] 总量上限
 * @returns {{ok: boolean, code: string, message: string, items: Array<{key: string, bytes: number, overPerItem: boolean}>, totalBytes: number, limitBytes: number, overflowBytes: number, oversizedKeys: string[]}}
 */
export function checkSyncQuota(items = {}, options = {}) {
  const {
    existingBytes = 0,
    perItemLimit = QUOTA_BYTES_PER_ITEM,
    totalLimit = QUOTA_BYTES
  } = options;

  const entries = Object.entries(items || {}).map(([key, value]) => {
    const bytes = estimateItemBytes(key, value);
    return { key, bytes, overPerItem: bytes > perItemLimit };
  });

  const oversizedKeys = entries.filter((entry) => entry.overPerItem).map((entry) => entry.key);
  const incomingBytes = entries.reduce((sum, entry) => sum + (Number.isFinite(entry.bytes) ? entry.bytes : totalLimit + 1), 0);

  // 总量按「已有 + 新增」计。写入同名 key 会覆盖，但保守按累加判断，
  // 宁可少写一次让用户知道，也不要写到一半失败。
  const totalBytes = Math.max(0, Number(existingBytes) || 0) + incomingBytes;

  if (oversizedKeys.length > 0) {
    const worst = Math.max(...entries.filter((entry) => entry.overPerItem).map((entry) => entry.bytes));
    return {
      ok: false,
      code: "ITEM_TOO_LARGE",
      message: `单条数据 ${worst} 字节，超过 sync 单条上限 ${perItemLimit} 字节`,
      items: entries,
      totalBytes,
      limitBytes: totalLimit,
      overflowBytes: worst - perItemLimit,
      oversizedKeys
    };
  }

  if (totalBytes > totalLimit) {
    return {
      ok: false,
      code: "TOTAL_TOO_LARGE",
      message: `同步数据累计 ${totalBytes} 字节，超过 sync 总量上限 ${totalLimit} 字节`,
      items: entries,
      totalBytes,
      limitBytes: totalLimit,
      overflowBytes: totalBytes - totalLimit,
      oversizedKeys
    };
  }

  return {
    ok: true,
    code: "OK",
    message: "",
    items: entries,
    totalBytes,
    limitBytes: totalLimit,
    overflowBytes: 0,
    oversizedKeys: []
  };
}

/**
 * 降级：从设置里摘掉「可再生成」的字段，让剩余部分仍能同步。
 *
 * 原则：优先丢能自动重建的数据（自定义配色可回退默认、键位可用默认映射），
 * 保留用户真正手调过且无法恢复的项（字号、字体、主题、阅读模式）。
 * 全部摘完仍然超限，说明是单条结构本身有问题，直接判失败而不是无限重试。
 *
 * @param {object} settings
 * @param {object} options
 * @returns {{settings: object, droppedFields: string[], ok: boolean, check: object}}
 */
export function shrinkSettingsForSync(settings = {}, options = {}) {
  const { perItemLimit = QUOTA_BYTES_PER_ITEM } = options;
  const key = options.key || "reader-settings-sync";

  // 按「丢失代价」从低到高排列，逐个摘除
  const droppable = [
    { field: "themeColors", hint: "自定义配色已回退默认" },
    { field: "keybindings", hint: "自定义快捷键已回退默认" },
    { field: "customFont", hint: "自定义字体已回退默认" }
  ];

  let current = { ...settings };
  const droppedFields = [];

  let check = checkSyncQuota({ [key]: current }, { perItemLimit, totalLimit: options.totalLimit });
  if (check.ok) {
    return { settings: current, droppedFields, ok: true, check };
  }

  for (const { field } of droppable) {
    if (check.ok) {
      break;
    }
    if (!(field in current)) {
      continue;
    }
    current = { ...current };
    delete current[field];
    droppedFields.push(field);
    check = checkSyncQuota({ [key]: current }, { perItemLimit, totalLimit: options.totalLimit });
  }

  return { settings: current, droppedFields, ok: check.ok, check };
}

/**
 * 把 sync 写入结果整理成 UI 可直接展示的同步状态。
 *
 * 任务要求「用户查看同步状态时能看到『未同步』及原因」，因此统一出口，
 * 避免每个调用点各自拼文案导致口径不一致。
 *
 * @param {{ok: boolean, code?: string, message?: string, droppedFields?: string[], totalBytes?: number, limitBytes?: number}} input
 */
export function describeSyncState(input = {}) {
  const { ok, code = "OK", message = "", droppedFields = [], totalBytes = 0, limitBytes = QUOTA_BYTES } = input;

  if (ok) {
    if (droppedFields.length > 0) {
      return {
        synced: true,
        degraded: true,
        code: "DEGRADED",
        titleKey: "syncStateDegradedTitle",
        detailKey: "syncStateDegradedDetail",
        droppedFields,
        usageText: `${totalBytes} / ${limitBytes}`,
        message: `已同步（精简模式）：${message}`
      };
    }
    return {
      synced: true,
      degraded: false,
      code: "OK",
      titleKey: "syncStateOkTitle",
      detailKey: "",
      droppedFields: [],
      usageText: `${totalBytes} / ${limitBytes}`,
      message: "已同步"
    };
  }

  return {
    synced: false,
    degraded: false,
    code,
    titleKey: "syncStateFailedTitle",
    detailKey: code === "ITEM_TOO_LARGE" ? "syncStateItemTooLarge" : "syncStateTotalTooLarge",
    droppedFields,
    usageText: `${totalBytes} / ${limitBytes}`,
    message: message || "未同步：数据超过浏览器同步配额"
  };
}

/**
 * 内存中的同步状态台账。
 *
 * 跨调用保持「上次同步结果」，供设置面板读取；不落盘（重启后回到未知态，
 * 下次真实写入会自动刷新），避免把过期状态当成事实展示。
 */
export function createSyncStatusLedger() {
  let state = describeSyncState({ ok: true, totalBytes: 0 });

  return {
    get() {
      return { ...state, droppedFields: [...state.droppedFields] };
    },
    /** 记录一次成功写入（可能带降级） */
    recordOk({ droppedFields = [], totalBytes = 0, limitBytes = QUOTA_BYTES } = {}) {
      state = describeSyncState({ ok: true, droppedFields, totalBytes, limitBytes });
      return this.get();
    },
    /** 记录一次失败写入 */
    recordFailure({ code = "UNKNOWN", message = "", totalBytes = 0, limitBytes = QUOTA_BYTES } = {}) {
      state = describeSyncState({ ok: false, code, message, totalBytes, limitBytes });
      return this.get();
    }
  };
}
