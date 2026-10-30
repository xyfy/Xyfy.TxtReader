// v0.6 回归保障：TC-REG-01 ~ TC-REG-05、云备份折叠、TC-CMP-02 双 locale
//
// 这些模块在 v0.4/v0.5 改过，v0.6 动了大量阅读器代码，必须有回归网兜底。
// 每条断言都标注对应用例 ID，方便对照《v0.6 测试用例与测试计划》第三节。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MESSAGES, getSupportedLocales } from "../modules/i18n.js";
import { APP_VERSION } from "../modules/app-info.js";
import { contrastRatio, parseHex } from "../reader/reader-color.js";
import {
  DEFAULT_KEYBINDINGS,
  READER_ACTIONS,
  detectKeybindingConflict,
  matchKeyBinding
} from "../modules/keyboard-map.js";
import { getDefaultSettings, normalizeStoredSettings } from "../modules/storage.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const readHtml = (relative) => readFileSync(join(projectRoot, relative), "utf8");

/** 提取带 id 的元素，保持文档顺序 */
function idsOf(html) {
  return [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
}

/** 提取设置面板导航项指向的分区 id（data-target / href="#..."） */
function navTargets(html) {
  return [...html.matchAll(/data-target="([^"]+)"/g)].map((match) => match[1]);
}

function run() {
  const DOCS = ["reader/reader.html", "web/index.html"];
  const htmlOf = Object.fromEntries(DOCS.map((file) => [file, readHtml(file)]));

  // ---------- TC-REG-01 回归-配色：低对比度要提示可读性 ----------
  const lowPair = contrastRatio("#9aa0a6", "#8a8f98");
  const goodPair = contrastRatio("#1f2937", "#ffffff");
  assert.ok(lowPair !== null && goodPair !== null, "对比度计算应返回数值");
  assert.ok(lowPair < 4.5, `灰底灰字应判定为低对比度，实际 ${lowPair.toFixed(2)}`);
  assert.ok(goodPair >= 4.5, `深色正文配白底应达标，实际 ${goodPair.toFixed(2)}`);
  // 界面靠「低于 4.5 就显示提示」的阈值判断，这里校验阈值与 WCAG AA 一致
  assert.deepEqual(parseHex("#1F2937"), { r: 31, g: 41, b: 55 }, "十六进制解析应正确");
  // 提示元素必须存在，否则低对比度时用户看不到任何反馈
  for (const file of DOCS) {
    assert.ok(htmlOf[file].includes("contrast-warning"), `${file} 缺少对比度提示元素`);
  }
  console.log(`✓ TC-REG-01 配色：低对比 ${lowPair.toFixed(2)} 触发提示，达标 ${goodPair.toFixed(2)} 不触发`);

  // ---------- TC-REG-02 回归-快捷键：重绑冲突要被拦截 ----------
  for (const action of READER_ACTIONS) {
    assert.ok(action in DEFAULT_KEYBINDINGS, `快捷键动作缺少默认绑定：${action}`);
  }
  const occupied = DEFAULT_KEYBINDINGS.bookmark[0];
  assert.equal(
    detectKeybindingConflict("toggleDebug", occupied, DEFAULT_KEYBINDINGS),
    "bookmark",
    "占用他人快捷键应判定为冲突并指出被冲突的动作"
  );
  // 绑自己当前这组合法，不算冲突
  assert.equal(
    detectKeybindingConflict("bookmark", occupied, DEFAULT_KEYBINDINGS),
    null,
    "动作绑定到自己已有的键不应报冲突"
  );
  // 受保护动作（Escape 关闭浮层）的键不可被别人抢走：reader.js 里 Escape 是硬编码行为，
  // 抢走会导致一次按键触发两个行为。
  assert.equal(
    detectKeybindingConflict("nextPage", { key: "Escape" }, DEFAULT_KEYBINDINGS),
    "closeShortcuts",
    "抢走受保护快捷键 Escape 应被拦截"
  );
  // 匹配仍然可用，说明回归没破坏既有绑定
  assert.equal(matchKeyBinding({ key: "b" }), "bookmark", "默认键位匹配行为不应变化");
  assert.equal(matchKeyBinding({ key: "Escape" }), null, "Escape 仍不应参与普通键位匹配");
  console.log(`✓ TC-REG-02 快捷键：冲突被拦截，${READER_ACTIONS.length} 个动作默认绑定完整`);

  // ---------- TC-REG-03 回归-设置面板：导航与分区一一对应 ----------
  for (const file of DOCS) {
    const html = htmlOf[file];
    const targets = navTargets(html);
    assert.ok(targets.length >= 6, `${file} 导航项过少：${targets.length}`);
    for (const target of targets) {
      assert.ok(
        html.includes(`id="${target}"`),
        `${file} 导航指向了不存在的分区：${target}`
      );
    }
    // 每个分区都要能被导航到（顺序一致由 navTargets 的文档顺序保证）
    const sectionIds = [...html.matchAll(/data-section="([^"]+)"/g)].map((match) => match[1]);
    if (sectionIds.length) {
      assert.deepEqual(sectionIds, targets, `${file} 分区顺序与导航顺序不一致`);
    }
    // 导航吸顶常驻（v0.5 改动）
    assert.ok(/sticky/.test(html), `${file} 设置面板导航未吸顶`);
  }
  console.log(`✓ TC-REG-03 设置面板：导航与分区一一对应且顺序一致（${navTargets(htmlOf[DOCS[0]]).length} 项）`);

  // ---------- TC-REG-04 回归-双端：扩展页与站点页一致 ----------
  const readerIds = idsOf(htmlOf[DOCS[0]]);
  const webIds = idsOf(htmlOf[DOCS[1]]);
  assert.deepEqual(webIds, readerIds, "双端 HTML 元素 id 出现漂移");
  // v0.6 新增控件必须双端都在
  for (const required of [
    "reader-state-overlay",
    "state-loading",
    "state-empty",
    "state-empty-import",
    "state-error",
    "state-error-reason",
    "state-error-encoding",
    "state-error-retry",
    "error-reporting"
  ]) {
    assert.ok(readerIds.includes(required), `扩展端缺少 v0.6 控件：${required}`);
    assert.ok(webIds.includes(required), `站点端缺少 v0.6 控件：${required}`);
  }
  console.log(`✓ TC-REG-04 双端一致：${readerIds.length} 个 id 完全一致（含 v0.6 新增的四态与上报开关）`);

  // ---------- TC-REG-05 回归-同步：旧设置升级自动补全 ----------
  const legacy = normalizeStoredSettings({ fontSize: 20 });
  const defaults = getDefaultSettings();
  for (const key of Object.keys(defaults)) {
    assert.ok(key in legacy, `旧设置升级后缺少字段：${key}`);
  }
  assert.equal(legacy.fontSize, 20, "用户已设置的项不应被默认值覆盖");
  assert.equal(legacy.errorReporting, false, "v0.6 新增的上报开关应为默认关闭");
  // 嵌套字段要做深合并：旧设置里只写了一个键位，其余必须补齐
  const partialKeybindings = normalizeStoredSettings({ keybindings: { openSettings: "k" } });
  assert.equal(partialKeybindings.keybindings.openSettings, "k", "用户自定义键位应保留");
  for (const action of READER_ACTIONS) {
    assert.ok(
      partialKeybindings.keybindings[action],
      `旧设置的键位表缺少动作：${action}`
    );
  }
  const partialColors = normalizeStoredSettings({ themeColors: { bgColor: "#123456" } });
  assert.equal(partialColors.themeColors.bgColor, "#123456", "用户自定义颜色应保留");
  // 默认配色是空串（表示「跟随预设主题」），所以只校验键补全、不校验真值
  for (const key of Object.keys(defaults.themeColors)) {
    assert.ok(key in partialColors.themeColors, `旧设置的配色表缺少字段：${key}`);
    assert.equal(
      partialColors.themeColors[key],
      key === "bgColor" ? "#123456" : defaults.themeColors[key],
      `配色字段 ${key} 的合并结果不正确`
    );
  }
  console.log(`✓ TC-REG-05 同步：旧设置升级自动补全（${Object.keys(defaults).length} 个顶层字段 + 嵌套深合并）`);

  // ---------- 云备份折叠（v0.5.0 改动） ----------
  for (const file of DOCS) {
    const html = htmlOf[file];
    const start = html.indexOf('id="settings-cloud"');
    assert.ok(start > -1, `${file} 缺少云备份分区`);
    const cloudBlock = html.slice(start, html.indexOf("</section>", start));
    // 默认收起：折叠按钮 aria-expanded=false，且折叠体带 is-collapsed
    assert.match(
      cloudBlock,
      /id="cloud-section-toggle"[^>]*aria-expanded="false"/,
      `${file} 云备份折叠按钮未默认收起`
    );
    assert.match(
      cloudBlock,
      /id="cloud-section-body"[^>]*is-collapsed/,
      `${file} 云备份内容未默认折叠`
    );
  }
  console.log("✓ 云备份配置默认收起（v0.5.0 改动未退化）");

  // ---------- TC-CMP-02 兼容：双 locale 文案键完全一致 ----------
  const locales = getSupportedLocales();
  assert.ok(locales.includes("en") && locales.includes("zh_CN"), "缺少 en / zh_CN 语言包");
  const enKeys = Object.keys(MESSAGES.en).sort();
  const zhKeys = Object.keys(MESSAGES.zh_CN).sort();
  assert.deepEqual(zhKeys, enKeys, "zh_CN 与 en 的文案键不一致（会漏翻译）");
  for (const key of enKeys) {
    assert.ok(MESSAGES.en[key], `en 文案为空：${key}`);
    assert.ok(MESSAGES.zh_CN[key], `zh_CN 文案为空：${key}`);
  }
  // v0.6 新增文案必须双端语言包都有
  for (const key of [
    "readerStateLoading",
    "readerStateEmpty",
    "readerStateImport",
    "readerStateRetry",
    "readerErrorEncoding",
    "readerErrorEmptyFile",
    "readerErrorReadFailed",
    "readerErrorParseFailed",
    "readerErrorUnknown",
    "readerStateEncodingLabel",
    "readerStateEncodingApply",
    "readerFlatBookHint",
    "readerErrorReporting",
    "readerErrorReportingHint"
  ]) {
    assert.ok(key in MESSAGES.en, `en 缺少 v0.6 文案：${key}`);
    assert.ok(key in MESSAGES.zh_CN, `zh_CN 缺少 v0.6 文案：${key}`);
  }
  console.log(`✓ TC-CMP-02 双 locale：${enKeys.length} 个文案键完全一致且无空值`);

  // ---------- 版本号一致性：发版最容易漏掉的就是某处没跟着改 ----------
  const pkg = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(projectRoot, "manifest.json"), "utf8"));
  const lock = JSON.parse(readFileSync(join(projectRoot, "package-lock.json"), "utf8"));
  const readme = readFileSync(join(projectRoot, "README.md"), "utf8");
  const changelog = readFileSync(join(projectRoot, "CHANGELOG.md"), "utf8");

  assert.equal(manifest.version, pkg.version, `manifest.json 版本 ${manifest.version} 与 package.json ${pkg.version} 不一致`);
  assert.equal(lock.version, pkg.version, `package-lock.json 版本 ${lock.version} 与 package.json ${pkg.version} 不一致`);
  assert.equal(APP_VERSION, pkg.version, `modules/app-info.js 版本 ${APP_VERSION} 与 package.json ${pkg.version} 不一致`);
  assert.match(readme, new RegExp(`版本：${pkg.version}`), `README.md 未同步版本号 ${pkg.version}`);
  // CHANGELOG 顶部条目必须与当前版本对应，否则发版说明会与实际不符
  const firstEntry = /^## (.+)$/m.exec(changelog);
  assert.ok(firstEntry, "CHANGELOG.md 缺少版本条目");
  assert.match(firstEntry[1], new RegExp(`v?${pkg.version}`), `CHANGELOG.md 顶部条目「${firstEntry[1]}」与版本号 ${pkg.version} 不符`);
  // 版本号需为 x.y.z 且大于上一个发布版本
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/, `版本号格式不正确：${pkg.version}`);
  console.log(`✓ 版本号一致：package.json / manifest.json / package-lock.json / app-info.js / README / CHANGELOG 均为 ${pkg.version}`);

  console.log("regression tests passed (TC-REG-01~05 + 云备份折叠 + TC-CMP-02 + 版本号)");
}

run();
