// 阅读器快捷键映射模块
//
// 设计要点：
// - DEFAULT_KEYBINDINGS 是「动作 → 绑定」的单一事实来源，用户可在设置中覆盖。
// - 绑定对象：{ key, altKey?, ctrlKey?, metaKey?, shiftKey? }，key 为 KeyboardEvent.key 原值（空格为 " "）。
// - 每个动作可对应一个或多个绑定（数组）。
// - closeShortcuts（Escape）刻意保留在 DEFAULT_KEYBINDINGS 中用于帮助文案展示，
//   但在 reader.js 中 Escape 关闭浮层为不可重绑行为，不参与重绑匹配。

export const READER_ACTIONS = [
  "nextChapter",
  "prevChapter",
  "nextPage",
  "prevPage",
  "scrollLineDown",
  "scrollLineUp",
  "bookmark",
  "togglePanel",
  "toggleDebug",
  "openShortcuts",
  "closeShortcuts"
];

export const DEFAULT_KEYBINDINGS = {
  nextChapter: [{ key: "ArrowRight" }, { key: "]" }],
  prevChapter: [{ key: "ArrowLeft" }, { key: "[" }],
  nextPage: [{ key: " ", shiftKey: false }],
  prevPage: [{ key: " ", shiftKey: true }],
  scrollLineDown: [{ key: "ArrowDown" }],
  scrollLineUp: [{ key: "ArrowUp" }],
  bookmark: [{ key: "b" }],
  togglePanel: [{ key: "Tab" }],
  toggleDebug: [{ key: "d", altKey: true }],
  openShortcuts: [{ key: "?" }, { key: "h" }],
  closeShortcuts: [{ key: "Escape" }]
};

// 不可被用户重绑的动作（Escape 关闭浮层为保护性固定行为）。
export const PROTECTED_ACTIONS = ["closeShortcuts"];

function normalizeBinding(binding = {}) {
  const key = typeof binding.key === "string" ? binding.key : "";
  return {
    key,
    altKey: Boolean(binding.altKey),
    ctrlKey: Boolean(binding.ctrlKey),
    metaKey: Boolean(binding.metaKey),
    shiftKey: binding.shiftKey === undefined ? false : Boolean(binding.shiftKey)
  };
}

function sameBinding(left, right) {
  const a = normalizeBinding(left);
  const b = normalizeBinding(right);
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    a.altKey === b.altKey &&
    a.ctrlKey === b.ctrlKey &&
    a.metaKey === b.metaKey &&
    a.shiftKey === b.shiftKey
  );
}

function toBindingList(bindings) {
  if (!bindings) return [];
  return Array.isArray(bindings) ? bindings : [bindings];
}

// 将键盘事件匹配到动作；无匹配返回 null。
export function matchKeyBinding(event, keybindings = DEFAULT_KEYBINDINGS) {
  if (!event || typeof event.key !== "string" || event.key === "") {
    return null;
  }

  for (const action of READER_ACTIONS) {
    if (PROTECTED_ACTIONS.includes(action)) {
      continue;
    }
    const list = toBindingList(keybindings[action]);
    if (list.some((binding) => sameBinding(event, binding))) {
      return action;
    }
  }

  return null;
}

/**
 * 检测 `binding` 是否已被 `action` 之外的其他动作占用。返回冲突的动作名或 null。
 *
 * 受保护动作（Escape）本身不可被重绑，但它占用的键同样不能被别人抢走：
 * reader.js 里 Escape 是硬编码的「关闭浮层」行为，若允许用户把 Escape 绑到别的动作上，
 * 一次按键会同时触发两个行为。所以这里只跳过「自己」，不跳过受保护动作。
 */
export function detectKeybindingConflict(action, binding, keybindings = DEFAULT_KEYBINDINGS) {
  if (PROTECTED_ACTIONS.includes(action)) {
    return null;
  }
  const target = normalizeBinding(binding);
  for (const other of READER_ACTIONS) {
    if (other === action) {
      continue;
    }
    const list = toBindingList(keybindings[other]);
    if (list.some((candidate) => sameBinding(candidate, target))) {
      return other;
    }
  }
  return null;
}

// 常用键的显示名，避免界面里同时出现 "ArrowRight" 与 "→" 两种写法。
const KEY_LABELS = {
  " ": "Space",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
  Enter: "Enter",
  Tab: "Tab"
};

// 将绑定格式化为人类可读文案，例如 "Ctrl+Alt+D"、"Space"、"→"。
export function formatBinding(binding) {
  const b = normalizeBinding(binding);
  const parts = [];
  if (b.ctrlKey) parts.push("Ctrl");
  if (b.altKey) parts.push("Alt");
  if (b.metaKey) parts.push("Meta");
  if (b.shiftKey) parts.push("Shift");
  let key = b.key;
  if (Object.prototype.hasOwnProperty.call(KEY_LABELS, key)) {
    key = KEY_LABELS[key];
  } else {
    key = key.length === 1 ? key.toUpperCase() : key;
  }
  parts.push(key);
  return parts.join("+");
}

// 取出某动作的全部绑定（统一成数组，便于界面展示多绑定场景）。
export function getActionBindings(keybindings, action) {
  const list = keybindings ? keybindings[action] : null;
  if (Array.isArray(list)) {
    return list.filter((item) => item && typeof item.key === "string" && item.key !== "");
  }
  return list && typeof list.key === "string" && list.key !== "" ? [list] : [];
}

// 将某动作的全部绑定拼成一行展示文案，例如 "→ / ]"；无绑定时返回空串。
export function formatActionBindings(keybindings, action) {
  return getActionBindings(keybindings, action)
    .map((item) => formatBinding(item))
    .join(" / ");
}

// 将字符串渲染为单个绑定对象（用于把捕获到的按键序列转成可存储结构）。
export function eventToBinding(event) {
  return normalizeBinding({
    key: event.key,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey
  });
}

// 保留的兼容接口：基于事件参数解析动作（老逻辑，供测试/回退使用）。
export function resolveReaderKeyAction({
  key,
  altKey = false,
  shiftKey = false,
  ctrlKey = false,
  metaKey = false,
  isScrollMode = false,
  shortcutsOpen = false
}) {
  if (!key) {
    return null;
  }

  const lowerKey = key.toLowerCase();

  if (key === "Escape" && shortcutsOpen) {
    return { action: "closeShortcuts" };
  }

  if (key === "?" || lowerKey === "h") {
    return { action: "openShortcuts" };
  }

  if (key === "Tab") {
    return { action: "togglePanel" };
  }

  if (altKey && lowerKey === "d") {
    return { action: "toggleDebug" };
  }

  const hasModifier = altKey || ctrlKey || metaKey || shiftKey;

  if (key === "ArrowRight" && !hasModifier) {
    return { action: "nextChapter" };
  }

  if (key === "ArrowLeft" && !hasModifier) {
    return { action: "prevChapter" };
  }

  if (!isScrollMode && lowerKey === "j") {
    return { action: "nextPage" };
  }

  if (!isScrollMode && lowerKey === "k") {
    return { action: "prevPage" };
  }

  if (isScrollMode && key === "ArrowDown") {
    return { action: "scrollLineDown" };
  }

  if (isScrollMode && key === "ArrowUp") {
    return { action: "scrollLineUp" };
  }

  if (key === " ") {
    return { action: shiftKey ? "prevPage" : "nextPage" };
  }

  if (key === "[") {
    return { action: "prevChapter" };
  }

  if (key === "]") {
    return { action: "nextChapter" };
  }

  if (lowerKey === "b") {
    return { action: "bookmark" };
  }

  return null;
}
