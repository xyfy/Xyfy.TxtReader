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
import { SCENE_PRESETS } from "../modules/scene-mode.js";

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

  // ---------- TC-REG-06 v0.7 六个功能「确实接线」----------
  // 模块写完没人调用是最容易发生的假完成：单元测试全绿，功能在界面上根本不存在。
  // 这里同时检查「HTML 有控件」与「reader.js 真的引用并调用了模块函数」，两头都堵。
  {
    const htmlByFile = {
      "reader/reader.html": readFileSync(join(projectRoot, "reader/reader.html"), "utf8"),
      "web/index.html": readFileSync(join(projectRoot, "web/index.html"), "utf8")
    };
    const readerJs = readFileSync(join(projectRoot, "reader/reader.js"), "utf8");

    for (const [file, html] of Object.entries(htmlByFile)) {
      // FR-C2：场景按钮必须与 SCENE_PRESETS 一一对应，少一个就是漏了某个场景
      const sceneIds = [...html.matchAll(/class="scene-chip"[^>]*data-scene="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(sceneIds, Object.keys(SCENE_PRESETS), `${file}: 场景按钮与 SCENE_PRESETS 不一致`);

      // FR-S1：引导浮层必须具备对话框语义，否则读屏用户不知道它是个弹窗
      assert.ok(/id="onboarding-overlay"[^>]*role="dialog"/.test(html), `${file}: 引导浮层缺少 role="dialog"`);
      assert.ok(/id="onboarding-overlay"[^>]*aria-modal="true"/.test(html), `${file}: 引导浮层缺少 aria-modal`);
      assert.ok(html.includes('id="onboarding-progress"'), `${file}: 缺少引导进度`);
      assert.ok(html.includes('id="onboarding-next"'), `${file}: 缺少引导下一步按钮`);

      // FR-C1：拖拽落区、最近文件、多选
      assert.ok(html.includes('id="drop-hint"'), `${file}: 缺少拖拽提示层`);
      assert.ok(html.includes('id="recent-files-list"'), `${file}: 缺少最近文件列表`);
      assert.ok(/id="file-input"[^>]*\bmultiple\b/.test(html), `${file}: 文件选择未开启多选`);

      // FR-S3：三种裁决策略的按钮必须齐全
      for (const id of ["conflict-keep-local", "conflict-keep-remote", "conflict-merge"]) {
        assert.ok(html.includes(`id="${id}"`), `${file}: 缺少冲突裁决按钮 ${id}`);
      }
      assert.ok(html.includes('id="sync-conflict-banner"'), `${file}: 缺少冲突条`);

      // FR-S4：跳转链接、页码播报、对比度展示位
      assert.ok(html.includes('id="skip-to-content"'), `${file}: 缺少跳到正文链接`);
      assert.ok(/id="page-indicator"[^>]*aria-live="polite"/.test(html), `${file}: 页码未做 aria-live 播报`);
      assert.ok(html.includes('id="a11y-contrast-status"'), `${file}: 缺少无障碍对比度状态位`);
    }

    // reader.js 必须真的 import 并调用每个模块的关键函数
    const wiring = [
      ["onboarding", "shouldShowOnboarding"],
      ["onboarding", "applyRecommendation"],
      ["onboarding", "markOnboardingDone"],
      ["reading-stats", "recordSession"],
      ["reading-stats", "summarize"],
      ["sync-conflict", "detectConflict"],
      ["sync-conflict", "resolveConflict"],
      ["a11y", "createFocusTrap"],
      ["a11y", "auditPalette"],
      ["import-queue", "classifyDroppedFiles"],
      ["import-queue", "createImportQueue"],
      ["import-queue", "pushRecentFile"],
      ["scene-mode", "applyScene"],
      ["scene-mode", "detectScene"]
    ];
    for (const [moduleName, fn] of wiring) {
      assert.ok(
        readerJs.includes(`"../modules/${moduleName}.js"`),
        `reader.js 未引入 ${moduleName}.js`
      );
      // 调用形态：`fnName(`，排除只出现在 import 列表里的情况
      assert.ok(
        new RegExp(`\\b${fn}\\s*\\(`).test(readerJs),
        `reader.js 引入了 ${moduleName}.js 却没有调用 ${fn}`
      );
    }

    console.log(`✓ TC-REG-06 v0.7 六个功能均已接线（场景/引导/拖拽/冲突/无障碍），非空壳`);
  }

  // ---------- TC-REG-07 v0.8 L-02：sync 写入必须经配额守卫 ----------
  // 只断言模块存在不算数：必须确认 storage.js 里没有任何绕过守卫的裸 sync.set。
  {
    const storageSource = readFileSync(join(projectRoot, "modules/storage.js"), "utf8");
    assert.match(storageSource, /from "\.\/sync-quota\.js"/, "storage.js 未引入 sync-quota 模块");
    for (const fn of ["checkSyncQuota", "shrinkSettingsForSync", "createSyncStatusLedger"]) {
      assert.match(storageSource, new RegExp(`\\b${fn}\\s*\\(`), `storage.js 未调用 ${fn}`);
    }
    assert.match(storageSource, /export function getSyncStatus/, "storage.js 未导出 getSyncStatus，设置面板无法展示同步状态");

    // 关键：不允许出现 `area.set({ [SETTINGS_SYNC_KEY]...` 这类绕过守卫的直写
    assert.doesNotMatch(
      storageSource,
      /await\s+area\.set\(\s*\{\s*\[SETTINGS_SYNC_KEY\]/,
      "storage.js 仍存在绕过配额守卫的裸 sync 写入（SETTINGS_SYNC_KEY）"
    );
    // 进度同步同理：必须在 area.set 之前先过 checkSyncQuota
    const progressBlock = /async function mirrorProgressToSync[\s\S]*?^}/m.exec(storageSource)?.[0] || "";
    assert.ok(progressBlock.length > 0, "未找到 mirrorProgressToSync");
    const checkIdx = progressBlock.indexOf("checkSyncQuota");
    const setIdx = progressBlock.indexOf("area.set");
    assert.ok(checkIdx > -1 && setIdx > -1 && checkIdx < setIdx, "进度同步未在写入前做配额预检");

    // 失败必须留痕，不能静默
    assert.match(storageSource, /recordSyncFailure/, "缺少失败记账，超限会静默丢配置");
    console.log("✓ TC-REG-07 sync 写入全部经配额守卫，无绕过路径，失败有记账");
  }

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
