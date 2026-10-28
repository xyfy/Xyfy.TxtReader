// 配色/字体纯计算层单测：不依赖 DOM 与业务状态
import assert from "node:assert/strict";
import {
  COLOR_KEYS,
  COLOR_VAR_MAP,
  DERIVED_VAR_ALPHA,
  contrastRatio,
  getEffectiveFont,
  hexToRgba,
  isFontFamilyValueSafe,
  parseHex,
  relativeLuminance,
  rgbStringToHex,
  shiftHex,
  toColorInputValue
} from "../reader/reader-color.js";

assert.equal(COLOR_KEYS.length, 6, "6 个可调颜色键");
for (const key of COLOR_KEYS) {
  assert.ok(COLOR_VAR_MAP[key], `颜色键 ${key} 缺少 CSS 变量映射`);
}
assert.deepEqual(Object.keys(COLOR_VAR_MAP).sort(), [...COLOR_KEYS].sort(), "变量映射与颜色键一一对应");
for (const [name, alpha] of Object.entries(DERIVED_VAR_ALPHA)) {
  assert.ok(name.startsWith("--"), `${name} 不是 CSS 变量名`);
  assert.ok(alpha > 0 && alpha < 1, `${name} 的透明度应在 0~1 之间`);
}

assert.deepEqual(parseHex("#2c231b"), { r: 44, g: 35, b: 27 });
assert.deepEqual(parseHex("2c231b"), { r: 44, g: 35, b: 27 }, "应容忍省略 #");
assert.equal(parseHex("#abc"), null, "短十六进制应判为非法");
assert.equal(parseHex(""), null);
assert.equal(parseHex("#zzzzzz"), null);

// 白/黑相对亮度是 WCAG 定义的边界值
assert.ok(Math.abs(relativeLuminance({ r: 255, g: 255, b: 255 }) - 1) < 1e-6);
assert.ok(Math.abs(relativeLuminance({ r: 0, g: 0, b: 0 })) < 1e-6);

assert.ok(Math.abs(contrastRatio("#ffffff", "#000000") - 21) < 0.01, "黑白对比度应为 21:1");
assert.ok(Math.abs(contrastRatio("#000000", "#ffffff") - 21) < 0.01, "对比度应与顺序无关");
assert.ok(contrastRatio("#2c231b", "#f6efe0") > 7, "纸面预设正文应达到 AAA");
assert.equal(contrastRatio("#abc", "#000000"), null, "非法输入返回 null 而非抛错");

assert.equal(hexToRgba("#2c231b", 0.22), "rgba(44, 35, 27, 0.22)");
assert.equal(hexToRgba("bad", 0.5), "", "非法输入返回空串");

assert.equal(shiftHex("#808080", -0.5), "#404040", "负值向黑推移");
assert.equal(shiftHex("#808080", 0.5), "#c0c0c0", "正值向白推移");
assert.equal(shiftHex("bad", 0.5), "");

assert.equal(toColorInputValue("#123abc"), "#123abc");
assert.equal(toColorInputValue("#123ab"), "#000000", "短值应回落为默认黑");
assert.equal(toColorInputValue(null), "#000000");

assert.equal(rgbStringToHex("rgb(44, 35, 27)"), "#2c231b");
assert.equal(rgbStringToHex("rgba(44, 35, 27, 0.5)"), "#2c231b", "应忽略透明度");
assert.equal(rgbStringToHex(""), "");

// 字体栈安全校验：拦住可能破坏样式或注入的内容
assert.equal(isFontFamilyValueSafe('"LXGW WenKai", serif'), true);
assert.equal(isFontFamilyValueSafe("Microsoft YaHei, sans-serif"), true);
assert.equal(isFontFamilyValueSafe("Arial; background: url(http://x)"), false, "应拦截分号注入");
assert.equal(isFontFamilyValueSafe("url(http://evil)"), false, "应拦截 url()");
assert.equal(isFontFamilyValueSafe(""), false);
assert.equal(isFontFamilyValueSafe(null), false);

assert.equal(getEffectiveFont({ customFont: '"Kaiti SC", serif', fontFamily: "Georgia" }), '"Kaiti SC", serif');
assert.equal(getEffectiveFont({ customFont: "evil; url(x)", fontFamily: "Georgia" }), "Georgia", "非法自定义字体应回退");
assert.equal(getEffectiveFont({ fontFamily: "Georgia" }), "Georgia", "未设置自定义字体时回退预设");

console.log("reader color tests passed");
