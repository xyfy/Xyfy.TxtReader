// FR-S3 同步冲突体验
//
// 原来的 `chooseNewerRecord` 只比 updatedAt，谁新用谁——在多设备场景里等于**静默丢配置**：
// A 设备调了配色、B 设备调了字号，后同步的一方整份设置被覆盖，用户毫无感知也毫无补救手段。
//
// 这里的策略：
//   - 时间差很大（>5 分钟）→ 仍按新的胜出，不打扰（这是正常的多设备接力，不是冲突）
//   - 时间差很小且内容不同 → 判定为真冲突，交给用户选
//   - 提供「逐字段取新」：以新的一方为底，把**旧的一方改过、新的一方仍是默认值**的字段捡回来。
//     这是唯一能同时保住两边修改的选项。

export const SETTINGS_UPDATED_AT = "settingsUpdatedAt";

// 5 分钟窗口：两台设备在这么短时间内各自保存，基本可断定是并行操作而非接力
export const CONFLICT_WINDOW_MS = 5 * 60 * 1000;

// 参与比对的字段。刻意排除 onboarding*/scene 这类「非偏好」状态：
// 它们不同步也不影响阅读体验，纳入只会制造假冲突。
export const COMPARED_FIELDS = [
  "theme",
  "themeColors",
  "fontFamily",
  "customFont",
  "fontSize",
  "lineHeight",
  "readingMode",
  "animationStyle",
  "animationIntensity",
  "showStats",
  "keybindings"
];

export const RESOLVE_STRATEGIES = ["keep-local", "keep-remote", "newest-per-field"];

// 字段 → i18n 文案键，供设置面板渲染 diff 列表
export const FIELD_LABEL_KEY = {
  theme: "fieldTheme",
  themeColors: "fieldThemeColors",
  fontFamily: "fieldFontFamily",
  customFont: "fieldCustomFont",
  fontSize: "fieldFontSize",
  lineHeight: "fieldLineHeight",
  readingMode: "fieldReadingMode",
  animationStyle: "fieldAnimationStyle",
  animationIntensity: "fieldAnimationIntensity",
  showStats: "fieldShowStats",
  keybindings: "fieldKeybindings"
};

/** 稳定序列化：对象键序不同不应被判为「值不同」。 */
function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function isSameValue(left, right) {
  return stableStringify(left) === stableStringify(right);
}

/**
 * 字段级差异。
 * @returns {Array<{field: string, local: unknown, remote: unknown}>}
 */
export function diffSettings(local, remote) {
  if (!local || !remote) {
    return [];
  }
  return COMPARED_FIELDS.filter((field) => !isSameValue(local[field], remote[field])).map((field) => ({
    field,
    local: local[field],
    remote: remote[field]
  }));
}

/**
 * 冲突判定。
 *
 * @param {object|null} local 本地设置
 * @param {object|null} remote 云端设置
 * @param {{windowMs?: number}} options
 * @returns {null | {fields: string[], diff: object[], distanceMs: number, localUpdatedAt: number, remoteUpdatedAt: number, newer: "local"|"remote"}}
 */
export function detectConflict(local, remote, { windowMs = CONFLICT_WINDOW_MS } = {}) {
  if (!local || !remote) {
    return null;
  }
  const diff = diffSettings(local, remote);
  if (!diff.length) {
    return null;
  }
  const localUpdatedAt = Number(local[SETTINGS_UPDATED_AT] || 0);
  const remoteUpdatedAt = Number(remote[SETTINGS_UPDATED_AT] || 0);
  const distanceMs = Math.abs(localUpdatedAt - remoteUpdatedAt);

  // 一次都没存过（时间戳都是 0）不构成本次冲突：那是首次同步，直接取任一侧即可
  if (!localUpdatedAt || !remoteUpdatedAt) {
    return null;
  }
  if (distanceMs > windowMs) {
    return null;
  }

  return {
    fields: diff.map((item) => item.field),
    diff,
    distanceMs,
    localUpdatedAt,
    remoteUpdatedAt,
    newer: remoteUpdatedAt > localUpdatedAt ? "remote" : "local"
  };
}

/** 逐字段取新时，把嵌套映射按 key 合并：主题色、键位这些是最容易「各改一半」的字段。 */
function mergeMappedField(baseValue, otherValue, defaultValue) {
  const base = baseValue && typeof baseValue === "object" ? baseValue : {};
  const other = otherValue && typeof otherValue === "object" ? otherValue : {};
  const fallback = defaultValue && typeof defaultValue === "object" ? defaultValue : {};
  const merged = { ...base };
  for (const key of Object.keys(other)) {
    // 只捡「对方改过、我这侧还是默认」的键，否则就是拿旧值覆盖新值
    if (isSameValue(base[key], fallback[key]) && !isSameValue(other[key], fallback[key])) {
      merged[key] = other[key];
    }
  }
  return merged;
}

/**
 * 按策略合并。
 *
 * @param {object} local
 * @param {object} remote
 * @param {"keep-local"|"keep-remote"|"newest-per-field"} strategy
 * @param {{now?: number, defaults?: object}} options
 * @returns {object} 合并后的设置（带新的 settingsUpdatedAt）
 */
export function resolveConflict(local, remote, strategy, { now = Date.now(), defaults = null } = {}) {
  if (!local && !remote) {
    return {};
  }
  if (!RESOLVE_STRATEGIES.includes(strategy)) {
    throw new Error(`未知的冲突解决策略：${strategy}`);
  }

  const localUpdatedAt = Number(local?.[SETTINGS_UPDATED_AT] || 0);
  const remoteUpdatedAt = Number(remote?.[SETTINGS_UPDATED_AT] || 0);

  // 时间戳必须严格大于两侧，否则下一次读取还会被判成「对方更新」而回滚
  const nextUpdatedAt = Math.max(Number(now) || 0, localUpdatedAt + 1, remoteUpdatedAt + 1);

  let merged;
  if (strategy === "keep-local") {
    merged = { ...(local || {}) };
  } else if (strategy === "keep-remote") {
    merged = { ...(remote || {}) };
  } else {
    const baseIsLocal = localUpdatedAt >= remoteUpdatedAt;
    const base = baseIsLocal ? local || {} : remote || {};
    const other = baseIsLocal ? remote || {} : local || {};
    merged = { ...base };

    for (const field of COMPARED_FIELDS) {
      if (isSameValue(base[field], other[field])) {
        continue;
      }
      const value = base[field];
      const fallback = defaults?.[field];
      const baseIsDefault = defaults ? isSameValue(value, fallback) : false;

      // 我这一侧没动过（还是默认值），对方动过 → 捡对方的
      if (baseIsDefault && !isSameValue(other[field], fallback)) {
        merged[field] = other[field];
        continue;
      }
      // 对象型字段（配色 / 键位）允许按 key 互补
      if (
        defaults &&
        value && typeof value === "object" && !Array.isArray(value) &&
        other[field] && typeof other[field] === "object" && !Array.isArray(other[field])
      ) {
        merged[field] = mergeMappedField(value, other[field], fallback);
      }
    }
  }

  merged[SETTINGS_UPDATED_AT] = nextUpdatedAt;
  return merged;
}

/**
 * 供 UI 展示一句话摘要（不返回人类语言，只返回计数与字段列表）。
 */
export function summarizeConflict(conflict) {
  if (!conflict) {
    return { hasConflict: false, count: 0, fields: [], newer: null };
  }
  return {
    hasConflict: true,
    count: conflict.fields.length,
    fields: conflict.fields,
    newer: conflict.newer
  };
}
