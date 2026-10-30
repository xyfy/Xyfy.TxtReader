// FR-C2 场景模式（日间 / 夜间 / 护眼一键）
//
// 设计取舍：
//   - 场景只是「主题 + 版式的预设组合」，不引入新的渲染分支，避免主题逻辑分叉
//   - 不动用户的 themeColors：自定义配色是用户花了时间调的，切场景再切回来必须还在
//   - detectScene 严格比对，宁可返回 null（不高亮任何按钮）也不要误标成「当前是夜间」

export const SCENE_IDS = ["day", "night", "eyeCare"];

export const SCENE_PRESETS = {
  day: {
    id: "day",
    theme: "paper",
    fontSize: 18,
    lineHeight: 1.8,
    labelKey: "sceneDay"
  },
  night: {
    id: "night",
    theme: "night",
    fontSize: 18,
    // 夜间行距比日间更松：暗底亮字时行间挤压更明显
    lineHeight: 1.9,
    labelKey: "sceneNight"
  },
  eyeCare: {
    id: "eyeCare",
    theme: "sepia",
    fontSize: 19,
    // 护眼强调「舒展」：字号 +1、行距 2.0，长时间阅读眼压更低
    lineHeight: 2.0,
    labelKey: "sceneEyeCare"
  }
};

/**
 * 应用场景。未知 id 原样返回（不抛错）——按钮绑定出错时宁可什么都不发生，也不要让页面炸掉。
 *
 * @param {object} settings
 * @param {string} sceneId
 * @returns {object} 新设置（不可变）
 */
export function applyScene(settings, sceneId) {
  const current = settings || {};
  const preset = SCENE_PRESETS[sceneId];
  if (!preset) {
    return { ...current };
  }
  return {
    ...current,
    theme: preset.theme,
    fontSize: preset.fontSize,
    lineHeight: preset.lineHeight,
    scene: preset.id
  };
}

/**
 * 反查当前生效的场景。
 * 三项（主题 / 字号 / 行高）全部一致才算，否则用户手调过字号后按钮仍高亮「夜间」就是骗人。
 *
 * @param {object} settings
 * @returns {string|null}
 */
export function detectScene(settings) {
  if (!settings) {
    return null;
  }
  for (const id of SCENE_IDS) {
    const preset = SCENE_PRESETS[id];
    if (
      settings.theme === preset.theme &&
      Number(settings.fontSize) === preset.fontSize &&
      Number(settings.lineHeight) === preset.lineHeight
    ) {
      return id;
    }
  }
  return null;
}

/** 当前是否处于自定义配色（切场景会离开 custom，但配色数据保留）。 */
export function isCustomPalette(settings) {
  return settings?.theme === "custom";
}

/**
 * 场景切换时是否需要提醒用户「你的自定义配色被暂时收起」。
 * 有实际配色值才提醒，空配色表（用户只是点过 custom 没调）不需要打扰。
 */
export function shouldWarnCustomPalette(settings) {
  if (!isCustomPalette(settings)) {
    return false;
  }
  const colors = settings?.themeColors || {};
  return Object.values(colors).some((value) => Boolean(value));
}

/** 切回自定义主题：只改 theme，配色表原样保留。 */
export function restoreCustomPalette(settings) {
  return { ...(settings || {}), theme: "custom", scene: "" };
}
