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