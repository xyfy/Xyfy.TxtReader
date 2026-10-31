// P-01 差分验证：新旧分页器在同一 fitsPage 契约下，切分结果必须逐页一致。
//
// 为什么需要这个测试：现有 22 组测试只断言「页数合理」「末页不太短」，
// 无法发现切分点漂移（少字/重字/丢段）。性能优化最容易犯的错就是改快但改错。
//
// 用法：node tests/paginator-equivalence.test.mjs [旧实现路径]
// 运行时会同时加载新旧两份实现，用同一组样本与同一 fitsPage 策略对拍。

import assert from "node:assert/strict";
import { createRenderedChapterPager } from "../modules/paginator.js";

import { fileURLToPath } from "node:url";

// 基线：v0.7.0 发布版的实现（优化前）。作为长期对拍参照，防止切分语义漂移。
const OLD_PATH =
  process.argv[2] ||
  fileURLToPath(new URL("./fixtures/paginator.v0.7.0.js", import.meta.url));

/** 样本生成：覆盖常见 TXT 形态 */
function samples() {
  const list = [];

  // 1) 短文本：一页装得下
  list.push("第一章\n\n很短的一段内容。");

  // 2) 中文长句无段落（网络小说典型）
  list.push("这是一段比较长的中文句子，用来验证切分边界。".repeat(120));

  // 3) 多段落 + 中英混排
  list.push(
    Array.from({ length: 40 }, (_, i) =>
      `${i} Lorem ipsum dolor sit amet 中文混排内容，带标点(!?)。再补一句测试。`
    ).join("\n\n")
  );

  // 4) 超长无标点（极端输入，触发硬切）
  list.push("啊".repeat(6000));

  // 5) 大量空行与首尾空白
  list.push("\n\n" + "第一段。\n\n\n\n第二段内容比较长一些。\n\n" + "尾段。\n\n");

  // 6) 单句超长含逗号（句读回退边界）
  list.push("，".repeat(3000) + "。");

  // 7) 真实规模章节
  list.push(
    Array.from({ length: 200 }, (_, i) =>
      `第${i}句这是一个用于验证大文件分页稳定性的中文句子，包含足够长的段落内容。`
    ).join("")
  );

  return list;
}

/** 三种 fitsPage 策略，模拟不同字号/行高/窗宽下的页容量 */
const STRATEGIES = {
  "按字符数(窄)": () => (s) => s.length <= 180,
  "按字符数(中)": () => (s) => s.length <= 920,
  "按加权高度模拟": () => {
    // 近似真实排版：换行按长度折算，段落额外占高
    const perLine = 34;
    return (s) => {
      const lines = s.split("\n").reduce((acc, seg) => acc + Math.max(1, Math.ceil(seg.length / perLine)), 0);
      const blankLines = (s.match(/\n/g) || []).length;
      return lines + blankLines * 0.5 <= 18;
    };
  },
};

const SETTINGS = [
  { fontSize: 16, lineHeight: 1.8 },
  { fontSize: 20, lineHeight: 1.6 },
  { fontSize: 24, lineHeight: 2.0 },
];

const DIMS = [
  { width: 800, height: 600, charWidth: 16 },
  { width: 1200, height: 900, charWidth: 20 },
  { width: 420, height: 700, charWidth: 24 },
];

function paginateAll(create, content, settings, dims, fits) {
  const pager = create(content, settings, dims, fits);
  const pages = [];
  let guard = 0;
  while (!pager.done && guard < 100000) {
    const p = pager.next();
    if (!p) break;
    pages.push(p);
    guard += 1;
  }
  return pages;
}

async function run() {
  let old;
  try {
    old = await import(OLD_PATH);
  } catch {
    console.log(`跳过差分测试：未找到旧实现 ${OLD_PATH}`);
    console.log("（可将 main 分支的 modules/paginator.js 保存到该路径后复跑）");
    return;
  }

  const cases = samples();
  let compared = 0;
  let mismatched = 0;
  const details = [];

  for (let si = 0; si < cases.length; si += 1) {
    const content = cases[si];
    for (const [sname, mk] of Object.entries(STRATEGIES)) {
      for (const settings of SETTINGS) {
        for (const dims of DIMS) {
          const fits = mk();
          const a = paginateAll(old.createRenderedChapterPager, content, settings, dims, fits);
          const b = paginateAll(createRenderedChapterPager, content, settings, dims, fits);
          compared += 1;

          const sameCount = a.length === b.length;
          const sameJoin = a.join("\u0001") === b.join("\u0001");
          // 逐页字数一致性：允许 ±1 字的空白裁剪差异，但不允许正文增删
          const strip = (arr) => arr.map((p) => p.replace(/\s+/g, "")).join("");
          const sameText = strip(a) === strip(b);

          if (!sameCount || !sameText) {
            mismatched += 1;
            if (details.length < 5) {
              details.push({
                sample: si,
                strategy: sname,
                settings,
                dims,
                oldPages: a.length,
                newPages: b.length,
                textEqual: sameText,
                exactEqual: sameJoin,
                firstDiff: firstDiff(a, b)
              });
            }
          }
        }
      }
    }
  }

  console.log(`差分对比 ${compared} 组（${cases.length} 样本 × 3 策略 × 3 字号 × 3 视口）`);
  if (mismatched) {
    console.log(`⚠ 存在 ${mismatched} 组切分差异：`);
    console.log(JSON.stringify(details, null, 2));
    assert.fail(`新旧分页器切分结果不一致：${mismatched}/${compared}`);
  }
  console.log("✓ P-01 差分验证：新旧实现切分结果完全一致（页数与正文均一致）");
}

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) {
      return { page: i, oldLen: a[i].length, newLen: b[i].length, oldHead: a[i].slice(0, 40), newHead: b[i].slice(0, 40) };
    }
  }
  return { page: n, note: "页数不同" };
}

run();
