// v0.8 处置 L-02：sync 配额超限处理 — TC-Q1-01 / TC-Q1-02 / TC-Q1-03
import assert from "node:assert/strict";
import { getDefaultSettings } from "../modules/storage.js";
import {
  QUOTA_BYTES,
  QUOTA_BYTES_PER_ITEM,
  checkSyncQuota,
  createSyncStatusLedger,
  describeSyncState,
  estimateItemBytes,
  shrinkSettingsForSync
} from "../modules/sync-quota.js";

const defaults = getDefaultSettings();

// --- TC-Q1-01 体积估算按 UTF-8 字节，不按字符数 ---
{
  assert.equal(estimateItemBytes("a", "x"), 1 + 3, "key 1 字节 + \"x\" 含引号 3 字节");
  // 中文 1 字 = 3 字节，JSON 会带上双引号
  assert.equal(estimateItemBytes("k", "中文"), 1 + 2 + 6, "2 个中文各 3 字节 + JSON 引号 2 字节");
  assert.equal(estimateItemBytes("k", ""), 1 + 2, "空字符串 JSON 为 \"\"，2 字节");

  // 关键：中文若按 String.length 会低估 3 倍
  const zh = estimateItemBytes("font", "思源宋体");
  const naive = "font".length + JSON.stringify("思源宋体").length;
  assert.ok(zh > naive, `UTF-8 估算应大于按字符数估算（${zh} > ${naive}）`);
  assert.equal(zh - naive, 4 * 2, "4 个中文各多算 2 字节");

  // 不可序列化（循环引用）→ Infinity，交给上层判超限
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(estimateItemBytes("c", cyclic), Number.POSITIVE_INFINITY, "循环引用应返回 Infinity");

  console.log("✓ TC-Q1-01 体积估算按 UTF-8 字节计算，中文与循环引用处理正确");
}

// --- TC-Q1-02 预检：单条超限 / 总量超限 / 正常放行 ---
{
  const ok = checkSyncQuota({ "reader-settings-sync": defaults });
  assert.equal(ok.ok, true, "默认设置在配额内，应放行");
  assert.ok(ok.totalBytes > 0, "应算出占用字节");
  assert.equal(ok.overflowBytes, 0, "放行时无溢出");

  // 单条超限：塞一个巨长的自定义字体名
  const huge = { ...defaults, customFont: "F".repeat(QUOTA_BYTES_PER_ITEM) };
  const itemOver = checkSyncQuota({ "reader-settings-sync": huge });
  assert.equal(itemOver.ok, false, "超过单条上限应拦截");
  assert.equal(itemOver.code, "ITEM_TOO_LARGE", "错误码应为 ITEM_TOO_LARGE");
  assert.deepEqual(itemOver.oversizedKeys, ["reader-settings-sync"], "应指出超限的 key");
  assert.ok(itemOver.overflowBytes > 0, "应算出超出多少字节");
  assert.ok(itemOver.message.includes(String(QUOTA_BYTES_PER_ITEM)), "提示应包含上限数值");

  // 总量超限：existingBytes 已经接近上限
  const totalOver = checkSyncQuota({ "reader-settings-sync": defaults }, { existingBytes: QUOTA_BYTES - 10 });
  assert.equal(totalOver.ok, false, "累计超过总量上限应拦截");
  assert.equal(totalOver.code, "TOTAL_TOO_LARGE", "错误码应为 TOTAL_TOO_LARGE");
  assert.ok(totalOver.totalBytes > QUOTA_BYTES, "累计字节应超过上限");

  // 边界：刚好等于上限应放行（Chrome 是 > 才报错）
  const exactItem = { k: "" };
  const exactBytes = estimateItemBytes("k", "");
  const boundary = checkSyncQuota(exactItem, { perItemLimit: exactBytes, totalLimit: 10_000 });
  assert.equal(boundary.ok, true, "刚好等于单条上限应放行");

  // 自定义上限可覆盖默认值（便于测试与未来配额调整）
  const custom = checkSyncQuota({ k: "12345" }, { perItemLimit: 3, totalLimit: 10_000 });
  assert.equal(custom.ok, false, "自定义更小上限时同样拦截");

  console.log("✓ TC-Q1-02 单条超限 / 总量超限 / 边界值 / 自定义上限判定正确");
}

// --- TC-Q1-03 降级策略、同步状态文案与台账 ---
{
  // 超限时摘掉可再生成字段后应能通过
  const heavy = {
    ...defaults,
    customFont: "F".repeat(4000),
    themeColors: Object.fromEntries(
      Array.from({ length: 80 }, (_, i) => [`k${i}`, "#" + "A".repeat(60)])
    ),
    keybindings: Object.fromEntries(
      Array.from({ length: 80 }, (_, i) => [`act${i}`, ["Ctrl+Alt+Shift+" + i]])
    )
  };
  const before = checkSyncQuota({ "reader-settings-sync": heavy });
  assert.equal(before.ok, false, "构造的超限设置应被拦截");

  const shrunk = shrinkSettingsForSync(heavy);
  assert.equal(shrunk.ok, true, "摘掉可再生成字段后应能同步");
  assert.ok(shrunk.droppedFields.length > 0, "应记录被摘掉的字段");
  assert.deepEqual(
    shrunk.droppedFields,
    ["themeColors", "keybindings", "customFont"].filter((f) => shrunk.droppedFields.includes(f)),
    "摘除顺序应遵循丢失代价从低到高"
  );
  // 用户手调过且无法恢复的项必须保留
  assert.equal(shrunk.settings.fontSize, defaults.fontSize, "字号属于必须保留项");
  assert.equal(shrunk.settings.theme, defaults.theme, "主题属于必须保留项");

  // 默认设置不需要降级
  const untouched = shrinkSettingsForSync(defaults);
  assert.equal(untouched.ok, true);
  assert.equal(untouched.droppedFields.length, 0, "正常体积不应触发降级");

  // 状态文案：正常 / 降级 / 失败三态
  const okState = describeSyncState({ ok: true, totalBytes: 1024, limitBytes: QUOTA_BYTES });
  assert.equal(okState.synced, true);
  assert.equal(okState.degraded, false);
  assert.equal(okState.usageText, `1024 / ${QUOTA_BYTES}`, "应展示用量");

  const degradedState = describeSyncState({ ok: true, droppedFields: ["themeColors"], totalBytes: 9000 });
  assert.equal(degradedState.degraded, true, "有降级应标记 degraded");
  assert.equal(degradedState.titleKey, "syncStateDegradedTitle", "降级应有独立标题键");

  const failedState = describeSyncState({ ok: false, code: "ITEM_TOO_LARGE", message: "太大了" });
  assert.equal(failedState.synced, false, "失败态必须标记未同步");
  assert.equal(failedState.titleKey, "syncStateFailedTitle");
  assert.equal(failedState.detailKey, "syncStateItemTooLarge", "应给出具体原因键");
  assert.equal(failedState.message, "太大了");

  const failedNoMsg = describeSyncState({ ok: false, code: "TOTAL_TOO_LARGE" });
  assert.ok(failedNoMsg.message.length > 0, "未提供 message 时必须有兜底文案，不能空白");
  assert.equal(failedNoMsg.detailKey, "syncStateTotalTooLarge");

  // 台账：记录成功 / 失败，且返回值是副本（外部改动不影响内部）
  const ledger = createSyncStatusLedger();
  assert.equal(ledger.get().synced, true, "初始应为已同步");

  ledger.recordOk({ droppedFields: ["keybindings"], totalBytes: 5000 });
  const degraded = ledger.get();
  assert.equal(degraded.degraded, true);
  assert.deepEqual(degraded.droppedFields, ["keybindings"]);

  degraded.droppedFields.push("被外部污染");
  assert.deepEqual(ledger.get().droppedFields, ["keybindings"], "台账应返回副本，外部改动不污染内部");

  ledger.recordFailure({ code: "ITEM_TOO_LARGE", message: "超了" });
  assert.equal(ledger.get().synced, false, "记录失败后状态应变为未同步");

  ledger.recordOk({ totalBytes: 100 });
  assert.equal(ledger.get().degraded, false, "重新成功后应清掉降级标记");

  console.log("✓ TC-Q1-03 降级策略、三态文案与状态台账行为正确");
}

console.log("sync quota tests passed (TC-Q1-01~03)");
