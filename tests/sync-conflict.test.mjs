// FR-S3 同步冲突体验：TC-S3-01 / TC-S3-02
import assert from "node:assert/strict";
import { getDefaultSettings } from "../modules/storage.js";
import {
  CONFLICT_WINDOW_MS,
  SETTINGS_UPDATED_AT,
  detectConflict,
  diffSettings,
  resolveConflict
} from "../modules/sync-conflict.js";

const defaults = getDefaultSettings();

function withColor(settings, key, value) {
  return { ...settings, themeColors: { ...settings.themeColors, [key]: value } };
}

// --- TC-S3-01 冲突判定与字段级 diff ---
{
  const base = { ...defaults, [SETTINGS_UPDATED_AT]: 1_700_000_000_000 };
  const local = { ...withColor(base, "bgColor", "#101010"), [SETTINGS_UPDATED_AT]: 1_700_000_000_000 };
  const remote = { ...base, fontSize: 24, [SETTINGS_UPDATED_AT]: 1_700_000_060_000 }; // 差 60 秒

  const conflict = detectConflict(local, remote);
  assert.ok(conflict, "两侧 60 秒内各改不同字段应判定为冲突");
  assert.equal(conflict.fields.includes("themeColors"), true, "配色应出现在冲突字段里");
  assert.equal(conflict.fields.includes("fontSize"), true, "字号应出现在冲突字段里");
  assert.equal(conflict.distanceMs, 60_000, "应算出时间差");
  assert.equal(conflict.newer, "remote", "云端更新时间更晚，应标记为较新的一方");

  // diff 要带上两侧真实值，UI 才能展示「本机 #101010 / 云端 #e7dbc2」
  const colorDiff = conflict.diff.find((item) => item.field === "themeColors");
  assert.equal(colorDiff.local.bgColor, "#101010", "diff 应带出本地值");
  assert.notEqual(colorDiff.remote.bgColor, "#101010", "diff 应带出云端值");

  // 内容相同：即使都在窗口内也不算冲突
  assert.equal(detectConflict(local, { ...local, [SETTINGS_UPDATED_AT]: local[SETTINGS_UPDATED_AT] + 1000 }), null, "内容一致不应报冲突");

  // 缺一侧：首次同步，不算冲突
  assert.equal(detectConflict(null, remote), null, "只有云端时不应报冲突");
  assert.equal(detectConflict(local, null), null, "只有本地时不应报冲突");

  // 时间戳为 0（从未保存过）不构成冲突
  assert.equal(detectConflict({ ...local, [SETTINGS_UPDATED_AT]: 0 }, { ...remote, [SETTINGS_UPDATED_AT]: 0 }), null, "无时间戳不应报冲突");

  // 非偏好字段不参与比对，避免制造假冲突
  const onboardingOnly = { ...base, onboardingDone: true, [SETTINGS_UPDATED_AT]: base[SETTINGS_UPDATED_AT] + 1000 };
  assert.equal(diffSettings(base, onboardingOnly).length, 0, "引导状态差异不应算作设置冲突");

  // 对象键序不同但内容一致 → 不误判
  const reordered = {
    ...base,
    keybindings: Object.fromEntries(Object.entries(base.keybindings).reverse()),
    [SETTINGS_UPDATED_AT]: base[SETTINGS_UPDATED_AT] + 1000
  };
  assert.equal(diffSettings(base, reordered).length, 0, "键序不同但内容相同的对象不应误判为差异");

  console.log("✓ TC-S3-01 冲突判定窗口、字段级 diff 与假冲突排除正确");
}

// --- TC-S3-02 时间差过大不报冲突；三种策略结果符合预期 ---
{
  const base = { ...defaults, [SETTINGS_UPDATED_AT]: 1_700_000_000_000 };
  const local = { ...withColor(base, "bgColor", "#222222"), [SETTINGS_UPDATED_AT]: 1_700_000_000_000 };
  const remote = { ...base, fontSize: 24, [SETTINGS_UPDATED_AT]: 1_700_007_200_000 }; // 差 2 小时

  assert.equal(detectConflict(local, remote), null, "相差 2 小时应视为接力更新，不打扰用户");
  assert.ok(CONFLICT_WINDOW_MS < 7_200_000, "冲突窗口应远小于 2 小时");

  const now = 1_800_000_000_000;
  const merged = resolveConflict(local, remote, "newest-per-field", { now, defaults });
  assert.equal(merged.fontSize, 24, "逐字段取新应保留云端改过的字号");
  assert.equal(merged.themeColors.bgColor, "#222222", "逐字段取新应同时保住本地改过的配色");
  assert.equal(merged[SETTINGS_UPDATED_AT], now, "合并后时间戳应更新为 now");

  const keepLocal = resolveConflict(local, remote, "keep-local", { now, defaults });
  assert.equal(keepLocal.fontSize, defaults.fontSize, "保留本地时不接受云端字号");
  assert.equal(keepLocal.themeColors.bgColor, "#222222", "保留本地应保留本机配色");

  const keepRemote = resolveConflict(local, remote, "keep-remote", { now, defaults });
  assert.equal(keepRemote.fontSize, 24, "保留云端应采用云端字号");
  assert.equal(keepRemote.themeColors.bgColor, defaults.themeColors.bgColor, "保留云端应放弃本机配色");

  // 时间戳必须严格大于两侧，否则下次读取会再次判成「对方更新」并回滚
  for (const strategy of ["keep-local", "keep-remote", "newest-per-field"]) {
    const result = resolveConflict(local, remote, strategy, { now: 1, defaults });
    assert.ok(
      result[SETTINGS_UPDATED_AT] > Math.max(local[SETTINGS_UPDATED_AT], remote[SETTINGS_UPDATED_AT]),
      `${strategy}：合并后时间戳必须严格大于两侧`
    );
  }

  // 未知策略应显式报错，而不是默默返回一份错误设置
  assert.throws(() => resolveConflict(local, remote, "merge-everything"), /未知的冲突解决策略/, "未知策略应抛错");

  // 逐字段取新：两侧都改同一字段时，以较新一方为准（不能凭空合并）
  const bothBold = resolveConflict(
    { ...base, fontSize: 22, [SETTINGS_UPDATED_AT]: base[SETTINGS_UPDATED_AT] },
    { ...base, fontSize: 26, [SETTINGS_UPDATED_AT]: base[SETTINGS_UPDATED_AT] + 60_000 },
    "newest-per-field",
    { now, defaults }
  );
  assert.equal(bothBold.fontSize, 26, "同字段冲突时应取较新的一方");

  // 键位按 key 互补：本地改了翻页键，云端改了设置键
  const localKeys = {
    ...local,
    keybindings: { ...defaults.keybindings, nextPage: ["J"] },
    [SETTINGS_UPDATED_AT]: base[SETTINGS_UPDATED_AT]
  };
  const remoteKeys = {
    ...remote,
    fontSize: defaults.fontSize,
    keybindings: { ...defaults.keybindings, openSettings: ["S"] },
    [SETTINGS_UPDATED_AT]: base[SETTINGS_UPDATED_AT] + 60_000
  };
  const mergedKeys = resolveConflict(localKeys, remoteKeys, "newest-per-field", { now, defaults });
  assert.deepEqual(mergedKeys.keybindings.nextPage, ["J"], "本地改过的键位应被保留");
  assert.deepEqual(mergedKeys.keybindings.openSettings, ["S"], "云端改过的键位应被保留");

  console.log("✓ TC-S3-02 大时间差不打扰、三种策略与键位按 key 互补正确");
}

console.log("sync conflict tests passed (TC-S3-01~02)");
