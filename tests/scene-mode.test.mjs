// FR-C2 场景模式：TC-C2-01 / TC-C2-02
import assert from "node:assert/strict";
import { getDefaultSettings } from "../modules/storage.js";
import {
  SCENE_IDS,
  SCENE_PRESETS,
  applyScene,
  detectScene,
  isCustomPalette,
  restoreCustomPalette,
  shouldWarnCustomPalette
} from "../modules/scene-mode.js";

const defaults = getDefaultSettings();

// --- TC-C2-01 应用与反查 ---
{
  assert.deepEqual(SCENE_IDS, ["day", "night", "eyeCare"], "场景应为日间/夜间/护眼三套");

  const night = applyScene(defaults, "night");
  assert.equal(night.theme, "night", "夜间场景应切到 night 主题");
  assert.ok(night.lineHeight >= 1.8, `夜间行距不应压缩：${night.lineHeight}`);
  assert.equal(night.scene, "night", "应记录当前场景");
  assert.equal(defaults.theme, "paper", "applyScene 不应改动入参");

  assert.equal(detectScene(night), "night", "反查应识别夜间场景");

  const eyeCare = applyScene(defaults, "eyeCare");
  assert.equal(eyeCare.theme, "sepia", "护眼场景应切到 sepia 主题");
  assert.ok(eyeCare.lineHeight >= 2.0, `护眼行距应更松：${eyeCare.lineHeight}`);
  assert.ok(eyeCare.fontSize > defaults.fontSize, "护眼应略微放大字号");
  assert.equal(detectScene(eyeCare), "eyeCare", "反查应识别护眼场景");

  const day = applyScene(defaults, "day");
  assert.equal(day.theme, "paper");
  assert.equal(detectScene(day), "day", "反查应识别日间场景");

  // 未知场景不抛错，也不改动任何偏好
  const unknown = applyScene(defaults, "midnight");
  assert.equal(unknown.theme, defaults.theme, "未知场景不应改动主题");
  assert.equal(unknown.fontSize, defaults.fontSize, "未知场景不应改动字号");

  // 每套预设都必须能被自己的反查命中（防止预设与判定条件写岔）
  for (const id of SCENE_IDS) {
    assert.equal(detectScene(applyScene(defaults, id)), id, `预置 ${id} 应能被反查命中`);
    assert.ok(SCENE_PRESETS[id].labelKey, `预置 ${id} 缺少文案键`);
  }

  console.log("✓ TC-C2-01 三套场景应用与反查互逆，未知场景安全降级");
}

// --- TC-C2-02 手调后不高亮 / 自定义配色不被清空 ---
{
  const night = applyScene(defaults, "night");

  // 用户手改字号：不再属于任何预设，按钮应全部熄灭
  assert.equal(detectScene({ ...night, fontSize: 26 }), null, "手调字号后不应再高亮任何场景");
  assert.equal(detectScene({ ...night, lineHeight: 2.4 }), null, "手调行距后不应再高亮任何场景");
  assert.equal(detectScene({ ...night, theme: "paper" }), null, "只改主题时也不应误判");
  assert.equal(detectScene(null), null, "空设置应返回 null 而不是抛错");

  // 默认设置恰好就是日间预设：这是刻意的，首次打开时「日间」应处于高亮状态
  assert.equal(detectScene(defaults), "day", "默认设置应等同于日间场景");

  // 自定义配色：切场景会离开 custom，但 themeColors 必须原样保留
  const custom = {
    ...defaults,
    theme: "custom",
    themeColors: { ...defaults.themeColors, bgColor: "#101418", textColor: "#eaeaea" }
  };
  assert.equal(isCustomPalette(custom), true, "应识别为自定义配色");
  assert.equal(shouldWarnCustomPalette(custom), true, "有实际配色值时切换场景应给出提醒");

  const switched = applyScene(custom, "eyeCare");
  assert.equal(switched.theme, "sepia", "切换场景应离开自定义主题");
  assert.equal(switched.themeColors.bgColor, "#101418", "自定义底色不得被清空");
  assert.equal(switched.themeColors.textColor, "#eaeaea", "自定义字色不得被清空");

  const back = restoreCustomPalette(switched);
  assert.equal(back.theme, "custom", "应能切回自定义主题");
  assert.equal(back.themeColors.bgColor, "#101418", "切回后自定义配色应完好");
  assert.equal(back.scene, "", "切回自定义后不应残留场景标记");

  // 只点过 custom、没真调配色的用户，不该被提醒打扰
  assert.equal(
    shouldWarnCustomPalette({ ...defaults, theme: "custom" }),
    false,
    "空配色表不应触发自定义配色提醒"
  );
  assert.equal(shouldWarnCustomPalette(defaults), false, "非自定义主题不应提醒");

  console.log("✓ TC-C2-02 手调后不高亮、自定义配色跨场景保留且可切回");
}

console.log("scene mode tests passed (TC-C2-01~02)");
