// FR-C1 导入体验增强：TC-C1-01 / TC-C1-02
import assert from "node:assert/strict";
import {
  MAX_FILE_BYTES,
  RECENT_LIMIT,
  REJECT_MESSAGE_KEY,
  REJECT_REASONS,
  classifyDroppedFiles,
  createImportQueue,
  fileKey,
  isTxtFile,
  listRecentFiles,
  pushRecentFile,
  toRecentEntry
} from "../modules/import-queue.js";

const file = (name, size = 1024, type = "text/plain") => ({ name, size, type, lastModified: 1 });

// --- TC-C1-01 拖拽筛选 ---
{
  assert.equal(isTxtFile(file("book.txt")), true, ".txt 应被接受");
  assert.equal(isTxtFile({ name: "BOOK.TXT", size: 1 }), true, "扩展名大小写不应影响判断");
  assert.equal(isTxtFile(file("cover.png", 2048, "image/png")), false, "PNG 应被拒绝");
  assert.equal(isTxtFile({ name: "noext", size: 10, type: "text/plain" }), true, "type 为 text/plain 应接受");
  assert.equal(isTxtFile(null), false, "空值不应抛错");

  const { accepted, rejected } = classifyDroppedFiles([
    file("a.txt"),
    file("cover.png", 2048, "image/png"),
    file("b.txt"),
    file("empty.txt", 0),
    file("huge.txt", MAX_FILE_BYTES + 1),
    file("a.txt") // 同批次重复
  ]);

  assert.equal(accepted.length, 2, `应只接受 2 个合法 TXT，实际 ${accepted.length}`);
  assert.deepEqual(accepted.map((item) => item.name), ["a.txt", "b.txt"], "接受顺序应保持拖入顺序");

  const reasonOf = (name) => rejected.find((item) => item.name === name)?.reason;
  assert.equal(reasonOf("cover.png"), REJECT_REASONS.NOT_TXT, "非 TXT 应给出 not-txt");
  assert.equal(reasonOf("empty.txt"), REJECT_REASONS.EMPTY, "空文件应给出 empty");
  assert.equal(reasonOf("huge.txt"), REJECT_REASONS.TOO_LARGE, "超大文件应给出 too-large");
  assert.equal(rejected.filter((item) => item.name === "a.txt")[0]?.reason, REJECT_REASONS.DUPLICATE, "重复文件应给出 duplicate");

  // 每个拒绝原因都必须有可展示的文案键，不能出现「被拒了但不知道说啥」
  for (const reason of Object.values(REJECT_REASONS)) {
    assert.ok(REJECT_MESSAGE_KEY[reason], `拒绝原因 ${reason} 缺少文案键`);
  }

  // 与已选列表一起去重（用户先选 2 个又拖进同样的 1 个）
  const withSelected = classifyDroppedFiles([file("a.txt")], { selected: [file("a.txt")] });
  assert.equal(withSelected.accepted.length, 0, "与已选列表重复的文件应被拒");
  assert.equal(withSelected.rejected[0].reason, REJECT_REASONS.DUPLICATE);

  console.log("✓ TC-C1-01 拖拽筛选：类型/空文件/超大/重复均给出明确原因");
}

// --- TC-C1-02 批量队列容错与最近文件 ---
{
  const importedNames = [];
  const queue = createImportQueue({
    importOne: async (item) => {
      if (item.name === "bad.txt") {
        throw new Error("编码无法识别");
      }
      importedNames.push(item.name);
      return { id: `book-${item.name}` };
    }
  });

  queue.enqueue([file("one.txt"), file("bad.txt"), file("three.txt")]);
  const result = await queue.run();

  assert.equal(result.total, 3, "队列应包含 3 个文件");
  assert.equal(result.succeeded, 2, "损坏文件不应影响其余文件");
  assert.equal(result.failed, 1, "应统计出 1 个失败");
  assert.deepEqual(importedNames, ["one.txt", "three.txt"], "第 2 个失败后应继续导入第 3 个");
  assert.equal(result.results[1].status, "failed", "失败项状态应为 failed");
  assert.match(result.results[1].error, /编码无法识别/, "失败项应保留原因");

  // 空队列直接跑完，不挂起
  const emptyQueue = createImportQueue({ importOne: async () => ({}) });
  const emptyResult = await emptyQueue.run();
  assert.deepEqual({ total: emptyResult.total, succeeded: emptyResult.succeeded }, { total: 0, succeeded: 0 });

  // 缺少 importOne 应显式报错
  assert.throws(() => createImportQueue({}), /需要 importOne/, "缺少回调应抛错");

  // 进度回调应最终报告完整摘要
  const progress = [];
  const progressQueue = createImportQueue({
    importOne: async () => ({ id: "x" }),
    onProgress: (payload) => progress.push(payload)
  });
  progressQueue.enqueue([file("x.txt"), file("y.txt")]);
  await progressQueue.run();
  const last = progress.at(-1);
  assert.equal(last.succeeded, 2, "最后一次进度应带出成功数");
  assert.equal(progress.filter((item) => item.status === "running").length, 2, "每个文件都应上报 running");

  // --- 最近文件 ---
  let recent = [];
  const entry = (name, size, importedAt) => ({ name, size, importedAt });
  recent = pushRecentFile(recent, entry("a.txt", 100, 1000));
  recent = pushRecentFile(recent, entry("b.txt", 100, 2000));
  assert.deepEqual(recent.map((item) => item.name), ["b.txt", "a.txt"], "最近文件应按新→旧排序");

  // 重复导入同名同大小：移动而不是堆两条
  recent = pushRecentFile(recent, entry("a.txt", 100, 3000));
  assert.equal(recent.length, 2, "同一本书重复导入不应产生两条");
  assert.deepEqual(recent.map((item) => item.name), ["a.txt", "b.txt"], "重复项应移到最前");

  // 同名不同大小视为不同文件（用户可能改过内容）
  recent = pushRecentFile(recent, entry("a.txt", 999, 4000));
  assert.equal(recent.length, 3, "同名不同大小应保留为两条");

  // 容量上限
  let many = [];
  for (let i = 0; i < RECENT_LIMIT + 5; i += 1) {
    many = pushRecentFile(many, entry(`book-${i}.txt`, i + 1, 1000 + i));
  }
  assert.equal(many.length, RECENT_LIMIT, `最近文件应封顶 ${RECENT_LIMIT} 条`);
  assert.equal(many[0].name, `book-${RECENT_LIMIT + 4}.txt`, "封顶时应保留最新的");

  // 排序独立于写入顺序（防止存量数据乱序）
  const sorted = listRecentFiles([entry("old.txt", 1, 100), entry("new.txt", 2, 900)]);
  assert.deepEqual(sorted.map((item) => item.name), ["new.txt", "old.txt"], "listRecentFiles 应按时间倒序");

  // 脏数据不应让列表崩掉
  assert.deepEqual(listRecentFiles([null, {}, entry("ok.txt", 1, 1)]).map((item) => item.name), ["ok.txt"], "脏数据应被过滤");
  assert.deepEqual(pushRecentFile(null, entry("x.txt", 1, 1)).map((item) => item.name), ["x.txt"], "空列表应能初始化");

  // 导入结果 → 最近文件记录
  const recentEntry = toRecentEntry({ name: "book.txt", size: 2048, encoding: "gbk" }, { bookId: "b1", importedAt: 5000 });
  assert.deepEqual(recentEntry, { name: "book.txt", size: 2048, bookId: "b1", encoding: "gbk", importedAt: 5000 });
  assert.equal(toRecentEntry(null), null, "无导入结果时不应产生记录");
  assert.equal(fileKey({ name: "a.txt", size: 10 }), fileKey({ name: "a.txt", size: 10 }), "同一文件的 key 应稳定");

  console.log("✓ TC-C1-02 批量队列容错、进度上报与最近文件去重/封顶/排序正确");
}

console.log("import queue tests passed (TC-C1-01~02)");
