// 设置面板结构回归：顶部快捷导航与分区必须一一对应，云备份折叠关系必须自洽。
// 目的：防止以后新增/删除设置分区时只改 HTML 忘了改导航，导致点了没反应。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const DOCS = ["reader/reader.html", "web/index.html"];

function navTargets(html) {
  return [...html.matchAll(/<button[^>]*settings-nav-chip[^>]*>/g)].map((m) => {
    const target = /\bdata-target="([^"]+)"/.exec(m[0]);
    return target ? target[1] : null;
  });
}

function sectionIds(html) {
  return [...html.matchAll(/<section[^>]*class="[^"]*settings-section[^"]*"[^>]*>/g)].map((m) => {
    const id = /\bid="([^"]+)"/.exec(m[0]);
    return id ? id[1] : null;
  });
}

for (const doc of DOCS) {
  const html = read(doc);

  const targets = navTargets(html);
  const ids = sectionIds(html);

  assert.ok(targets.length >= 5, `${doc}: 快捷导航项过少（${targets.length}）`);
  assert.ok(!targets.includes(null), `${doc}: 存在缺少 data-target 的导航项`);
  assert.ok(!ids.includes(null), `${doc}: 存在缺少 id 的 settings-section`);
  assert.deepEqual(targets, ids, `${doc}: 导航顺序与分区顺序不一致`);

  // 每个导航目标都必须真的指向本文件里的一个元素
  for (const target of targets) {
    assert.ok(html.includes(`id="${target}"`), `${doc}: 导航目标 #${target} 在文档中不存在`);
  }

  // 云备份折叠：aria-controls 指到 body，初始收起
  const toggle = /<button[^>]*id="cloud-section-toggle"[^>]*>/.exec(html);
  assert.ok(toggle, `${doc}: 缺少云备份折叠按钮`);
  const controls = /\baria-controls="([^"]+)"/.exec(toggle[0]);
  assert.ok(controls, `${doc}: 云备份折叠按钮缺少 aria-controls`);
  assert.equal(controls[1], "cloud-section-body", `${doc}: aria-controls 目标应为 cloud-section-body`);
  assert.ok(html.includes('aria-expanded="false"'), `${doc}: 云备份默认应为收起态`);
  assert.ok(
    new RegExp(`id="${controls[1]}"[^>]*class="[^"]*is-collapsed`).test(html),
    `${doc}: 云备份内容区缺少初始 is-collapsed`
  );

  assert.ok(html.includes('id="shortcut-list"'), `${doc}: 缺少快捷键列表容器`);
  assert.ok(html.includes('id="settings-nav"'), `${doc}: 缺少快捷导航容器`);

  // 关闭按钮必须与导航同处吸顶容器，否则面板一滚就找不到关闭入口
  const stickyAt = html.indexOf('class="settings-sticky"');
  const closeAt = html.indexOf('id="settings-close"');
  const navAt = html.indexOf('id="settings-nav"');
  assert.ok(stickyAt > -1, `${doc}: 缺少吸顶容器`);
  assert.ok(closeAt > stickyAt && closeAt < navAt, `${doc}: 关闭按钮未纳入吸顶容器`);
  assert.ok(navAt > stickyAt, `${doc}: 快捷导航未纳入吸顶容器`);
}

// 两份副本的 id 集合必须完全一致（site-parity 已覆盖，这里保证导航结构也一致）
assert.deepEqual(sectionIds(read(DOCS[0])), sectionIds(read(DOCS[1])), "两份 HTML 的分区 id 不一致");

const css = read("reader/reader.css");
assert.ok(/\.settings-sticky\s*\{[^}]*position:\s*sticky/.test(css), "CSS: 标题与导航容器应吸顶");
assert.ok(/\.settings-nav\s*\{[^}]*display:\s*flex/.test(css), "CSS: 快捷导航应为横向 chip 布局");
assert.ok(/\.shortcut-list\s*\{[^}]*grid-template-columns:\s*repeat\(2/.test(css), "CSS: 快捷键应为两列");
assert.ok(!/#cloud-section\b/.test(css), "CSS: 仍残留旧的 #cloud-section 选择器");
assert.ok(/\.settings-collapsible\.is-collapsed\s*\{[^}]*display:\s*none/.test(css), "CSS: 折叠态应隐藏内容");

const js = read("reader/reader.js");
assert.ok(/settingsPanel\.init\(\)/.test(js), "JS: 主流程未初始化设置面板控制器");
assert.ok(/settingsPanel\.prepareOpen\(\)/.test(js), "JS: 打开设置面板未走控制器");
assert.ok(/settingsPanel\.setCloudExpanded\(settingsPanel\.isCloudExpanded\(\)\)/.test(js), "JS: 切语言后未同步折叠提示");

// 面板逻辑应在独立模块里，不许再堆回主文件
const panel = read("reader/reader-settings-panel.js");
assert.ok(/export function createSettingsPanel\s*\(/.test(panel), "模块: 缺少 createSettingsPanel 工厂");
assert.ok(/function scrollToSection\s*\(/.test(panel), "模块: 缺少分区滚动定位");
assert.ok(/function syncActiveChip\s*\(/.test(panel), "模块: 缺少导航高亮同步");
assert.ok(!/^function initSettingsPanel/m.test(js), "JS: 设置面板逻辑不应仍留在主文件");

const i18n = read("modules/i18n.js");
for (const key of ["navGeneral", "navBackup", "navFont", "navColor", "navShortcuts", "navCloud", "cloudExpand", "cloudCollapse"]) {
  const hits = i18n.match(new RegExp(`\\b${key}:`, "g")) || [];
  assert.equal(hits.length, 2, `i18n: ${key} 应同时存在中英文两份（实际 ${hits.length}）`);
}

console.log(`settings panel tests passed (${navTargets(read(DOCS[0])).length} sections)`);
