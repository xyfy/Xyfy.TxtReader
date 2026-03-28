import assert from "node:assert/strict";
import { MESSAGES } from "../modules/i18n.js";

function run() {
  assert.equal(MESSAGES.en.extName, "Xyfy TXT Reader");
  assert.equal(MESSAGES.zh_CN.extName, "文本阅读器");
  assert.notEqual(MESSAGES.en.extName, MESSAGES.zh_CN.extName);

  assert.equal(MESSAGES.en.readerShortcutsDescArrows, "Switch chapters");
  assert.equal(MESSAGES.zh_CN.readerShortcutsDescArrows, "切换章节");

  assert.match(MESSAGES.en.readerSyncFallbackLocalOnly, /local storage only/);
  assert.match(MESSAGES.zh_CN.readerSyncFallbackLocalOnly, /本地存储/);

  assert.equal(MESSAGES.zh_CN.readerResetAction, "重置已选项");
  assert.equal(MESSAGES.en.readerResetAction, "Reset selected items");

  console.log("i18n tests passed");
}

run();