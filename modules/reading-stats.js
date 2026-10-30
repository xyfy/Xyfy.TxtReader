// FR-S2 阅读统计细化
//
// 现有统计面板只有「现在在哪」（章 / 页 / 字数），是位置快照。
// 这里补的是「读了多少、读得多快、还剩多久」，即行为统计。
//
// 关键约束：
//   1. 全部本地计算、本地存储，**不上传**（与 FR-C3 的错误上报完全独立）。
//   2. 时钟可注入，否则「跨天」「连续天数」这类逻辑根本没法写测试。
//   3. 空闲不计时：挂着页面去吃饭不能算成阅读时长，否则速度统计全废。

export const IDLE_TIMEOUT_MS = 120000;
// 低于 5 秒的会话不记账：翻一页就关掉会产生大量噪声碎片
export const MIN_SESSION_MS = 5000;
// 保留 30 天明细，再久只留汇总，避免存储无限膨胀
export const HISTORY_DAYS = 30;

// 阅读速度合理区间（字/分钟）。中文阅读 300-800 属正常，
// 低于 50 基本是「挂着没看」，高于 3000 说明字符增量算错了（比如整章一次性计入）。
export const SPEED_FLOOR = 50;
export const SPEED_CEILING = 3000;

const STATS_VERSION = 1;

export function createStats(initial = {}) {
  return {
    version: STATS_VERSION,
    totalMs: 0,
    totalChars: 0,
    lastActiveAt: 0,
    days: {},
    ...initial
  };
}

/** 本地日期键（YYYY-MM-DD）。用本地时区，跨时区出差也不会把一天拆成两天。 */
export function dayKeyOf(timestamp) {
  const date = new Date(Number(timestamp) || 0);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDayKey(key, deltaDays) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + deltaDays);
  return dayKeyOf(date.getTime());
}

function normalizeDuration(durationMs) {
  const value = Number(durationMs);
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  // 单次会话封顶 4 小时：防止标签页从休眠唤醒后把整夜算成阅读
  return Math.min(value, IDLE_TIMEOUT_MS * 120);
}

/**
 * 记一次阅读会话。
 *
 * @param {object} stats createStats 的产物
 * @param {{startedAt?: number, endedAt?: number, durationMs?: number, charsRead?: number}} session
 * @returns {object} 新 stats（不可变）
 */
export function recordSession(stats, session = {}) {
  const base = stats || createStats();
  const durationMs = normalizeDuration(
    session.durationMs ?? (Number(session.endedAt) - Number(session.startedAt))
  );

  // 太短的会话直接丢弃，但要返回等价副本，保证调用方拿到的永远是「新对象」
  if (durationMs < MIN_SESSION_MS) {
    return { ...base, days: { ...base.days } };
  }

  const charsRead = Math.max(0, Math.round(Number(session.charsRead) || 0));
  // 结束时间优先取显式值，其次由「开始时间 + 时长」推出来。
  // 不能直接回退到 Date.now()：补记历史会话（或测试）会把数据记到今天。
  const startedAt = Number(session.startedAt);
  const endedAt =
    Number(session.endedAt) || (Number.isFinite(startedAt) && startedAt > 0 ? startedAt + durationMs : Date.now());
  const key = dayKeyOf(endedAt);
  const existing = base.days?.[key] || { ms: 0, chars: 0 };

  return {
    ...base,
    version: STATS_VERSION,
    totalMs: Number(base.totalMs || 0) + durationMs,
    totalChars: Number(base.totalChars || 0) + charsRead,
    lastActiveAt: endedAt,
    days: {
      ...base.days,
      [key]: {
        ms: Number(existing.ms || 0) + durationMs,
        chars: Number(existing.chars || 0) + charsRead
      }
    }
  };
}

export function getDayStats(stats, timestamp = Date.now()) {
  const entry = stats?.days?.[dayKeyOf(timestamp)];
  return { ms: Number(entry?.ms || 0), chars: Number(entry?.chars || 0) };
}

/**
 * 阅读速度（字 / 分钟）。
 * 返回 null 表示「样本不足，别瞎猜」——比返回 0 或 Infinity 强，UI 好处理。
 */
export function computeSpeed({ charsRead, durationMs } = {}) {
  const chars = Number(charsRead);
  const duration = Number(durationMs);
  if (!Number.isFinite(chars) || !Number.isFinite(duration) || duration < MIN_SESSION_MS || chars <= 0) {
    return null;
  }
  const perMinute = (chars / duration) * 60000;
  if (!Number.isFinite(perMinute)) {
    return null;
  }
  return Math.min(Math.max(Math.round(perMinute), SPEED_FLOOR), SPEED_CEILING);
}

/**
 * 剩余阅读时长估算（毫秒）。返回 null 表示无法估算（已读完 / 速度未知）。
 */
export function estimateRemaining({ remainingChars, speed } = {}) {
  const chars = Number(remainingChars);
  const charsPerMinute = Number(speed);
  if (!Number.isFinite(chars) || chars <= 0) {
    return null;
  }
  if (!Number.isFinite(charsPerMinute) || charsPerMinute <= 0) {
    return null;
  }
  return Math.round((chars / charsPerMinute) * 60000);
}

/**
 * 连续阅读天数。
 * 今天还没读不算断——按「最近一次阅读日」往前数，否则用户每天早上打开都看到 0，很打击人。
 */
export function computeStreak(stats, now = Date.now()) {
  const days = stats?.days || {};
  let cursor = dayKeyOf(now);
  if (!days[cursor] || Number(days[cursor].ms || 0) <= 0) {
    cursor = shiftDayKey(cursor, -1);
    if (!days[cursor] || Number(days[cursor].ms || 0) <= 0) {
      return 0;
    }
  }
  let streak = 0;
  // 上限 HISTORY_DAYS * 10 只是防御性死循环保护
  for (let i = 0; i < HISTORY_DAYS * 10; i += 1) {
    const entry = days[cursor];
    if (!entry || Number(entry.ms || 0) <= 0) {
      break;
    }
    streak += 1;
    cursor = shiftDayKey(cursor, -1);
  }
  return streak;
}

/** 丢弃超出保留期的明细（按天粒度，不精确到小时）。 */
export function pruneHistory(stats, { now = Date.now(), days = HISTORY_DAYS } = {}) {
  const keepFrom = shiftDayKey(dayKeyOf(now), -(days - 1));
  const next = {};
  for (const [key, value] of Object.entries(stats?.days || {})) {
    if (key >= keepFrom) {
      next[key] = value;
    }
  }
  return { ...stats, days: next };
}

/**
 * 面板要展示的一整组数字。
 * 速度优先用「今日」样本，今日没有就退回最近一次会话的速度。
 */
export function summarize(stats, now = Date.now()) {
  const today = getDayStats(stats, now);
  const todaySpeed = computeSpeed({ charsRead: today.chars, durationMs: today.ms });
  return {
    todayMs: today.ms,
    todayChars: today.chars,
    totalMs: Number(stats?.totalMs || 0),
    totalChars: Number(stats?.totalChars || 0),
    speed: todaySpeed,
    streak: computeStreak(stats, now)
  };
}

/** 时长拆成时分秒，交给 i18n 拼文案（模块本身不产出人类语言）。 */
export function splitDuration(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0));
  const seconds = Math.floor(total / 1000);
  return {
    hours: Math.floor(seconds / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60
  };
}
