// 设置面板模块的结构校验：动作标签必须覆盖全部可重绑动作，且中英文都齐全。
// 以前这类映射散落在主文件里，新增动作很容易漏掉标签，导致界面上直接显示英文键名。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { READER_ACTIONS } from "../modules/keyboard-map.js";
import { ACTION_LABEL_KEY } from "../reader/reader-settings-panel.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const i18n = readFileSync(path.join(root, "modules/i18n.js"), "utf8");

for (const action of READER_ACTIONS) {
  assert.ok(ACTION_LABEL_KEY[action], `动作 ${action} 缺少界面标签映射`);
}

for (const [action, key] of Object.entries(ACTION_LABEL_KEY)) {
  assert.ok(READER_ACTIONS.includes(action), `标签映射里的 ${action} 不是有效动作`);
  const hits = i18n.match(new RegExp(`\\b${key}:`, "g")) || [];
  assert.equal(hits.length, 2, `i18n: ${key} 应同时存在中英文两份（实际 ${hits.length}）`);
}

// 模块应只导出控制器工厂与标签映射，避免又长成一个杂物抽屉
const source = readFileSync(path.join(root, "reader/reader-settings-panel.js"), "utf8");
const exports = [...source.matchAll(/export (?:const|function) (\w+)/g)].map((m) => m[1]);
assert.deepEqual(exports.sort(), ["ACTION_LABEL_KEY", "createSettingsPanel"].sort(), "导出面应保持最小");

console.log(`reader settings panel tests passed (${READER_ACTIONS.length} actions)`);
