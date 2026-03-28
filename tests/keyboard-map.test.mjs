import assert from "node:assert/strict";
import { resolveReaderKeyAction } from "../modules/keyboard-map.js";

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

  console.log("keyboard map tests passed");
}

run();