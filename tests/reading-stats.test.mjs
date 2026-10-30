// FR-S2 阅读统计细化：TC-S2-01 / TC-S2-02
import assert from "node:assert/strict";
import {
  IDLE_TIMEOUT_MS,
  MIN_SESSION_MS,
  SPEED_CEILING,
  SPEED_FLOOR,
  computeSpeed,
  computeStreak,
  createStats,
  dayKeyOf,
  estimateRemaining,
  getDayStats,
  pruneHistory,
  recordSession,
  splitDuration,
  summarize
} from "../modules/reading-stats.js";

// 固定一个本地时间，避免测试在不同时区/跨日边界上飘
const T1 = new Date(2026, 9, 28, 21, 0, 0).getTime(); // 2026-10-28 21:00
const T2 = new Date(2026, 9, 29, 9, 30, 0).getTime(); // 2026-10-29 09:30

// --- TC-S2-01 时长累计与跨天不覆盖 ---
{
  let stats = createStats();

  // 90 秒会话
  stats = recordSession(stats, { startedAt: T1, durationMs: 90000, charsRead: 900 });
  const day1 = getDayStats(stats, T1);
  assert.equal(day1.ms, 90000, "应累计 90 秒");
  assert.equal(day1.chars, 900, "应累计 900 字");

  const split = splitDuration(day1.ms);
  assert.deepEqual(split, { hours: 0, minutes: 1, seconds: 30 }, "90 秒应拆成 1 分 30 秒");

  // 同一天再读 30 分钟 → 累加到同一条
  stats = recordSession(stats, { startedAt: T1 + 1000, durationMs: 1800000, charsRead: 6000 });
  assert.equal(getDayStats(stats, T1).ms, 1890000, "同一天应累加而不是覆盖");

  // 第二天：独立条目，且不影响第一天
  stats = recordSession(stats, { startedAt: T2, durationMs: 600000, charsRead: 4000 });
  assert.equal(getDayStats(stats, T1).ms, 1890000, "跨天写入不得覆盖前一天");
  assert.equal(getDayStats(stats, T2).ms, 600000, "第二天应独立记录");
  assert.equal(stats.days[dayKeyOf(T1)].chars, 6900, "第一天字数应保持不变");

  // 汇总口径
  assert.equal(stats.totalMs, 1890000 + 600000, "总时长应累加");
  assert.equal(stats.totalChars, 10900, "总字数应累加");
  assert.equal(stats.lastActiveAt, T2 + 600000, "最近活跃时间应更新为会话结束时间");

  // 过短会话不记账（否则翻一页就关会产生大量碎片）
  const before = stats.totalMs;
  const shortSession = recordSession(stats, { startedAt: T2, durationMs: MIN_SESSION_MS - 1, charsRead: 10 });
  assert.equal(shortSession.totalMs, before, "低于阈值碎片的会话不应计入");
  assert.notEqual(shortSession, stats, "即使不计账也应返回新对象，避免调用方误改共享状态");

  // 会话封顶：从休眠唤醒不能把整夜算成阅读
  const overnight = recordSession(createStats(), { startedAt: T1, durationMs: IDLE_TIMEOUT_MS * 500 });
  assert.equal(overnight.totalMs, IDLE_TIMEOUT_MS * 120, "单次会话应封顶 4 小时");

  // 负数/NaN 输入不应污染统计
  const dirty = recordSession(createStats(), { startedAt: T1, durationMs: -100 });
  assert.equal(dirty.totalMs, 0, "负时长应被丢弃");
  const nan = recordSession(createStats(), { startedAt: T1, durationMs: Number.NaN });
  assert.equal(nan.totalMs, 0, "NaN 时长应被丢弃");

  console.log("✓ TC-S2-01 阅读时长按天累计、跨天不覆盖、碎片与异常输入被过滤");
}

// --- TC-S2-02 速度夹紧、剩余时长、连续天数 ---
{
  // 正常速度：900 字 / 90 秒 = 600 字/分
  assert.equal(computeSpeed({ charsRead: 900, durationMs: 90000 }), 600, "速度计算应为字/分钟");

  // 样本不足 → null（UI 显示「—」，而不是 0 或 Infinity）
  assert.equal(computeSpeed({ charsRead: 0, durationMs: 90000 }), null, "无字符应返回 null");
  assert.equal(computeSpeed({ charsRead: 100, durationMs: 1000 }), null, "时长低于阈值应返回 null");
  assert.equal(computeSpeed({ charsRead: 100, durationMs: Number.NaN }), null, "非法时长应返回 null");

  // 超界夹紧
  assert.equal(computeSpeed({ charsRead: 1, durationMs: 3600000 }), SPEED_FLOOR, "速度过慢应夹到下限");
  assert.equal(computeSpeed({ charsRead: 1000000, durationMs: 60000 }), SPEED_CEILING, "速度过快应夹到上限");

  // 剩余时长
  assert.equal(estimateRemaining({ remainingChars: 60000, speed: 600 }), 6000000, "6 万字按 600 字/分应约 100 分钟");
  assert.equal(estimateRemaining({ remainingChars: 0, speed: 600 }), null, "读完后不应给出剩余时长");
  assert.equal(estimateRemaining({ remainingChars: 60000, speed: null }), null, "速度未知时不应瞎猜");
  assert.equal(estimateRemaining({ remainingChars: -10, speed: 600 }), null, "负数剩余字数应返回 null");
  assert.ok(
    Number.isFinite(estimateRemaining({ remainingChars: 5000000, speed: SPEED_FLOOR })),
    "极长书稿也必须返回有限值，不能是 Infinity"
  );

  // 连续天数：今天 + 昨天 + 前天 = 3；中间断一天则重新计数
  let stats = createStats();
  stats = recordSession(stats, { startedAt: new Date(2026, 9, 26, 20, 0, 0).getTime(), durationMs: 60000 });
  stats = recordSession(stats, { startedAt: new Date(2026, 9, 27, 20, 0, 0).getTime(), durationMs: 60000 });
  stats = recordSession(stats, { startedAt: new Date(2026, 9, 28, 20, 0, 0).getTime(), durationMs: 60000, charsRead: 600 });

  assert.equal(computeStreak(stats, T1), 3, "连续三天应为 3");

  // 今天还没读：仍算 3（按最近阅读日往回数）
  const nextMorning = new Date(2026, 9, 29, 8, 0, 0).getTime();
  assert.equal(computeStreak(stats, nextMorning), 3, "今天还没读不该把昨天建立的天数清零");

  // 隔一天没读：断档
  const twoDaysLater = new Date(2026, 9, 30, 8, 0, 0).getTime();
  assert.equal(computeStreak(stats, twoDaysLater), 0, "断档超过一天应归零");

  // 空数据
  assert.equal(computeStreak(createStats(), T1), 0, "无记录时连续天数为 0");

  // 保留期裁剪：只留最近 N 天
  let longStats = createStats();
  for (let i = 0; i < 60; i += 1) {
    longStats = recordSession(longStats, {
      startedAt: new Date(2026, 7, 1 + i, 12, 0, 0).getTime(),
      durationMs: 60000
    });
  }
  const pruned = pruneHistory(longStats, { now: T1, days: 30 });
  assert.ok(Object.keys(pruned.days).length <= 30, `保留期裁剪后不应超过 30 天：${Object.keys(pruned.days).length}`);
  assert.ok(
    pruned.days[dayKeyOf(new Date(2026, 8, 29, 12, 0, 0).getTime())],
    "落在保留期内的最后一天明细必须保留"
  );
  assert.ok(
    !pruned.days[dayKeyOf(new Date(2026, 7, 1, 12, 0, 0).getTime())],
    "超出保留期的旧明细应被裁剪"
  );
  assert.equal(pruned.totalMs, longStats.totalMs, "裁剪明细不应改动累计汇总");

  // summarize 的字段契约（reader.js 直接消费）
  const summary = summarize(stats, T1);
  assert.deepEqual(Object.keys(summary).sort(), [
    "speed",
    "streak",
    "todayChars",
    "todayMs",
    "totalChars",
    "totalMs"
  ]);
  assert.equal(summary.todayMs, 60000, "今日时长应为最后一次会话的 60 秒");
  assert.equal(summary.streak, 3, "汇总应带出连续天数");
  assert.ok(Number.isFinite(summary.speed), "有样本时速度应为有限值");

  console.log("✓ TC-S2-02 速度夹紧、剩余时长边界、连续天数与保留期裁剪正确");
}

console.log("reading stats tests passed (TC-S2-01~02)");
