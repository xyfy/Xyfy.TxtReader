import assert from "node:assert/strict";
import {
  DEFAULT_KEYBINDINGS,
  READER_ACTIONS,
  detectKeybindingConflict,
  eventToBinding,
  formatActionBindings,
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
  assert.equal(formatBinding({ key: "ArrowDown" }), "↓");
  assert.equal(formatBinding({ key: "ArrowRight" }), "→");
  assert.equal(formatBinding({ key: "Escape" }), "Esc");
  assert.equal(formatBinding({ key: "[" }), "[");

  const binding = eventToBinding({ key: "a", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false });
  assert.deepEqual(binding, { key: "a", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false });

  assert.ok(Array.isArray(READER_ACTIONS) && READER_ACTIONS.includes("nextChapter"));
  assert.ok(DEFAULT_KEYBINDINGS.nextChapter && DEFAULT_KEYBINDINGS.nextChapter.length >= 1);

  // 方括号方向：`[` 向左回退、`]` 向右前进，与方向键语义一致
  assert.equal(matchKeyBinding({ key: "[" }), "prevChapter");
  assert.equal(matchKeyBinding({ key: "]" }), "nextChapter");
  assert.equal(matchKeyBinding({ key: "[", shiftKey: true }), null);
  // 新旧两条解析路径必须给出相同结果，防止其中一处回退导致行为反转
  assert.equal(resolveReaderKeyAction({ key: "[" }).action, matchKeyBinding({ key: "[" }));
  assert.equal(resolveReaderKeyAction({ key: "]" }).action, matchKeyBinding({ key: "]" }));
  assert.equal(resolveReaderKeyAction({ key: "[" }).action, "prevChapter");
  assert.equal(resolveReaderKeyAction({ key: "]" }).action, "nextChapter");

  // 多绑定展示：次要键位必须在界面上可见，否则重绑时会误以为只有主键
  assert.equal(formatActionBindings(DEFAULT_KEYBINDINGS, "nextChapter"), "→ / ]");
  assert.equal(formatActionBindings(DEFAULT_KEYBINDINGS, "prevChapter"), "← / [");
  assert.equal(formatActionBindings({}, "nextChapter"), "");
  assert.equal(formatActionBindings({ nextChapter: [] }, "nextChapter"), "");

  console.log("keyboard map tests passed");
}

run();