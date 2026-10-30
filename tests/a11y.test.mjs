// FR-S4 无障碍：TC-S4-01 / TC-S4-02
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIN_CONTRAST_LARGE,
  MIN_CONTRAST_NORMAL,
  PRESET_PALETTES,
  auditContrast,
  auditPalette,
  createFocusTrap,
  isColorValue,
  isFocusableDescriptor,
  nextFocusIndex
} from "../modules/a11y.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// --- TC-S4-01 焦点陷阱：循环、反向、焦点归还 ---
{
  // 纯索引计算
  assert.equal(nextFocusIndex({ current: 0, length: 3 }), 1, "正向应前进一位");
  assert.equal(nextFocusIndex({ current: 2, length: 3 }), 0, "末尾应回到开头");
  assert.equal(nextFocusIndex({ current: 0, length: 3, shift: true }), 2, "反向应回到末尾");
  assert.equal(nextFocusIndex({ current: 1, length: 3, shift: true }), 0, "反向应后退一位");
  assert.equal(nextFocusIndex({ current: -1, length: 3 }), 0, "焦点不在容器内时正向从第一个开始");
  assert.equal(nextFocusIndex({ current: -1, length: 3, shift: true }), 2, "焦点不在容器内时反向从最后一个开始");
  assert.equal(nextFocusIndex({ current: 0, length: 0 }), -1, "空容器应返回 -1");

  // 可聚焦判定
  assert.equal(isFocusableDescriptor({ tagName: "BUTTON" }), true, "按钮可聚焦");
  assert.equal(isFocusableDescriptor({ tagName: "BUTTON", disabled: true }), false, "禁用按钮不可聚焦");
  assert.equal(isFocusableDescriptor({ tagName: "INPUT", type: "hidden" }), false, "hidden input 不可聚焦");
  assert.equal(isFocusableDescriptor({ tagName: "DIV", tabIndex: -1 }), false, "tabindex=-1 不参与 Tab 序");
  assert.equal(isFocusableDescriptor({ tagName: "DIV", hidden: true }), false, "隐藏元素不可聚焦");

  // 用最小假 DOM 验证陷阱行为（真实浏览器行为由人工冒烟覆盖）
  const makeNode = (id) => ({
    id,
    tabIndex: 0,
    focused: false,
    hasAttribute: () => false,
    getAttribute: () => null,
    getClientRects: () => [{ width: 10 }],
    focus() {
      this.focused = true;
      doc.activeElement = this;
    }
  });
  const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
  const trigger = makeNode("trigger");
  const container = { querySelectorAll: () => nodes };
  const listeners = new Map();
  const doc = {
    activeElement: trigger,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type)
  };

  const trap = createFocusTrap({ container, doc });
  trap.activate();
  assert.equal(trap.isActive(), true, "激活后应处于陷阱状态");
  assert.equal(doc.activeElement.id, "a", "激活时应聚焦第一个可聚焦元素");

  const tab = (shiftKey = false) => {
    let prevented = false;
    trap.handleKeydown({ key: "Tab", shiftKey, preventDefault: () => (prevented = true) });
    return prevented;
  };

  tab();
  assert.equal(doc.activeElement.id, "b", "Tab 应移到下一个元素");
  tab();
  assert.equal(doc.activeElement.id, "c", "Tab 应移到最后一个元素");
  const preventedAtEnd = tab();
  assert.equal(doc.activeElement.id, "a", "最后一个元素再 Tab 应回到第一个");
  assert.equal(preventedAtEnd, true, "循环时必须 preventDefault，否则焦点会漏出浮层");

  tab(true);
  assert.equal(doc.activeElement.id, "c", "Shift+Tab 从第一个应回到最后一个");

  // 焦点不在容器内（比如用户点了背景）：Tab 应把焦点收回容器
  doc.activeElement = trigger;
  tab();
  assert.equal(doc.activeElement.id, "a", "焦点跑出容器后应按 Tab 拉回第一个");

  trap.deactivate();
  assert.equal(trap.isActive(), false, "关闭后应退出陷阱状态");
  assert.equal(doc.activeElement.id, "trigger", "关闭后焦点必须归还触发元素");
  assert.equal(listeners.has("keydown"), false, "关闭后应移除键盘监听，避免泄漏");

  // 重复 activate 不应叠加监听
  trap.activate();
  trap.activate();
  assert.equal(listeners.size, 1, "重复激活不应重复绑定监听");
  trap.deactivate();

  console.log("✓ TC-S4-01 焦点陷阱循环、反向遍历、焦点归还与监听清理正确");
}

// --- TC-S4-02 预设主题对比度 + 与 CSS 实际值一致 ---
{
  for (const [name, palette] of Object.entries(PRESET_PALETTES)) {
    const audit = auditPalette(palette);
    assert.equal(audit.passes, true, `${name} 主题存在对比度不达标项：${audit.failures.join(", ")}`);
    assert.ok(audit.worst.ratio >= MIN_CONTRAST_NORMAL, `${name} 最差对比度应达 4.5：${audit.worst.ratio}`);
  }

  // 正文对比度必须明显高于阈值，不能贴线
  const paperText = auditContrast(PRESET_PALETTES.paper.textColor, PRESET_PALETTES.paper.surfaceColor);
  assert.ok(paperText.ratio > 10, `纸张主题正文对比度应远高于阈值：${paperText.ratio}`);

  // 大字号阈值更低（3:1），同一组颜色在大字号下应通过
  const large = auditContrast("#8a7a6a", "#ffffff", { largeText: true });
  const normal = auditContrast("#8a7a6a", "#ffffff", { largeText: false });
  assert.equal(large.required, MIN_CONTRAST_LARGE, "大字号阈值应为 3");
  assert.equal(normal.required, MIN_CONTRAST_NORMAL, "正文阈值应为 4.5");
  assert.equal(large.passes && !normal.passes, true, "临界色应在大字号通过、正文不通过");

  // 低对比度配色必须被判定失败，并给出真实比值（用于提示文案）
  const bad = auditPalette({ bgColor: "#ffffff", surfaceColor: "#fefefe", textColor: "#f8f8f8", mutedColor: "#f5f5f5", accentColor: "#eeeeee" });
  assert.equal(bad.passes, false, "低对比度配色应被判失败");
  assert.ok(bad.failures.includes("textOnSurface"), "应指出正文与纸面不达标");
  assert.ok(bad.worst.ratio < 1.5, `应给出真实比值：${bad.worst.ratio}`);

  // 非法色值不应抛错，而是给出失败结论（取色器可能传来半截值）
  assert.equal(auditContrast("#zzz", "#fff").passes, false, "非法色值应判失败而不是抛错");
  assert.equal(isColorValue("#2c231b"), true, "合法色值应被识别");
  assert.equal(isColorValue("not-a-color"), false, "非法色值应被拒绝");

  // 模块里的调色板必须与 CSS 真实值一致，防止「审计通过但线上还是旧颜色」
  const css = readFileSync(path.join(root, "reader/reader.css"), "utf8");
  const rootBlock = /:root\s*\{([\s\S]*?)\}/.exec(css)?.[1] || "";
  const sepiaBlock = /body\[data-theme="sepia"\]\s*\{([\s\S]*?)\}/.exec(css)?.[1] || "";
  const nightBlock = /body\[data-theme="night"\]\s*\{([\s\S]*?)\}/.exec(css)?.[1] || "";
  const vars = (block) => {
    const out = {};
    for (const m of block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{3,8})/g)) out[m[1]] = m[2].toLowerCase();
    return out;
  };
  const base = vars(rootBlock);
  const merged = (block) => ({ ...base, ...vars(block) });

  const cssPalettes = {
    paper: { bgColor: base["bg-color"], surfaceColor: base["surface-color"], textColor: base["text-color"], mutedColor: base["muted-color"], accentColor: base["accent-color"] },
    sepia: merged(sepiaBlock),
    night: merged(nightBlock)
  };
  const fixKey = (key) => key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

  for (const [name, expected] of Object.entries(PRESET_PALETTES)) {
    const fromCss = {};
    for (const [key, value] of Object.entries(cssPalettes[name])) {
      fromCss[fixKey(key)] = value;
    }
    for (const [key, value] of Object.entries(expected)) {
      assert.equal(
        fromCss[key],
        value.toLowerCase(),
        `${name}.${key} 与 CSS 实际值不一致（CSS=${fromCss[key]}，模块=${value}）`
      );
    }
  }

  console.log("✓ TC-S4-02 三套预设主题均达 AA，且模块调色板与 CSS 实际值一致");
}

console.log("a11y tests passed (TC-S4-01~02)");
