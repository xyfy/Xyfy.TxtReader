// FR-M1 大文件分页稳定性：TC-M1-01（首屏）/ TC-M1-02（超大单章）
//
// 浏览器里的「首屏耗时」包含渲染测量，Node 侧无法复现；这里验证的是决定首屏耗时
// 的两个可控因素：解析耗时，以及「首屏只付前几页的分页成本」这个结构性保证。

import assert from "node:assert/strict";
import { clampSpreadStart, collectPages, createRenderedChapterPager } from "../modules/paginator.js";
import { parseChaptersWithMeta } from "../modules/chapter-parser.js";

const CHARS_PER_PAGE = 920;

/** 构造约 100 万字的单章小说文本（TC-M1-01/02 的大文件样本） */
function buildHugeChapter(totalChars = 1_000_000) {
  const parts = [];
  let written = 0;
  let index = 0;
  while (written < totalChars) {
    // 带序号，保证每一页内容都不相同（否则重复文本会让断言失去意义）
    const unit = `第${index}句这是一个用于验证大文件分页稳定性的中文句子，包含足够长的段落内容。`;
    parts.push(unit);
    written += unit.length;
    index += 1;
  }
  return parts.join("");
}

function makePager(content, charsPerPage = CHARS_PER_PAGE) {
  return createRenderedChapterPager(
    content,
    { fontSize: 16, lineHeight: 1.8 },
    { width: 800, height: 600, charWidth: 16 },
    (text) => text.length <= charsPerPage
  );
}

function run() {
  // 1) 分页必须是惰性的：创建分页器不预先生成任何页
  const huge = buildHugeChapter(1_000_000);
  const t0 = performance.now();
  const pager = makePager(huge);
  const createCost = performance.now() - t0;
  assert.equal(pager.done, false, "大文本不应在创建分页器时就被判定完成");
  assert.ok(createCost < 200, `创建分页器应几乎零成本，实测 ${createCost.toFixed(1)}ms`);
  console.log(`✓ 分页器惰性创建 ${createCost.toFixed(1)}ms（未预生成任何页）`);

  // 2) TC-M1-02：单次生成量必须封顶，不允许一口气生成全部页
  const t1 = performance.now();
  const firstBatch = collectPages(pager, { requiredCount: 100_000, maxPages: 32 });
  const batchCost = performance.now() - t1;
  assert.equal(firstBatch.generated, 32, "TC-M1-02 单次生成应被 maxPages 封顶为 32 页");
  assert.equal(firstBatch.done, false, "全书尚未分页完成时 done 应为 false");
  assert.ok(batchCost < 1000, `TC-M1-02 首屏分页应远低于 3s，实测 ${batchCost.toFixed(1)}ms`);
  console.log(`✓ TC-M1-02 首屏仅生成 ${firstBatch.generated} 页，耗时 ${batchCost.toFixed(1)}ms`);

  // 3) 渐近分页：剩余部分可继续生成，不会丢失内容
  const secondBatch = collectPages(pager, { requiredCount: 64, maxPages: 32 });
  assert.equal(secondBatch.generated, 32, "应能继续增量生成");
  assert.ok(secondBatch.pages[0] !== firstBatch.pages[0], "增量生成应接着上一次的位置");

  // 4) TC-M1-01：100 万字样本的解析 + 首屏分页总耗时应在 3s 内
  const t2 = performance.now();
  const parsed = parseChaptersWithMeta(huge);
  const parseCost = performance.now() - t2;
  const t3 = performance.now();
  const chapterPager = makePager(parsed.chapters[0].content);
  const firstPaint = collectPages(chapterPager, { requiredCount: 8, maxPages: 32 });
  const paintCost = performance.now() - t3;
  const totalCost = parseCost + paintCost;

  assert.ok(parsed.chapters.length >= 1, "大文件应解析出至少一个可读块");
  assert.ok(firstPaint.generated >= 1, "首屏至少应渲染一页");
  assert.ok(
    totalCost < 3000,
    `TC-M1-01 解析(${parseCost.toFixed(0)}ms)+首屏分页(${paintCost.toFixed(0)}ms) 应 < 3000ms，实测 ${totalCost.toFixed(0)}ms`
  );
  console.log(
    `✓ TC-M1-01 100 万字样本：解析 ${parseCost.toFixed(0)}ms + 首屏 ${paintCost.toFixed(0)}ms = ${totalCost.toFixed(0)}ms (< 3000ms)`
  );

  // 5) 页码收敛：分页未完成时跳转目标必须落在已生成范围内并对齐整幅
  assert.equal(clampSpreadStart(5000, 30, 2), 28, "页码应收敛到最后一个完整整幅");
  assert.equal(clampSpreadStart(5, 30, 2), 4, "页码应对齐到整幅起点");
  assert.equal(clampSpreadStart(0, 30, 2), 0, "首页应保持为 0");
  assert.equal(clampSpreadStart(7, 0, 2), 0, "无已生成页时应回落到 0（避免越界空白）");
  assert.equal(clampSpreadStart(9, 10, 1), 9, "单页视图不应被强行对齐");
  console.log("✓ 页码收敛 clampSpreadStart 行为正确");

  // 6) 边界：空内容不应崩溃
  const emptyPager = makePager("");
  assert.equal(emptyPager.done, true, "空内容分页器应直接完成");
  assert.equal(emptyPager.next(), null, "空内容不应产生页");

  console.log("paginator large-file tests passed (TC-M1-01~02)");
}

run();
