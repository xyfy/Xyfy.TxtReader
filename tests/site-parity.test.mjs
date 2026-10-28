// 站点版与扩展版页面一致性检查
//
// reader/reader.html（扩展）与 web/index.html（站点）是同一份界面的两份副本，
// 只有资源路径前缀不同。历史上曾因手工同步遗漏，导致站点上新控件缺失但扩展里有，
// 表现就是「某个设置项在网页版看不到、点不了」。
//
// 本测试断言两份页面的元素 id 完全一致，任何一边新增/删除元素而忘了同步都会失败。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

function collectIds(html) {
  return [...new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]))].sort();
}

function run() {
  const readerHtml = read("reader/reader.html");
  const webHtml = read("web/index.html");

  const readerIds = collectIds(readerHtml);
  const webIds = collectIds(webHtml);

  const onlyInReader = readerIds.filter((id) => !webIds.includes(id));
  const onlyInWeb = webIds.filter((id) => !readerIds.includes(id));

  assert.deepEqual(
    onlyInReader,
    [],
    `web/index.html 缺少这些元素，请同步：${onlyInReader.join(", ")}`
  );
  assert.deepEqual(
    onlyInWeb,
    [],
    `reader/reader.html 缺少这些元素，请同步：${onlyInWeb.join(", ")}`
  );

  // 关键控件必须两边都有，防止以后被误删
  const requiredControls = [
    "file-input",
    "theme-select",
    "theme-color-grid",
    "color-locked-hint",
    "switch-to-custom",
    "reset-colors",
    "shortcut-list",
    "shortcut-help-list",
    "settings-toggle",
    "custom-font"
  ];
  for (const id of requiredControls) {
    assert.ok(readerIds.includes(id), `reader/reader.html 缺少关键控件 #${id}`);
    assert.ok(webIds.includes(id), `web/index.html 缺少关键控件 #${id}`);
  }

  console.log(`site parity tests passed (${readerIds.length} ids)`);
}

run();
