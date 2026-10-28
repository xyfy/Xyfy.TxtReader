// 阅读器配色与字体的纯计算层：不碰 DOM 状态、不依赖阅读器业务状态，便于单测复用。

export const COLOR_KEYS = ["bgColor", "surfaceColor", "textColor", "mutedColor", "accentColor", "accentStrong"];

export const COLOR_VAR_MAP = {
  bgColor: "--bg-color",
  surfaceColor: "--surface-color",
  textColor: "--text-color",
  mutedColor: "--muted-color",
  accentColor: "--accent-color",
  accentStrong: "--accent-strong"
};

// 边框与纸影带透明度，取色器无法表达，统一由正文色派生
export const DERIVED_VAR_ALPHA = {
  "--border-color": 0.22,
  "--surface-shadow": 0.18
};

// 仅允许字体族常见字符，拒绝 < > ; @ 与 url() 等可能注入/破坏布局的内容。
const FONT_FAMILY_SAFE = /^[A-Za-z0-9 ,."'_()-]+$/;

export function isFontFamilyValueSafe(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  if (/[<>;@]/.test(value) || /url\(/i.test(value)) return false;
  return FONT_FAMILY_SAFE.test(value.trim());
}

export function getEffectiveFont(settings) {
  const custom = settings?.customFont;
  if (custom && isFontFamilyValueSafe(custom)) {
    return custom;
  }
  return settings?.fontFamily;
}

export function toColorInputValue(hex) {
  return typeof hex === "string" && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000";
}

export function rgbStringToHex(value) {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(value || "");
  if (!m) return "";
  return `#${[1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, "0")).join("")}`;
}

export function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export function relativeLuminance({ r, g, b }) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(hexA, hexB) {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  if (!a || !b) return null;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export function hexToRgba(hex, alpha) {
  const rgb = parseHex(hex);
  if (!rgb) return "";
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

// 按比例把颜色推向黑/白，用于由主色派生出外壳渐变的第二色
export function shiftHex(hex, amount) {
  const rgb = parseHex(hex);
  if (!rgb) return "";
  const target = amount < 0 ? 0 : 255;
  const mix = Math.abs(amount);
  const channel = (c) => Math.round(c + (target - c) * mix);
  return `#${[rgb.r, rgb.g, rgb.b].map((c) => channel(c).toString(16).padStart(2, "0")).join("")}`;
}

// 读取当前生效的调色板（用于切入自定义主题时以现有观感为起点）
export function captureCurrentPalette() {
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.append(probe);
  const palette = {};
  for (const key of COLOR_KEYS) {
    probe.style.color = `var(${COLOR_VAR_MAP[key]})`;
    palette[key] = rgbStringToHex(getComputedStyle(probe).color);
  }
  probe.remove();
  return palette;
}

// 预设主题调色板按主题缓存：主题生效时采样一次即可，避免拖动滑块等高频重绘反复测量
export function createPaletteCache() {
  const cache = new Map();
  return {
    get(theme) {
      if (!cache.has(theme)) cache.set(theme, captureCurrentPalette());
      return cache.get(theme);
    },
    clear() {
      cache.clear();
    }
  };
}
