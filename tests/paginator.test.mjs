import assert from "node:assert/strict";
import { paginateChapter } from "../modules/paginator.js";

function makeSettings(fontSize = 18) {
  return {
    fontSize,
    lineHeight: 1.8,
    animationStyle: "slide",
    animationIntensity: 2
  };
}

function run() {
  const basic = paginateChapter("第一章\n\n这是一段内容。", makeSettings());
  assert.ok(basic.length >= 1, "basic pagination should yield at least one page");

  const longSentence = "这是一段很长的文字，".repeat(700);
  const longPages = paginateChapter(longSentence, makeSettings(20));
  assert.ok(longPages.length > 1, "long text should paginate into multiple pages");
  assert.ok(longPages.at(-1).length > 120, "tail page should not be too short");

  const mixedParagraphs = paginateChapter("甲\n\n乙\n\n丙\n\n丁", makeSettings(24));
  assert.ok(mixedParagraphs.length >= 1, "multi paragraph should still paginate");

  const noContent = paginateChapter("\n\n", makeSettings());
  assert.equal(noContent.length, 1, "empty input should still produce one page");

  console.log("paginator tests passed");
}

run();
