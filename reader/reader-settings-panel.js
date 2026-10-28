// 设置面板控制器：分区快捷导航、云备份折叠、快捷键列表与重绑。
// 只负责面板自身的 DOM 行为，业务状态通过注入的读写函数进出，便于单独测试。
import {
  DEFAULT_KEYBINDINGS,
  READER_ACTIONS,
  detectKeybindingConflict,
  eventToBinding,
  formatActionBindings
} from "../modules/keyboard-map.js";

export const ACTION_LABEL_KEY = {
  nextChapter: "actNextChapter",
  prevChapter: "actPrevChapter",
  nextPage: "actNextPage",
  prevPage: "actPrevPage",
  scrollLineDown: "actScrollLineDown",
  scrollLineUp: "actScrollLineUp",
  bookmark: "actBookmark",
  togglePanel: "actTogglePanel",
  toggleDebug: "actToggleDebug",
  openShortcuts: "actOpenShortcuts",
  closeShortcuts: "actCloseShortcuts"
};

const NAV_OFFSET = 8;
// 点击导航后的锁定窗口：目标分区可能因内容不足一屏而滚不到顶部，
// 此时按实际滚动位置反推会把高亮跳到相邻分区，用锁定避免"点了却高亮别人"。
const PIN_DURATION_MS = 1000;

export function createSettingsPanel({ elements, t, getKeybindings, setKeybindings, isOpen }) {
  let navPinnedUntil = 0;
  let rebindState = null;

  function settingsCard() {
    return elements.settingsOverlay?.querySelector(".settings-card");
  }

  function isCloudExpanded() {
    return elements.cloudSectionToggle?.getAttribute("aria-expanded") === "true";
  }

  function setCloudExpanded(expanded) {
    const toggle = elements.cloudSectionToggle;
    const body = elements.cloudSectionBody;
    if (!toggle || !body) return;
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    body.classList.toggle("is-collapsed", !expanded);
    const hint = toggle.querySelector(".section-toggle-hint");
    if (hint) hint.textContent = t(expanded ? "cloudCollapse" : "cloudExpand");
  }

  function stickyHeight() {
    const sticky = elements.settingsOverlay?.querySelector(".settings-sticky");
    return (sticky?.offsetHeight || 0) + NAV_OFFSET;
  }

  function setActiveChip(activeChip) {
    const nav = elements.settingsNav;
    if (!nav) return;
    for (const chip of nav.querySelectorAll(".settings-nav-chip")) {
      chip.classList.toggle("is-active", chip === activeChip);
    }
  }

  function scrollToSection(sectionId) {
    const card = settingsCard();
    const target = sectionId ? document.getElementById(sectionId) : null;
    if (!card || !target) return;
    // 导航点到云备份时先展开，否则用户点进去只能看到一行标题
    if (sectionId === "settings-cloud" && !isCloudExpanded()) {
      setCloudExpanded(true);
    }
    card.scrollTo({ top: Math.max(0, target.offsetTop - stickyHeight()), behavior: "smooth" });
  }

  function syncActiveChip() {
    const nav = elements.settingsNav;
    const card = settingsCard();
    if (!nav || !card || !isOpen() || Date.now() < navPinnedUntil) return;
    const chips = Array.from(nav.querySelectorAll(".settings-nav-chip"));
    if (!chips.length) return;
    const probe = card.scrollTop + stickyHeight() + 16;
    let active = chips[0];
    for (const chip of chips) {
      const section = chip.dataset.target ? document.getElementById(chip.dataset.target) : null;
      if (section && section.offsetTop <= probe) active = chip;
    }
    // 滚到底时点亮最后一个分区，但仅在探针确实越过它时生效（内容不足一屏不算）
    const lastChip = chips[chips.length - 1];
    const lastSection = document.getElementById(lastChip.dataset.target);
    const atBottom = card.scrollTop + card.clientHeight >= card.scrollHeight - 4;
    if (lastSection && atBottom && lastSection.offsetTop <= probe) active = lastChip;
    setActiveChip(active);
  }

  function actionLabel(action) {
    return t(ACTION_LABEL_KEY[action] || action);
  }

  function refreshShortcutList() {
    if (!elements.shortcutList) return;
    elements.shortcutList.innerHTML = "";
    for (const action of READER_ACTIONS) {
      if (action === "closeShortcuts") continue; // Escape 关闭浮层不可重绑
      const row = document.createElement("div");
      row.className = "shortcut-row";
      const label = document.createElement("span");
      label.className = "shortcut-label";
      label.textContent = actionLabel(action);
      const keyBtn = document.createElement("button");
      keyBtn.type = "button";
      keyBtn.className = "shortcut-key";
      // 展示全部绑定；重绑会整体替换为该动作的新键位，用 title 说明，避免用户误以为会追加。
      const keys = formatActionBindings(getKeybindings(), action);
      keyBtn.textContent = keys || "—";
      keyBtn.title = t("shortcutRebindHint");
      keyBtn.addEventListener("click", () => startRebind(action, keyBtn));
      row.append(label, keyBtn);
      elements.shortcutList.append(row);
    }
  }

  function startRebind(action, buttonEl) {
    if (rebindState) {
      rebindState.cleanup();
    }
    buttonEl.textContent = "…";
    buttonEl.classList.add("capturing");

    const cleanup = () => {
      document.removeEventListener("keydown", handler, true);
      buttonEl.classList.remove("capturing");
      rebindState = null;
      buttonEl.textContent = formatActionBindings(getKeybindings(), action) || "—";
    };

    const handler = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        cleanup();
        return;
      }
      const binding = eventToBinding(event);
      const conflict = detectKeybindingConflict(action, binding, getKeybindings());
      if (conflict) {
        buttonEl.textContent = t("warnKeyConflict", { action: actionLabel(conflict) });
        cleanup();
        return;
      }
      setKeybindings({ ...getKeybindings(), [action]: [binding] });
      cleanup();
      refreshShortcutList();
    };

    rebindState = { cleanup };
    document.addEventListener("keydown", handler, true);
  }

  function resetKeys() {
    setKeybindings(JSON.parse(JSON.stringify(DEFAULT_KEYBINDINGS)));
    refreshShortcutList();
  }

  function prepareOpen() {
    refreshShortcutList();
    const card = settingsCard();
    // 每次打开都回到顶部，避免上次的滚动位置让用户一进来就是半截面板
    if (card) card.scrollTop = 0;
    navPinnedUntil = 0;
    // 等隐藏类移除、布局稳定后再计算选中分区
    requestAnimationFrame(syncActiveChip);
  }

  function init() {
    const nav = elements.settingsNav;
    const card = settingsCard();
    if (nav) {
      nav.addEventListener("click", (event) => {
        const chip = event.target.closest(".settings-nav-chip");
        if (!chip) return;
        navPinnedUntil = Date.now() + PIN_DURATION_MS;
        setActiveChip(chip);
        scrollToSection(chip.dataset.target);
      });
    }
    if (card) {
      let ticking = false;
      card.addEventListener(
        "scroll",
        () => {
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(() => {
            ticking = false;
            syncActiveChip();
          });
        },
        { passive: true }
      );
    }
    elements.cloudSectionToggle?.addEventListener("click", () => {
      setCloudExpanded(!isCloudExpanded());
    });
    setCloudExpanded(false);
  }

  return {
    init,
    prepareOpen,
    refreshShortcutList,
    resetKeys,
    isCloudExpanded,
    setCloudExpanded
  };
}
