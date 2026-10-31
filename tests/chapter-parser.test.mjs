// FR-M3 章节识别与无目录书兜底：TC-M3-01 / TC-M3-02

import assert from "node:assert/strict";
import { parseChapters, parseChaptersWithMeta } from "../modules/chapter-parser.js";

function buildStandardBook() {
  return [
    "第一章 起点",
    "这是第一章的正文内容，描述主角出发前的准备。",
    "",
    "第二章 旅途",
    "这是第二章的正文内容，主角踏上了未知的旅途。",
    "",
    "第三章 归来",
    "这是第三章的正文内容，故事在此告一段落。"
  ].join("\n");
}

function buildParagraphs(count, size = 400) {
  const paragraphs = [];
  for (let i = 0; i < count; i += 1) {
    // 每段用固定种子填充，保证段落内容可精确断言
    paragraphs.push(`段落${i}开头 ${"内容".repeat(size)} 段落${i}结尾`);
  }
  return paragraphs;
}

function run() {
  // TC-M3-01：标准「第X章」样本准确分章
  const standard = parseChaptersWithMeta(buildStandardBook());
  assert.equal(standard.isFallback, false, "TC-M3-01 有章节标记时不应走兜底");
  assert.equal(standard.chapters.length, 3, "TC-M3-01 应切出 3 章");
  assert.equal(standard.chapters[0].title, "第一章 起点", "第一章标题不符");
  assert.equal(standard.chapters[1].title, "第二章 旅途", "第二章标题不符");
  assert.equal(standard.chapters[2].title, "第三章 归来", "第三章标题不符");
  assert.ok(
    standard.chapters[1].content.includes("未知的旅途"),
    "TC-M3-01 第二章正文被切错"
  );
  assert.ok(
    !standard.chapters[1].content.includes("第一章"),
    "TC-M3-01 章节之间不应互相串内容"
  );
  console.log("✓ TC-M3-01 标准「第X章」准确分章（3 章）");

  // 英文 Chapter 与序章类标题也要能识别
  const english = parseChaptersWithMeta(
    ["Chapter 1 Begin", "one", "", "Chapter 2 Middle", "two", "", "Chapter 3 End", "three"].join("\n")
  );
  assert.equal(english.isFallback, false, "英文 Chapter 标题应被识别");
  assert.equal(english.chapters.length, 3, "英文样本应切出 3 章");

  const special = parseChaptersWithMeta(
    ["楔子", "引子内容", "", "第一章 正文", "正文内容", "", "尾声", "结尾内容"].join("\n")
  );
  assert.equal(special.isFallback, false, "序章/尾声类标题应被识别");
  // 三种标题形态混排，命中同一条正则才算「一组章节」，不是各算各的
  assert.equal(special.chapters.length, 2, `含楔子/尾声样本应切出 2 章，实际 ${special.chapters.length}`);
  assert.deepEqual(special.chapters.map((c) => c.title), ["楔子", "尾声"]);
  console.log("✓ 英文 Chapter 与序章/尾声标题可识别");

  // 防护：正文里带「第X章」的长句不应该被当成标题
  const longLine = `第一章 ${"很长的正文".repeat(30)}`;
  const noise = parseChaptersWithMeta([longLine, "", longLine].join("\n"));
  assert.equal(noise.isFallback, true, "超长「标题行」应被判为正文而非章节");

  // 边界：60 字以内但「第X章 + 一句话正文」的行也不能当目录项
  // （真人小说常见「第3章 他走了很久，直到……」这种把正文粘在章节号后的写法，
  //   一旦命中，几十万字的书会切出两万多章，目录渲染直接卡死）
  const gluedLine = `第0章${"这是一段叙述。".repeat(6)}`; // 45 字，落在行尾长度上限内
  assert.ok(gluedLine.length < 61, "构造样本应落在 60 字上限内");
  const glued = parseChaptersWithMeta(
    ["第1章 起点", "正文一", "", gluedLine, "", "第2章 转折", "正文二"].join("\n")
  );
  assert.equal(glued.chapters.length, 2, `粘着正文的章节行不应成为目录项，实际切出 ${glued.chapters.length} 章`);
  assert.deepEqual(glued.chapters.map((c) => c.title), ["第1章 起点", "第2章 转折"]);

  // 合法的写法不能被误伤：章节号后接空格 / 冒号 / 顿号 / 书名号都能识别
  for (const title of ["第7章 归途", "第8章：夜行", "第9章、旧约", "第10章「末路」", "第11章"]) {
    const ok = parseChaptersWithMeta([title, "正文", "", `${title} 之二`, "正文二"].join("\n"));
    assert.equal(ok.chapters.length, 2, `「${title}」是合法章节标题，应被识别`);
  }
  console.log("✓ 超长标题行不会被误判为章节（含「第X章+正文」粘在一行）");

  // TC-M3-02：无章节标记的小说 → 平铺可读 + 提示（isFallback）
  const paragraphs = buildParagraphs(40, 400);
  const noTocText = paragraphs.join("\n\n");
  const flat = parseChaptersWithMeta(noTocText);

  assert.equal(flat.isFallback, true, "TC-M3-02 无章节标记时应标记 isFallback 供界面提示");
  assert.ok(flat.chapters.length >= 2, "TC-M3-02 平铺应产生多个可翻页部分");

  // 平铺不能把段落切成两半：每个段落必须完整出现在某一个分块里
  const joined = flat.chapters.map((chapter) => chapter.content).join("\n\n");
  for (const paragraph of paragraphs) {
    assert.ok(
      joined.includes(paragraph),
      `TC-M3-02 段落被切断：${paragraph.slice(0, 12)}…`
    );
  }
  console.log(`✓ TC-M3-02 无目录书平铺 ${flat.chapters.length} 部分，段落未被切断`);

  // 平铺时每一块的开头都应是段落开头（不从中途起头）
  for (const chapter of flat.chapters.slice(1)) {
    assert.match(chapter.content, /^段落\d+开头/, "TC-M3-02 分块应起始于段落开头");
  }

  // 边界：空文本与单章
  const empty = parseChapters("");
  assert.ok(Array.isArray(empty), "空文本应返回数组");
  assert.equal(empty.length, 0, "空文本不应产生章节");

  const single = parseChaptersWithMeta("第一章 唯一\n只有一章的内容。");
  assert.equal(single.isFallback, true, "只有一处章节标记时应走兜底（不足以成目录）");
  assert.ok(single.chapters.length >= 1, "单章样本应至少产生一个可读块");
  console.log("✓ 边界：空文本 / 单章样本不崩溃");

  // 兼容性别回归：parseChapters 仍然只返回数组
  assert.ok(Array.isArray(parseChapters(buildStandardBook())), "parseChapters 应仍返回数组");

  console.log("chapter parser tests passed (TC-M3-01~02)");
}

run();
