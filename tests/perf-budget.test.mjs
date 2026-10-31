// 首屏分页性能校验（CI 门禁）。
//
// 背景：v0.7 的 buildRenderedPager 每切一页都会把「整章剩余文本」交给浏览器排版，
// 单章分页成本是 O(n²)：10 万字单章实测 9 秒，30 万字单章 196 秒（表现为标签页假死）。
// 修复后为 O(n)，首屏耗时与章节长度脱钩。
//
// 本脚本不依赖真实浏览器：用一个「按行数折算高度」的虚拟页面模拟排版引擎，
// 并统计 fitsPage 被调用时收到的文本长度 —— 这正是本次缺陷的直接来源，
// 因此可以在 Node 侧稳定复现并卡住回归。
//
// 阈值（P95 首屏时间 / 单章全量时间）见 PERFORMANCE_BUDGET。

import assert from "node:assert/strict";
import { createRenderedChapterPager } from "../modules/paginator.js";

/** 性能预算：超过即判失败 */
export const PERFORMANCE_BUDGET = {
  // 首屏（生成前 2 页）—— 用户打开章节到看到文字的路径
  firstScreenMs: 100,
  // 单章全量分页（长章节跳转/整章预热的极端情况）
  fullChapterMs: 500,
  // 单次拟合调用平均送入排版的字符数上限。
  // 这是 O(n²) 的根因指标：旧实现该值随章节长度线性增长（10 万字单章约 5 万）。
  avgProbeChars: 8000,
};

/** 构造无章节标记的连续文本，模拟「整本作为一个章节」的极端 TXT */
function buildChapter(chars) {
  const parts = [];
  let written = 0;
  let i = 0;
  while (written < chars) {
    const unit = `第${i}句这是一个长度适中的中文句子用于验证分页性能是否随章节长度退化。`;
    parts.push(unit);
    written += unit.length;
    i += 1;
  }
  return parts.join("");
}

/**
 * 虚拟排版引擎：每行 34 字，共 18 行；换行/段落额外占高。
 * 与真实 DOM 的差异只在常数，不影响「输入越长越慢」这一复杂度特征。
 */
function makeFits(capacityLines = 18, perLine = 34) {
  const stats = { calls: 0, totalChars: 0 };
  const fits = (text) => {
    stats.calls += 1;
    stats.totalChars += text.length;
    let lines = 0;
    for (const seg of text.split("\n")) {
      lines += Math.max(1, Math.ceil(seg.length / perLine));
    }
    lines += (text.match(/\n/g) || []).length * 0.5;
    return lines <= capacityLines;
  };
  return { fits, stats };
}

const SETTINGS = { fontSize: 18, lineHeight: 1.8 };
const DIMS = { width: 800, height: 600, charWidth: 18 };

function measure(chars, pagesToBuild = Number.POSITIVE_INFINITY) {
  const content = buildChapter(chars);
  const { fits, stats } = makeFits();
  const t0 = performance.now();
  const pager = createRenderedChapterPager(content, SETTINGS, DIMS, fits);
  let pages = 0;
  while (!pager.done && pages < pagesToBuild) {
    const page = pager.next();
    if (!page) break;
    pages += 1;
  }
  const ms = performance.now() - t0;
  return {
    chars,
    pages,
    ms: +ms.toFixed(2),
    calls: stats.calls,
    avgProbeChars: Math.round(stats.totalChars / Math.max(1, stats.calls)),
  };
}

function run() {
  const scenarios = [
    { name: "首屏/3万字", chars: 30_000, pages: 2, budget: "firstScreenMs" },
    { name: "首屏/10万字", chars: 100_000, pages: 2, budget: "firstScreenMs" },
    { name: "首屏/30万字", chars: 300_000, pages: 2, budget: "firstScreenMs" },
    { name: "整章/3万字", chars: 30_000, pages: Infinity, budget: "fullChapterMs" },
    { name: "整章/10万字", chars: 100_000, pages: Infinity, budget: "fullChapterMs" },
    { name: "整章/30万字", chars: 300_000, pages: Infinity, budget: "fullChapterMs" },
  ];

  const rows = [];
  const failures = [];

  for (const sc of scenarios) {
    const r = measure(sc.chars, sc.pages);
    const budget = PERFORMANCE_BUDGET[sc.budget];
    const ok = r.ms <= budget;
    const row = { ...r, name: sc.name, budget, ok };
    rows.push(row);
    if (!ok) failures.push(`${sc.name}: ${r.ms}ms > ${budget}ms`);
    if (r.avgProbeChars > PERFORMANCE_BUDGET.avgProbeChars) {
      failures.push(`${sc.name}: 平均探测 ${r.avgProbeChars} 字 > ${PERFORMANCE_BUDGET.avgProbeChars}`);
    }
  }

  console.log("性能预算校验（首屏 < " + PERFORMANCE_BUDGET.firstScreenMs + "ms，整章 < "
    + PERFORMANCE_BUDGET.fullChapterMs + "ms）");
  console.log("场景           字数      页数     耗时      预算      平均探测字数  结果");
  for (const r of rows) {
    console.log(
      `${r.name.padEnd(14)} ${String(r.chars).padStart(7)} ${String(r.pages).padStart(7)} `
      + `${String(r.ms).padStart(8)}ms ${String(r.budget).padStart(6)}ms `
      + `${String(r.avgProbeChars).padStart(10)}  ${r.ok ? "PASS" : "FAIL"}`
    );
  }

  // 结构性断言：首屏耗时不随章节长度增长（10 倍字数内耗时应基本持平）
  const fs30 = rows.find((r) => r.name === "首屏/3万字");
  const fs300 = rows.find((r) => r.name === "首屏/30万字");
  if (fs30 && fs300) {
    const growth = fs300.ms / Math.max(fs30.ms, 0.01);
    console.log(`\n首屏耗时随字数增长倍数（30万/3万）：${growth.toFixed(1)}x`);
    if (growth > 5) {
      failures.push(`首屏耗时随章节长度增长 ${growth.toFixed(1)}x，疑似回归为 O(n) 以上复杂度`);
    }
  }

  assert.deepEqual(failures, [], `性能回归：\n  - ${failures.join("\n  - ")}`);
  console.log("\n✓ P-02 性能预算校验通过");
}

run();
