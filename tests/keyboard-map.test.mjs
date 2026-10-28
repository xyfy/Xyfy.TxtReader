import assert from "node:assert/strict";
import {
  DEFAULT_KEYBINDINGS,
  READER_ACTIONS,
  detectKeybindingConflict,
  eventToBinding,
  formatBinding,
  matchKeyBinding,
  resolveReaderKeyAction
} from "../modules/keyboard-map.js";

function run() {
  assert.equal(resolveReaderKeyAction({ key: "ArrowRight" }).action, "nextChapter");
  assert.equal(resolveReaderKeyAction({ key: "ArrowLeft" }).action, "prevChapter");
  assert.equal(resolveReaderKeyAction({ key: "ArrowLeft", altKey: true }), null);
  assert.equal(resolveReaderKeyAction({ key: "ArrowRight", ctrlKey: true }), null);
  assert.equal(resolveReaderKeyAction({ key: "ArrowLeft", metaKey: true }), null);

  assert.equal(resolveReaderKeyAction({ key: " ", shiftKey: false }).action, "nextPage");
  assert.equal(resolveReaderKeyAction({ key: " ", shiftKey: true }).action, "prevPage");

  assert.equal(resolveReaderKeyAction({ key: "j", isScrollMode: false }).action, "nextPage");
  assert.equal(resolveReaderKeyAction({ key: "k", isScrollMode: false }).action, "prevPage");
  assert.equal(resolveReaderKeyAction({ key: "j", isScrollMode: true }), null);

  assert.equal(resolveReaderKeyAction({ key: "ArrowDown", isScrollMode: true }).action, "scrollLineDown");
  assert.equal(resolveReaderKeyAction({ key: "ArrowUp", isScrollMode: true }).action, "scrollLineUp");

  assert.equal(resolveReaderKeyAction({ key: "?" }).action, "openShortcuts");
  assert.equal(resolveReaderKeyAction({ key: "h" }).action, "openShortcuts");
  assert.equal(resolveReaderKeyAction({ key: "Escape", shortcutsOpen: true }).action, "closeShortcuts");
  assert.equal(resolveReaderKeyAction({ key: "Escape", shortcutsOpen: false }), null);

  assert.equal(resolveReaderKeyAction({ key: "d", altKey: true }).action, "toggleDebug");
  assert.equal(resolveReaderKeyAction({ key: "Tab" }).action, "togglePanel");
  assert.equal(resolveReaderKeyAction({ key: "b" }).action, "bookmark");

  // 新增：可配置键位匹配 / 冲突检测 / 格式化
  assert.equal(matchKeyBinding({ key: "ArrowRight" }), "nextChapter");
  assert.equal(matchKeyBinding({ key: " " }), "nextPage");
  assert.equal(matchKeyBinding({ key: " ", shiftKey: true }), "prevPage");
  assert.equal(matchKeyBinding({ key: "b" }), "bookmark");
  assert.equal(matchKeyBinding({ key: "d", altKey: true }), "toggleDebug");
  // Escape 为不可重绑的保护性动作，不参与匹配
  assert.equal(matchKeyBinding({ key: "Escape" }), null);

  // 冲突检测：Tab 已被 togglePanel 占用
  assert.equal(detectKeybindingConflict("nextChapter", { key: "Tab" }), "togglePanel");
  // 与自身默认键位相同不算冲突
  assert.equal(detectKeybindingConflict("nextChapter", { key: "ArrowRight" }), null);
  // closeShortcuts 受保护，永不报冲突
  assert.equal(detectKeybindingConflict("closeShortcuts", { key: "x" }), null);

  assert.equal(formatBinding({ key: " ", shiftKey: true }), "Shift+Space");
  assert.equal(formatBinding({ key: "d", altKey: true }), "Alt+D");
  assert.equal(formatBinding({ key: "ArrowDown" }), "ArrowDown");

  const binding = eventToBinding({ key: "a", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false });
  assert.deepEqual(binding, { key: "a", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false });

  assert.ok(Array.isArray(READER_ACTIONS) && READER_ACTIONS.includes("nextChapter"));
  assert.ok(DEFAULT_KEYBINDINGS.nextChapter && DEFAULT_KEYBINDINGS.nextChapter.length >= 1);

  console.log("keyboard map tests passed");
}

run();