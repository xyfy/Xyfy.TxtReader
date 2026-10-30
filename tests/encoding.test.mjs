// FR-M2 编码兼容与防乱码：TC-M2-01 ~ TC-M2-04
//
// Node 侧只能做「解码正确性」验证（TextDecoder 的编码能力与浏览器一致），
// 端到端的「导入后界面无乱码」由手工用例覆盖。

import assert from "node:assert/strict";
import { decodeBuffer, detectEncoding, SUPPORTED_ENCODINGS } from "../modules/encoding.js";

const GBK_MAP = {
  中: "D6D0", 文: "CEC4", 第: "B5DA", 一: "D2BB", 章: "D5C2", 起: "C6F0", 点: "B5E3",
  这: "D5E2", 是: "CAC7", 段: "B6CE", 测: "B2E2", 试: "CAD4", 内: "C4DA", 容: "C8DD",
  用: "D3C3", 于: "D3DA", 验: "D1E9", 证: "D6A4", 编: "B1E0", 码: "C2EB", 探: "CCBD",
  夜: "D2B9", "，": "A3AC", "。": "A1A3", "！": "A3A1"
};

const SAMPLE = "第一章 起点\n这是一段中文测试内容，用于验证编码探测。";
const BOM_UTF8 = [0xef, 0xbb, 0xbf];
const BOM_UTF16LE = [0xff, 0xfe];
const BOM_UTF16BE = [0xfe, 0xff];

function gbkBytes(text) {
  const out = [];
  for (const ch of text) {
    if (GBK_MAP[ch]) {
      out.push(...GBK_MAP[ch].match(/../g).map((hex) => parseInt(hex, 16)));
      continue;
    }
    const code = ch.codePointAt(0);
    assert.ok(code < 0x80, `GBK 样本未收录字符：${ch}`);
    out.push(code);
  }
  return Uint8Array.from(out);
}

function utf16Bytes(text, bigEndian = false) {
  const le = Buffer.from(text, "utf16le");
  if (!bigEndian) {
    return Uint8Array.from(le);
  }
  const swapped = Buffer.from(le);
  for (let i = 0; i < swapped.length; i += 2) {
    const tmp = swapped[i];
    swapped[i] = swapped[i + 1];
    swapped[i + 1] = tmp;
  }
  return Uint8Array.from(swapped);
}

function concat(...parts) {
  const flat = parts.flatMap((part) => (Array.isArray(part) ? part : [...part]));
  return Uint8Array.from(flat);
}

function assertClean(text, label) {
  assert.ok(!text.includes("�"), `${label} 出现替换字符（乱码）：${text.slice(0, 40)}`);
  assert.ok(text.includes("第一章 起点"), `${label} 正文不正确：${text.slice(0, 40)}`);
}

function run() {
  // TC-M2-01：GBK 正文 + UTF-8 BOM（BOM 与真实编码不一致，必须回退到 GBK）
  const gbkWithBom = concat(BOM_UTF8, gbkBytes(SAMPLE));
  const bomResult = decodeBuffer(gbkWithBom);
  assert.equal(bomResult.encoding, "gb18030", "TC-M2-01 应回退识别为 gb18030");
  assertClean(bomResult.text, "TC-M2-01");
  assert.equal(bomResult.needsManual, false, "TC-M2-01 不应要求手动选择");
  console.log("✓ TC-M2-01 GBK+BOM 无乱码");

  // TC-M2-02：GBK 无 BOM
  const gbkPlain = decodeBuffer(gbkBytes(SAMPLE));
  assert.equal(gbkPlain.encoding, "gb18030", "TC-M2-02 应识别为 gb18030");
  assertClean(gbkPlain.text, "TC-M2-02");
  console.log("✓ TC-M2-02 GBK 无 BOM 正确识别");

  // TC-M2-03：UTF-16 LE / BE（带 BOM 与不带 BOM）
  const utf16LeBom = decodeBuffer(concat(BOM_UTF16LE, utf16Bytes(SAMPLE, false)));
  assert.equal(utf16LeBom.encoding, "utf-16le", "TC-M2-03 UTF-16LE(BOM) 识别错误");
  assertClean(utf16LeBom.text, "TC-M2-03 LE");

  const utf16BeBom = decodeBuffer(concat(BOM_UTF16BE, utf16Bytes(SAMPLE, true)));
  assert.equal(utf16BeBom.encoding, "utf-16be", "TC-M2-03 UTF-16BE(BOM) 识别错误");
  assertClean(utf16BeBom.text, "TC-M2-03 BE");

  // 无 BOM 的 UTF-16LE 也要能靠启发式认出来
  const utf16LeNoBom = decodeBuffer(utf16Bytes(SAMPLE, false));
  assert.equal(utf16LeNoBom.encoding, "utf-16le", "TC-M2-03 UTF-16LE(无 BOM) 识别错误");
  assertClean(utf16LeNoBom.text, "TC-M2-03 LE 无 BOM");
  console.log("✓ TC-M2-03 UTF-16 LE/BE 正确识别");

  // TC-M2-04：不可识别编码 → 提示并允许手动选择
  const garbage = Uint8Array.from(
    [0x9a, 0x8b, 0x7c, 0xff, 0xfe, 0x80, 0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0x07, 0x11, 0x9f, 0x8e]
  );
  const unknown = decodeBuffer(garbage);
  assert.equal(unknown.needsManual, true, "TC-M2-04 不可识别时应置 needsManual=true");
  assert.equal(unknown.confidence, "low", "TC-M2-04 置信度应为 low");
  assert.ok(
    SUPPORTED_ENCODINGS.every((enc) => unknown.candidates.includes(enc)),
    "TC-M2-04 应返回手动选择候选列表"
  );

  // 手动指定编码后必须能正常解出文本，且不再提示
  const manual = decodeBuffer(gbkBytes(SAMPLE), "gb18030");
  assert.equal(manual.encoding, "gb18030", "TC-M2-04 手动编码未生效");
  assert.equal(manual.confidence, "manual", "TC-M2-04 手动解码置信度应为 manual");
  assert.equal(manual.needsManual, false, "TC-M2-04 手动解码后不应再提示");
  assertClean(manual.text, "TC-M2-04 手动解码");
  console.log("✓ TC-M2-04 不可识别编码提示 + 手动选择可用");

  // 回归：常见编码不能被新逻辑带偏
  const utf8Text = new TextEncoder().encode(SAMPLE);
  const utf8Plain = decodeBuffer(utf8Text);
  assert.equal(utf8Plain.encoding, "utf-8", "UTF-8 无 BOM 应识别为 utf-8");
  assertClean(utf8Plain.text, "UTF-8 无 BOM");

  const utf8WithBom = decodeBuffer(concat(BOM_UTF8, utf8Text));
  assert.equal(utf8WithBom.encoding, "utf-8", "UTF-8 带 BOM 应识别为 utf-8");
  assert.equal(utf8WithBom.bom, "utf-8", "UTF-8 BOM 应被记录");
  assert.ok(!utf8WithBom.text.startsWith("﻿"), "解码结果不应残留 BOM 字符");
  assertClean(utf8WithBom.text, "UTF-8 带 BOM");

  const ascii = decodeBuffer(new TextEncoder().encode("Chapter 1 - hello world"));
  assert.equal(ascii.encoding, "utf-8", "纯 ASCII 应识别为 utf-8");
  assert.equal(ascii.text, "Chapter 1 - hello world", "ASCII 文本不应被改写");

  const empty = detectEncoding(new Uint8Array(0));
  assert.equal(empty.needsManual, false, "空文件不应要求手动选择");
  console.log("✓ 回归：UTF-8/ASCII/空文件未受新逻辑影响");

  console.log("encoding tests passed (TC-M2-01~04)");
}

run();
