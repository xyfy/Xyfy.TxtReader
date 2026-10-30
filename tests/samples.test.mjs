// v0.6 测试样本集校验：把第二节 9 类样本真实跑一遍
// 解码（FR-M2）→ 分章（FR-M3）→ 分页（FR-M1）→ 边界判定（FR-M4）全链路。
//
// 与手工用例的分工：这里保证「机器可判定的部分」不退化（编码探测、章节数、
// 乱码字符、分页不溢出）；「界面上看到什么」仍由手工用例覆盖。

import assert from "node:assert/strict";
import { buildSampleSet } from "./sample-set.mjs";
import { decodeBuffer } from "../modules/encoding.js";
import { parseChaptersWithMeta } from "../modules/chapter-parser.js";
import { collectPages, createRenderedChapterPager } from "../modules/paginator.js";
import { getDefaultSettings } from "../modules/storage.js";
import {
  describeImportError,
  ERROR_KINDS,
  READER_STATES,
  resolveReaderViewState
} from "../modules/reader-view-state.js";

// 分页用的假排版测量：按字符数估算，够用来验证「不溢出 / 不空白」
const PAGE_CHARS = 900;
function fitsPage(text) {
  return text.length <= PAGE_CHARS;
}

function firstScreenPages(content) {
  const pager = createRenderedChapterPager(content, getDefaultSettings(), null, fitsPage);
  const { pages, generated } = collectPages(pager, { requiredCount: Infinity, maxPages: 32 });
  return { pages, generated, done: pager.done };
}

function run() {
  const samples = buildSampleSet();
  const byName = new Map(samples.map((sample) => [sample.name, sample]));

  // 九类样本必须齐全：测试计划第二节逐条核对
  const categories = new Set(samples.map((sample) => sample.category));
  const requiredCategories = [
    "小文件",
    "大文件",
    "GBK + BOM",
    "GBK 无 BOM",
    "UTF-16 LE + BOM",
    "UTF-16 BE + BOM",
    "UTF-8 + BOM",
    "无章节标记",
    "超长单段落",
    "损坏 / 非 TXT",
    "空文件"
  ];
  for (const category of requiredCategories) {
    assert.ok(categories.has(category), `样本集缺少类别：${category}`);
  }
  console.log("✓ 9 类样本齐全（共 11 个文件）");

  // 小文件主流程：UTF-8 无 BOM、20 章、无乱码
  const small = byName.get("01-small-utf8-nobom.txt");
  const smallDecoded = decodeBuffer(small.bytes);
  assert.equal(smallDecoded.encoding, "utf-8", "小文件应识别为 UTF-8");
  assert.equal(smallDecoded.needsManual, false, "小文件不应要求手动选编码");
  const smallMeta = parseChaptersWithMeta(smallDecoded.text);
  assert.equal(smallMeta.isFallback, false, "有「第X章」标记的书不应走兜底");
  assert.equal(smallMeta.chapters.length, 20, `小文件应分出 20 章，实际 ${smallMeta.chapters.length}`);
  assert.ok(smallMeta.chapters[0].title.includes("第一章"), "首章标题不正确");
  console.log("✓ 01 小文件主流程：UTF-8 / 20 章 / 无乱码");

  // 大文件：首屏分页受上限约束，且能续着往下生成
  const large = byName.get("02-large-utf8.txt");
  assert.ok(large.bytes.byteLength > 1024 * 1024, "大文件样本应大于 1 MB");
  const largeDecoded = decodeBuffer(large.bytes);
  assert.equal(largeDecoded.encoding, "utf-8", "大文件应识别为 UTF-8");
  const largeMeta = parseChaptersWithMeta(largeDecoded.text);
  assert.ok(largeMeta.chapters.length >= 20, "大文件章节数过少");
  const started = Date.now();
  const first = firstScreenPages(largeMeta.chapters[0].content);
  const elapsed = Date.now() - started;
  assert.ok(first.generated <= 32, `首屏分页应受 32 页上限约束，实际 ${first.generated}`);
  assert.ok(elapsed < 3000, `大文件首章首屏耗时 ${elapsed}ms，超过 3s`);
  console.log(`✓ 02 大文件（${(large.bytes.byteLength / 1024 / 1024).toFixed(2)} MB）：首屏 ${first.generated} 页 / ${elapsed}ms`);

  // GBK 两类：BOM 与正文不符时也要解出正确中文
  for (const name of ["03-gbk-with-utf8-bom.txt", "04-gbk-nobom.txt"]) {
    const sample = byName.get(name);
    const decoded = decodeBuffer(sample.bytes);
    assert.ok(
      decoded.encoding === "gb18030" || decoded.encoding === "gbk" || decoded.encoding === "gb2312",
      `${name} 应识别为 GB 系编码，实际 ${decoded.encoding}`
    );
    assert.ok(!decoded.text.includes("�"), `${name} 解码出现替换字符（乱码）`);
    assert.ok(decoded.text.includes("第一章"), `${name} 正文不正确`);
    // BOM 样本：剥离后正文开头不应残留 BOM 字符
    assert.ok(!decoded.text.startsWith("﻿"), `${name} 正文残留 BOM`);
    console.log(`✓ ${name}：识别为 ${decoded.encoding}，正文无乱码`);
  }

  // UTF-16 两类
  for (const [name, expected] of [
    ["05-utf16le-bom.txt", "utf-16le"],
    ["06-utf16be-bom.txt", "utf-16be"]
  ]) {
    const sample = byName.get(name);
    const decoded = decodeBuffer(sample.bytes);
    assert.equal(decoded.encoding, expected, `${name} 应识别为 ${expected}，实际 ${decoded.encoding}`);
    assert.ok(decoded.text.includes("第一章"), `${name} 正文不正确`);
    assert.ok(!decoded.text.includes("�"), `${name} 解码出现替换字符`);
    console.log(`✓ ${name}：识别为 ${decoded.encoding}，正文无乱码`);
  }

  // UTF-8 + BOM：BOM 必须被剥离
  const bomSample = byName.get("07-utf8-bom.txt");
  const bomDecoded = decodeBuffer(bomSample.bytes);
  assert.equal(bomDecoded.encoding, "utf-8", "UTF-8 BOM 样本应识别为 UTF-8");
  assert.ok(!bomDecoded.text.startsWith("﻿"), "UTF-8 BOM 未剥离");
  assert.ok(bomDecoded.text.includes("第一章"), "UTF-8 BOM 样本正文不正确");
  console.log("✓ 07 UTF-8 + BOM：BOM 已剥离，正文正确");

  // 无章节标记：走兜底平铺，且每个切分点都必须落在段落边界上
  const flatSample = byName.get("08-no-chapters.txt");
  const flatDecoded = decodeBuffer(flatSample.bytes);
  const flatMeta = parseChaptersWithMeta(flatDecoded.text);
  assert.equal(flatMeta.isFallback, true, "无章节标记的书应走兜底平铺");
  assert.ok(flatMeta.chapters.length >= 4, `兜底平铺应分出多部分，实际 ${flatMeta.chapters.length}`);
  for (const chapter of flatMeta.chapters) {
    const raw = flatDecoded.text.slice(chapter.start, chapter.end);
    const trimmedRight = raw.replace(/\s+$/, "");
    assert.ok(
      trimmedRight.endsWith("。") || trimmedRight.endsWith("！"),
      `兜底切分把段落切成了两半：…${trimmedRight.slice(-12)}`
    );
  }
  console.log(`✓ 08 无章节标记：兜底平铺 ${flatMeta.chapters.length} 部分，未切断段落`);

  // 超长单段落：分页不溢出、不产生空页
  const longSample = byName.get("09-long-paragraph.txt");
  const longDecoded = decodeBuffer(longSample.bytes);
  const longMeta = parseChaptersWithMeta(longDecoded.text);
  // 整篇无换行也就没有章节标记，走兜底平铺是预期行为；关键是内容不能丢
  assert.equal(longMeta.isFallback, true, "整篇无换行必然走兜底平铺");
  const joined = longMeta.chapters.map((chapter) => chapter.content).join("");
  assert.equal(
    joined.length,
    longDecoded.text.trim().length,
    "兜底平铺后正文长度应与原文一致（内容丢失或重复）"
  );
  // 逐块分页，全程校验「不溢出、不空白」，同时验证首屏生成量受上限约束
  let totalPages = 0;
  for (const chapter of longMeta.chapters) {
    const pager = createRenderedChapterPager(chapter.content, getDefaultSettings(), null, fitsPage);
    let guard = 0;
    while (!pager.done) {
      const { pages, generated } = collectPages(pager, { requiredCount: Infinity, maxPages: 32 });
      assert.ok(generated > 0, "分页器未产出页面却未标记完成（死循环风险）");
      for (const page of pages) {
        assert.ok(page.trim().length > 0, "出现空白页");
        assert.ok(fitsPage(page), `单页内容溢出：${page.length} 字符`);
      }
      totalPages += pages.length;
      guard += 1;
      assert.ok(guard < 100, "分页未收敛（疑似死循环）");
    }
  }

  // 首屏上限：任何一次收集都不得超过 32 页
  const firstPager = createRenderedChapterPager(longMeta.chapters[0].content, getDefaultSettings(), null, fitsPage);
  const firstBatch = collectPages(firstPager, { requiredCount: Infinity, maxPages: 32 });
  assert.ok(firstBatch.generated <= 32, `首屏单次生成应 ≤ 32 页，实际 ${firstBatch.generated}`);
  assert.ok(totalPages > 500, `超长段落应切出大量页面，实际 ${totalPages}`);
  console.log(
    `✓ 09 超长单段落（${longDecoded.text.length} 字符）：共 ${totalPages} 页，无溢出无空白，单次生成 ≤ 32 页`
  );

  // 损坏 / 非 TXT：不可识别，必须提示手动选编码
  const corrupt = byName.get("10-corrupt-bytes.bin");
  const corruptDecoded = decodeBuffer(corrupt.bytes);
  assert.equal(corruptDecoded.needsManual, true, "随机字节应判定为不可识别并提示手动选编码");
  const corruptError = describeImportError({ error: { name: "EncodingError", message: "无法识别文件编码" }, needsEncodingChoice: true });
  assert.equal(corruptError.kind, ERROR_KINDS.ENCODING, "不可识别编码应进入编码错误态");
  assert.equal(
    resolveReaderViewState({ isLoading: false, error: corruptError, hasBook: false, needsEncodingChoice: true }),
    READER_STATES.ERROR,
    "编码不可识别时应落到错误态（界面据此给出手动选择入口）"
  );
  console.log("✓ 10 损坏/非 TXT：判定为不可识别编码并给出手动选择入口");

  // 空文件：进入空文件错误态而非崩溃
  const empty = byName.get("11-empty.txt");
  assert.equal(empty.bytes.byteLength, 0, "空文件样本必须是 0 字节");
  const emptyDecoded = decodeBuffer(empty.bytes);
  assert.equal(emptyDecoded.text, "", "空文件解码结果应为空串");
  const emptyError = describeImportError({ error: { name: "EmptyFileError", message: "文件为空" } });
  assert.equal(emptyError.kind, ERROR_KINDS.EMPTY_FILE, "空文件应进入空文件错误态");
  assert.ok(emptyError.detail.length > 0, "空文件错误态应有可读提示");
  assert.equal(
    resolveReaderViewState({ isLoading: false, error: emptyError, hasBook: false }),
    READER_STATES.ERROR,
    "空文件应落到错误态而非空态或阅读态"
  );
  console.log("✓ 11 空文件：进入空文件错误态并给出提示");

  // 样本集本身必须确定性可复现：两次构造字节完全一致
  const again = buildSampleSet();
  for (const sample of again) {
    const original = byName.get(sample.name);
    assert.equal(sample.bytes.byteLength, original.bytes.byteLength, `${sample.name} 两次生成大小不一致`);
    assert.ok(
      Buffer.compare(Buffer.from(sample.bytes), Buffer.from(original.bytes)) === 0,
      `${sample.name} 两次生成字节不一致（样本不可复现）`
    );
  }
  console.log("✓ 样本集确定性可复现（两次构造字节一致）");

  console.log("sample set tests passed");
}

run();
