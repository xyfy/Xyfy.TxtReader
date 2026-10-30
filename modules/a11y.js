// FR-S4 无障碍（键盘 / 读屏 / 对比度）
//
// 三块内容，共享一个原则：**能测的才写下来**。
//   - 焦点陷阱：把「Tab 只在浮层里循环」抽成可测的索引计算，而不是散在事件回调里
//   - 读屏语义：容器/aria 属性由 HTML 直接承担，测试断言断言 HTML（见 tests/a11y.test.mjs）
//   - 对比度：WCAG AA 阈值作为常量 + 审计函数，预设主题一律过一遍，不靠肉眼
//
// contrastRatio 复用 reader/reader-color.js 的实现（它本身是纯函数），
// 避免在项目里出现第二套对比度算法导致「提示说够、实际不够」。

import { contrastRatio, parseHex } from "../reader/reader-color.js";

// WCAG AA：正文 4.5:1；大字号（≥18pt / 14pt 粗体）与 UI 组件 3:1
export const MIN_CONTRAST_NORMAL = 4.5;
export const MIN_CONTRAST_LARGE = 3;

// 含 tabindex="-1" 的元素不参与 Tab 序（通常是用 JS 聚焦的容器）
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']"
].join(",");

// 与 reader.css 中的主题变量保持一致。改 CSS 必须同步改这里，
// tests/a11y.test.mjs 会用 CSS 里的真实值校验，防止两边漂移。
export const PRESET_PALETTES = {
  paper: {
    bgColor: "#e7dbc2",
    surfaceColor: "#f6efe0",
    textColor: "#2c231b",
    mutedColor: "#7a6651",
    accentColor: "#6e4e2c"
  },
  sepia: {
    bgColor: "#d9c4a6",
    surfaceColor: "#f3e6cb",
    textColor: "#3a2a16",
    mutedColor: "#75604a",
    accentColor: "#8c5227"
  },
  night: {
    bgColor: "#1a1f28",
    surfaceColor: "#232b37",
    textColor: "#e6dccb",
    mutedColor: "#b5a995",
    accentColor: "#d1a15d"
  }
};

/**
 * Tab 焦点索引计算（纯函数，可单测）。
 *
 * @param {{current: number, length: number, shift?: boolean}} params
 * @returns {number} 下一个应聚焦的索引；length 为 0 时返回 -1
 */
export function nextFocusIndex({ current, length, shift = false } = {}) {
  const count = Number(length) || 0;
  if (count <= 0) {
    return -1;
  }
  const index = Number(current);
  // 焦点不在容器内（比如刚打开浮层、或焦点跑到 body）时：
  // 正向从第一个开始，反向从最后一个开始
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    return shift ? count - 1 : 0;
  }
  return (index + (shift ? -1 : 1) + count) % count;
}

/** 单元素的「是否可 Tab 到」判定，抽成纯函数便于在没有 DOM 的环境里测。 */
export function isFocusableDescriptor({
  tagName = "",
  disabled = false,
  hidden = false,
  inert = false,
  tabIndex = 0,
  type = ""
} = {}) {
  if (disabled || hidden || inert) {
    return false;
  }
  const tag = String(tagName).toLowerCase();
  if (tag === "input" && String(type).toLowerCase() === "hidden") {
    return false;
  }
  return Number(tabIndex) >= 0;
}

/** 收集容器内可聚焦元素（按 DOM 顺序）。 */
export function getFocusableElements(container, doc = globalThis.document) {
  if (!container || typeof container.querySelectorAll !== "function") {
    return [];
  }
  const nodes = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
  return nodes.filter((node) => {
    if (node.hasAttribute?.("disabled") || node.getAttribute?.("aria-hidden") === "true") {
      return false;
    }
    if (Number(node.tabIndex) < 0) {
      return false;
    }
    // offsetParent 为 null 说明被 display:none 隐藏（fixed 定位元素除外，单独放行）
    if (typeof node.getClientRects === "function" && node.getClientRects().length === 0) {
      const style = doc?.defaultView?.getComputedStyle?.(node);
      if (!style || style.position !== "fixed") {
        return false;
      }
    }
    return true;
  });
}

/**
 * 焦点陷阱：浮层打开时把 Tab 锁在容器内，关闭后把焦点还给触发元素。
 * 没有它，键盘用户按 Tab 会直接跑到背景的侧栏里，屏幕上却在看模态框。
 */
export function createFocusTrap({ container, doc = globalThis.document, onEscape = null } = {}) {
  let active = false;
  let previousFocus = null;

  function handleKeydown(event) {
    if (!active) {
      return;
    }
    if (event.key === "Escape") {
      // 不 preventDefault：Escape 的业务语义仍由上层决定（关闭浮层）
      onEscape?.();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const items = getFocusableElements(container, doc);
    if (!items.length) {
      event.preventDefault();
      return;
    }
    const index = items.indexOf(doc.activeElement);
    const target = items[nextFocusIndex({ current: index, length: items.length, shift: event.shiftKey })];
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }

  return {
    activate() {
      if (active) {
        return;
      }
      active = true;
      previousFocus = doc.activeElement;
      doc.addEventListener("keydown", handleKeydown, true);
      const items = getFocusableElements(container, doc);
      items[0]?.focus();
    },
    deactivate() {
      if (!active) {
        return;
      }
      active = false;
      doc.removeEventListener("keydown", handleKeydown, true);
      // 焦点归还：否则读屏用户关掉浮层后会被扔回页面顶部，彻底失去位置感
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
      }
      previousFocus = null;
    },
    isActive() {
      return active;
    },
    handleKeydown
  };
}

/**
 * 两个颜色的对比度审计。
 * @returns {{ratio: number, required: number, passes: boolean}}
 */
export function auditContrast(foreground, background, { largeText = false } = {}) {
  const required = largeText ? MIN_CONTRAST_LARGE : MIN_CONTRAST_NORMAL;
  let ratio;
  try {
    ratio = contrastRatio(foreground, background);
  } catch {
    // 非法色值（取色器可能传来半截值）一律按最差处理，不要抛错打断整个面板
    ratio = 1;
  }
  if (!Number.isFinite(ratio)) {
    ratio = 1;
  }
  // 保留两位小数：4.4999 和 4.5 在显示上没有区别，但判定上要一致
  const rounded = Math.round(ratio * 100) / 100;
  return { ratio: rounded, required, passes: rounded >= required };
}

/**
 * 一整套配色的审计。检查项对应用户真实会看到的组合：
 * 正文在纸面上、正文在底色上、次要文字在纸面上、强调色在纸面上（UI 组件按 3:1）。
 */
export function auditPalette(palette, { largeText = false } = {}) {
  const safe = palette || {};
  const surface = safe.surfaceColor || safe.bgColor;
  const checks = [
    { name: "textOnSurface", foreground: safe.textColor, background: surface, largeText },
    { name: "textOnBg", foreground: safe.textColor, background: safe.bgColor, largeText },
    { name: "mutedOnSurface", foreground: safe.mutedColor, background: surface, largeText },
    { name: "accentOnSurface", foreground: safe.accentColor, background: surface, largeText: true }
  ].map((check) => ({
    ...check,
    ...auditContrast(check.foreground, check.background, { largeText: check.largeText })
  }));

  const failures = checks.filter((check) => !check.passes).map((check) => check.name);
  const worst = checks.reduce((min, check) => (check.ratio < min.ratio ? check : min), checks[0]);

  return { checks, failures, passes: failures.length === 0, worst };
}

/**
 * 校验某个十六进制色值是否可解析（取色器可能给出非法值）。
 */
export function isColorValue(value) {
  try {
    const parsed = parseHex(value);
    return Boolean(parsed) && [parsed.r, parsed.g, parsed.b].every((channel) => Number.isFinite(channel));
  } catch {
    return false;
  }
}
