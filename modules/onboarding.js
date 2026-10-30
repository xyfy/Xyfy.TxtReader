// FR-S1 首次引导与默认值
//
// 两个独立职责，刻意放在同一个模块里，因为它们共享同一份「新用户初值」判断：
//   1. 引导浮层该不该出现（只在新用户、且没书时出现，装完就再别打扰）
//   2. 默认值推荐（窄屏单页小字号，宽屏双页大字号，触屏行高更松）
//
// 全部为纯函数：不碰 DOM、不读 storage，方便 Node 单测，也避免引导逻辑散进 reader.js。

// 引导内容版本：将来引导内容大改（比如新增第 4 步）可以递增，
// 让老用户也看一次新版引导；小改文案不要动它。
export const ONBOARDING_VERSION = 1;

export const ONBOARDING_STEPS = [
  {
    id: "import",
    titleKey: "onboardingImportTitle",
    bodyKey: "onboardingImportBody"
  },
  {
    id: "read",
    titleKey: "onboardingReadTitle",
    bodyKey: "onboardingReadBody"
  },
  {
    id: "backup",
    titleKey: "onboardingBackupTitle",
    bodyKey: "onboardingBackupBody"
  }
];

// 视口断点：与 CSS 里的窄屏折叠保持一致，避免「JS 认为宽屏、CSS 已折叠」的错位
export const VIEWPORT_BREAKPOINTS = {
  compact: 720,
  wide: 1280
};

/**
 * 是否展示引导。
 * 三条退出条件缺一不可：已完成（含跳过）、已有书、或已看过本版本引导。
 *
 * @param {{settings?: object, bookCount?: number}} params
 * @returns {boolean}
 */
export function shouldShowOnboarding({ settings, bookCount = 0 } = {}) {
  const safeSettings = settings || {};
  if (safeSettings.onboardingDone) {
    return false;
  }
  // 引导的最终目的是「让人导入第一本书」。既然已经有书，说明目的已达成，不该再挡路。
  if (Number(bookCount) > 0) {
    return false;
  }
  const seenVersion = Number(safeSettings.onboardingVersion || 0);
  if (seenVersion >= ONBOARDING_VERSION) {
    return false;
  }
  return true;
}

/**
 * 按设备给出初值推荐。
 *
 * @param {{viewportWidth?: number, viewportHeight?: number, devicePixelRatio?: number, coarsePointer?: boolean}} params
 * @returns {{fontSize: number, lineHeight: number, pagesPerView: number, readingMode: string, reason: string}}
 */
export function recommendDefaults({
  viewportWidth = 1280,
  viewportHeight = 800,
  devicePixelRatio = 1,
  coarsePointer = false
} = {}) {
  const width = Number(viewportWidth) || 0;
  const height = Number(viewportHeight) || 0;
  const dpr = Number(devicePixelRatio) || 1;

  let fontSize;
  let lineHeight;
  let pagesPerView;
  let reason;

  if (width < VIEWPORT_BREAKPOINTS.compact) {
    // 窄屏：双页会把每页压到 150px 出头，一行放不下 10 个字，必须单页
    fontSize = 17;
    lineHeight = 1.9;
    pagesPerView = 1;
    reason = "compact";
  } else if (width < VIEWPORT_BREAKPOINTS.wide) {
    // 平板竖屏 / 小窗口：单页更舒服，但字号保持
    fontSize = 18;
    lineHeight = 1.8;
    pagesPerView = width >= 1024 ? 2 : 1;
    reason = "medium";
  } else {
    // 宽屏：双页 + 稍大字号，避免大留白显得空
    fontSize = 20;
    lineHeight = 1.8;
    pagesPerView = 2;
    reason = "wide";
  }

  // 触摸设备：行距再松一点，减少误触翻页
  if (coarsePointer) {
    lineHeight = Math.round((lineHeight + 0.1) * 10) / 10;
    reason += "+touch";
  }

  // 超矮视口（横屏手机）撑不下大字号两行，回退一档
  if (height > 0 && height < 480 && fontSize > 17) {
    fontSize -= 1;
    reason += "+short";
  }

  // 高 DPR 屏不需要更大字号，但 0.5 像素渲染会让细体发虚，这里只记录不放大
  if (dpr >= 2 && fontSize < 17) {
    fontSize = 17;
  }

  return { fontSize, lineHeight, pagesPerView, readingMode: "book", reason };
}

/**
 * 把推荐值写进设置。
 * 只在用户从未手动调过版式时生效——否则老用户升上来字号会被悄悄改掉。
 *
 * 注意：**页码（单页/双页）不落盘**。它由 `detectPagesPerView` 按实时视口决定，
 * 一旦写进设置，用户把窗口拉窄就会卡在双页挤压状态，属于典型的「聪明反被聪明误」。
 * 这里推荐的 `pagesPerView` 只用于首次渲染时的一次性提示与统计口径。
 *
 * @param {object} settings
 * @param {object} recommendation recommendDefaults 的返回
 * @param {{tuned?: boolean}} options
 * @returns {object} 新设置对象（不可变）
 */
export function applyRecommendation(settings, recommendation, { tuned = false } = {}) {
  const next = { ...(settings || {}) };
  if (tuned || !recommendation) {
    return next;
  }
  next.fontSize = recommendation.fontSize;
  next.lineHeight = recommendation.lineHeight;
  next.readingMode = recommendation.readingMode;
  return next;
}

/**
 * 标记引导已完成（或已跳过）。
 * 跳过也要落盘，否则用户每次打开都被拦一次，是最招人烦的一类设计。
 */
export function markOnboardingDone(settings, { skipped = false, now = Date.now() } = {}) {
  return {
    ...(settings || {}),
    onboardingDone: true,
    onboardingVersion: ONBOARDING_VERSION,
    onboardingSkipped: Boolean(skipped),
    onboardingCompletedAt: Number(now)
  };
}

/**
 * 单步导航。step 越界时夹紧而不是回绕——回绕会让用户点「下一步」从最后一步跳回第一步。
 */
export function getStep(index) {
  const safeIndex = Math.min(Math.max(Number(index) || 0, 0), ONBOARDING_STEPS.length - 1);
  return {
    step: ONBOARDING_STEPS[safeIndex],
    index: safeIndex,
    total: ONBOARDING_STEPS.length,
    isLast: safeIndex === ONBOARDING_STEPS.length - 1
  };
}

export function nextStepIndex(index) {
  return Math.min((Number(index) || 0) + 1, ONBOARDING_STEPS.length - 1);
}
