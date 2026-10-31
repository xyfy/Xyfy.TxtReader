import { readTxtFile } from "../modules/file-handler.js";
import { SUPPORTED_ENCODINGS } from "../modules/encoding.js";
import { APP_VERSION } from "../modules/app-info.js";
import { createErrorReporter, detectPlatform } from "../modules/error-report.js";
import {
  ERROR_KINDS,
  READER_STATES,
  describeImportError,
  resolveReaderViewState
} from "../modules/reader-view-state.js";
import { createBackupFilename, createBackupPayload, parseBackupPayload } from "../modules/backup.js";
import { parseChaptersWithMeta } from "../modules/chapter-parser.js";
import {
  clampSpreadStart,
  collectPages,
  createRenderedChapterPager,
  paginateChapter
} from "../modules/paginator.js";
import { CloudStorage } from "../modules/cloud-storage.js";
import { GistProvider } from "../modules/gist-provider.js";
import { applyI18n, getCurrentLocale, initializeI18n, setLocale, t } from "../modules/i18n.js";
import {
  deleteBookmark,
  exportBackupSnapshot,
  getBook,
  getDefaultSettings,
  getProgress,
  getReaderSettings,
  getReadingStats,
  getRecentFiles,
  getSyncStatus,
  importBackupSnapshot,
  listAllProgress,
  listBookmarks,
  listBooks,
  readSettingsSnapshot,
  resetReaderData,
  saveBook,
  saveBookmark,
  saveProgress,
  saveReaderSettings,
  saveReadingStats,
  saveRecentFiles,
  saveResolvedSettings
} from "../modules/storage.js";
import {
  applyRecommendation,
  getStep,
  markOnboardingDone,
  nextStepIndex,
  recommendDefaults,
  shouldShowOnboarding
} from "../modules/onboarding.js";
import {
  IDLE_TIMEOUT_MS,
  MIN_SESSION_MS,
  createStats,
  estimateRemaining,
  pruneHistory,
  recordSession,
  splitDuration,
  summarize
} from "../modules/reading-stats.js";
import { FIELD_LABEL_KEY, detectConflict, resolveConflict, summarizeConflict } from "../modules/sync-conflict.js";
import { auditPalette, createFocusTrap } from "../modules/a11y.js";
import {
  REJECT_MESSAGE_KEY,
  classifyDroppedFiles,
  createImportQueue,
  listRecentFiles,
  pushRecentFile,
  toRecentEntry
} from "../modules/import-queue.js";
import {
  applyScene,
  detectScene,
  restoreCustomPalette,
  shouldWarnCustomPalette
} from "../modules/scene-mode.js";
import { READER_ACTIONS, formatActionBindings, matchKeyBinding } from "../modules/keyboard-map.js";
import {
  COLOR_KEYS,
  COLOR_VAR_MAP,
  DERIVED_VAR_ALPHA,
  captureCurrentPalette,
  contrastRatio,
  createPaletteCache,
  getEffectiveFont,
  parseHex,
  hexToRgba,
  isFontFamilyValueSafe,
  relativeLuminance,
  shiftHex,
  toColorInputValue
} from "./reader-color.js";
import { ACTION_LABEL_KEY, createSettingsPanel } from "./reader-settings-panel.js";

// 预设主题调色板采样一次即可复用，避免高频重绘时反复测量
const presetPaletteCache = createPaletteCache();

const state = {
  settings: getDefaultSettings(),
  books: [],
  book: null,
  bookmarks: [],
  pages: [],
  chapterPageCache: new Map(),
  activePaginationSession: null,
  debugEnabled: false,
  immersiveActive: false,
  panelHiddenBeforeImmersive: false,
  lastPageDimensions: null,
  pagesPerView: 2,
  currentChapterIndex: 0,
  currentPageIndex: 0,
  cloudProvider: null,
  cloudProviderName: "GitHub Gist",
  // FR-M1：单次分页被封顶时，记录真正想去的目标页，由空闲预热追赶
  pendingTargetPage: null,
  // FR-M4 边界四态
  isImporting: false,
  importError: null,
  needsEncodingChoice: false,
  lastImportFile: null,
  cloudConfig: {
    gistId: "",
    token: ""
  },
  cloudTokenVisible: false,
  cloudAuthed: false,
  cloudOperationInProgress: false,
  // FR-S1 引导
  onboardingStep: 0,
  // FR-S2 阅读统计：stats 是持久化结构，session 是当前进行中的一段
  readingStats: createStats(),
  session: null,
  sessionCharsStart: 0,
  lastActivityAt: 0,
  // FR-S3 冲突
  pendingConflict: null,
  // FR-C1 最近文件
  recentFiles: []
};

const PAGE_CACHE_LIMIT = 8;
// FR-M1：单次重建最多生成的页数。恢复阅读进度到大文件深处时不能一口气生成几千页，
// 先渲染已有的部分保证首屏，剩余部分交给空闲预热逐步补齐。
const MAX_PAGES_PER_BUILD = 32;

function webLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const elements = {
  fileInput: document.getElementById("file-input"),
  fileMeta: document.getElementById("file-meta"),
  exportBackup: document.getElementById("export-backup"),
  importBackup: document.getElementById("import-backup"),
  backupStatus: document.getElementById("backup-status"),
  cloudGistId: document.getElementById("cloud-gist-id"),
  cloudGistToken: document.getElementById("cloud-gist-token"),
  cloudTokenToggle: document.getElementById("cloud-token-toggle"),
  cloudConnect: document.getElementById("cloud-connect"),
  cloudSync: document.getElementById("cloud-sync"),
  cloudStatus: document.getElementById("cloud-status"),
  cloudStatusBadge: document.getElementById("cloud-status-badge"),
  cloudBackupsContainer: document.getElementById("cloud-backups-container"),
  cloudBackupsList: document.getElementById("cloud-backups-list"),
  cloudQuota: document.getElementById("cloud-quota"),
  closeCurrentBook: document.getElementById("close-current-book"),
  resetData: document.getElementById("reset-data"),
  resetTargetSettings: document.getElementById("reset-target-settings"),
  resetTargetProgress: document.getElementById("reset-target-progress"),
  resetTargetBookmarks: document.getElementById("reset-target-bookmarks"),
  resetTargetBooks: document.getElementById("reset-target-books"),
  librarySelect: document.getElementById("library-select"),
  recentList: document.getElementById("recent-list"),
  statsList: document.getElementById("stats-list"),
  tocList: document.getElementById("toc-list"),
  chapterCount: document.getElementById("chapter-count"),
  bookmarkList: document.getElementById("bookmark-list"),
  bookmarkButton: document.getElementById("bookmark-button"),
  bookTitle: document.getElementById("book-title"),
  leftTitle: document.getElementById("left-title"),
  rightTitle: document.getElementById("right-title"),
  leftPage: document.getElementById("left-page"),
  rightPage: document.getElementById("right-page"),
  pageIndicator: document.getElementById("page-indicator"),
  modeHint: document.getElementById("mode-hint"),
  prevPage: document.getElementById("prev-page"),
  nextPage: document.getElementById("next-page"),
  prevChapter: document.getElementById("prev-chapter"),
  nextChapter: document.getElementById("next-chapter"),
  readingMode: document.getElementById("reading-mode"),
  themeSelect: document.getElementById("theme-select"),
  fontSelect: document.getElementById("font-select"),
  fontSize: document.getElementById("font-size"),
  animationStyle: document.getElementById("animation-style"),
  animationIntensity: document.getElementById("animation-intensity"),
  showStats: document.getElementById("show-stats"),
  errorReporting: document.getElementById("error-reporting"),
  languageSelect: document.getElementById("language-select"),
  spreadShell: document.querySelector(".spread-shell"),
  appShell: document.querySelector(".app-shell"),
  settingsToggle: document.getElementById("settings-toggle"),
  settingsOverlay: document.getElementById("settings-overlay"),
  settingsClose: document.getElementById("settings-close"),
  statsSection: document.getElementById("stats-section"),
  togglePanel: document.getElementById("toggle-panel"),
  immersiveToggle: document.getElementById("immersive-toggle"),
  immersiveExit: document.getElementById("immersive-exit"),
  shortcutsToggle: document.getElementById("shortcuts-toggle"),
  shortcutsOverlay: document.getElementById("shortcuts-overlay"),
  shortcutsClose: document.getElementById("shortcuts-close"),
  debugToggle: document.getElementById("debug-toggle"),
  debugPanel: document.getElementById("debug-panel"),
  readerHeader: document.querySelector(".reader-header"),
  readerFooter: document.querySelector(".reader-footer"),
  readerShell: document.querySelector(".reader-shell"),
  useCustomFont: document.getElementById("use-custom-font"),
  customFont: document.getElementById("custom-font"),
  fontPreview: document.getElementById("font-preview"),
  themeColorGrid: document.getElementById("theme-color-grid"),
  contrastWarning: document.getElementById("contrast-warning"),
  colorLockedHint: document.getElementById("color-locked-hint"),
  switchToCustom: document.getElementById("switch-to-custom"),
  resetColors: document.getElementById("reset-colors"),
  resetKeys: document.getElementById("reset-keys"),
  shortcutList: document.getElementById("shortcut-list"),
  shortcutHelpList: document.getElementById("shortcut-help-list"),
  settingsNav: document.getElementById("settings-nav"),
  cloudSectionToggle: document.getElementById("cloud-section-toggle"),
  cloudSectionBody: document.getElementById("cloud-section-body"),
  // FR-M4 边界四态
  stateOverlay: document.getElementById("reader-state-overlay"),
  stateLoading: document.getElementById("state-loading"),
  stateEmpty: document.getElementById("state-empty"),
  stateEmptyImport: document.getElementById("state-empty-import"),
  stateError: document.getElementById("state-error"),
  stateErrorReason: document.getElementById("state-error-reason"),
  stateErrorEncodingRow: document.getElementById("state-error-encoding-row"),
  stateErrorEncoding: document.getElementById("state-error-encoding"),
  stateErrorEncodingApply: document.getElementById("state-error-encoding-apply"),
  stateErrorRetry: document.getElementById("state-error-retry"),
  // FR-C2 场景模式
  sceneModeGroup: document.getElementById("scene-mode-group"),
  // FR-C1 批量导入与最近文件
  recentFilesList: document.getElementById("recent-files-list"),
  dropHint: document.getElementById("drop-hint"),
  // FR-S3 冲突裁决
  conflictBanner: document.getElementById("sync-conflict-banner"),
  conflictDetail: document.getElementById("conflict-detail"),
  conflictKeepLocal: document.getElementById("conflict-keep-local"),
  conflictKeepRemote: document.getElementById("conflict-keep-remote"),
  conflictMerge: document.getElementById("conflict-merge"),
  // FR-S1 引导浮层
  onboardingOverlay: document.getElementById("onboarding-overlay"),
  onboardingProgress: document.getElementById("onboarding-progress"),
  onboardingTitle: document.getElementById("onboarding-title"),
  onboardingBody: document.getElementById("onboarding-body"),
  onboardingSkip: document.getElementById("onboarding-skip"),
  onboardingNext: document.getElementById("onboarding-next"),
  // FR-S4 无障碍
  a11yContrastStatus: document.getElementById("a11y-contrast-status"),
  syncStatusBadge: document.getElementById("sync-status-badge"),
  syncStatusDetail: document.getElementById("sync-status-detail"),
  syncUsage: document.getElementById("sync-usage"),
  skipToContent: document.getElementById("skip-to-content"),
  readerMain: document.getElementById("reader-main")
};

let resizeTimer = null;
let modeHintTimer = null;
let warmupTimer = null;
let shortcutsOpen = false;
let settingsOpen = false;
let onboardingOpen = false;

// FR-S4：三个浮层共用焦点陷阱，Tab 在浮层内循环，关闭后焦点归还触发元素。
// Escape 的关闭语义仍由主 keydown 统一处理，这里不重复消费。
const shortcutsTrap = createFocusTrap({ container: elements.shortcutsOverlay });
const settingsTrap = createFocusTrap({ container: elements.settingsOverlay });
const onboardingTrap = createFocusTrap({ container: elements.onboardingOverlay });

// FR-C3：错误上报器。是否上报取决于用户设置（默认关闭）；
// 未配置上报端点时只写本地日志，不会因为缺端点而抛错。
const errorReporter = createErrorReporter({
  version: APP_VERSION,
  platform: detectPlatform(globalThis.navigator?.userAgent || ""),
  isEnabled: () => Boolean(state.settings.errorReporting),
  transport: null
});

const settingsPanel = createSettingsPanel({
  elements,
  t,
  getKeybindings: () => state.settings.keybindings,
  setKeybindings: (keybindings) => {
    state.settings = { ...state.settings, keybindings };
    saveReaderSettings(state.settings).catch(() => {});
  },
  isOpen: () => settingsOpen
});

function requestWarmupWork(callback) {
  if (typeof window.requestIdleCallback === "function") {
    return window.requestIdleCallback(callback, { timeout: 120 });
  }

  return window.setTimeout(() => {
    callback({
      didTimeout: false,
      timeRemaining: () => 8
    });
  }, 16);
}

function cancelWarmupWork(handle) {
  if (!handle) {
    return;
  }

  if (typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(handle);
    return;
  }

  clearTimeout(handle);
}

function isScrollMode() {
  return state.settings.readingMode === "scroll";
}

function updateNavButtonLabels() {
  if (isScrollMode()) {
    elements.prevPage.textContent = t("readerScrollUp");
    elements.nextPage.textContent = t("readerScrollDown");
    return;
  }

  elements.prevPage.textContent = t("readerPrevPage");
  elements.nextPage.textContent = t("readerNextPage");
}

function updateImmersiveButton() {
  elements.immersiveToggle.classList.toggle("active", state.immersiveActive);
  elements.immersiveToggle.setAttribute("aria-pressed", String(state.immersiveActive));
  elements.immersiveToggle.setAttribute("aria-label", state.immersiveActive ? t("readerImmersiveExit") : t("readerImmersiveEnter"));
  elements.immersiveToggle.title = state.immersiveActive ? t("readerImmersiveExit") : t("readerImmersiveEnter");
  elements.immersiveExit.classList.toggle("hidden", !state.immersiveActive);
}

function applyImmersiveVisualState(active) {
  state.immersiveActive = active;
  document.body.classList.toggle("is-immersive", active);
  updateImmersiveButton();
}

async function toggleImmersiveMode() {
  const nextActive = !state.immersiveActive;

  if (nextActive) {
    state.panelHiddenBeforeImmersive = elements.appShell.classList.contains("panel-hidden");
  }

  applyImmersiveVisualState(nextActive);
  if (nextActive) {
    elements.appShell.classList.add("panel-hidden");
  } else if (!state.panelHiddenBeforeImmersive) {
    elements.appShell.classList.remove("panel-hidden");
  }

  detectPagesPerView();
  rebuildPages();
}

function hideModeHint() {
  elements.modeHint.classList.add("hidden");
  elements.modeHint.textContent = "";
}

function showModeHint(text, duration = 1800) {
  if (!isScrollMode()) {
    hideModeHint();
    return;
  }

  elements.modeHint.textContent = text;
  elements.modeHint.classList.remove("hidden");

  if (modeHintTimer) {
    clearTimeout(modeHintTimer);
  }

  if (duration > 0) {
    modeHintTimer = setTimeout(() => {
      hideModeHint();
      modeHintTimer = null;
    }, duration);
  }
}

function detectPagesPerView() {
  if (isScrollMode()) {
    state.pagesPerView = 1;
    elements.spreadShell.classList.add("is-single", "is-scroll-mode");
    return;
  }

  elements.spreadShell.classList.remove("is-scroll-mode");
  const forceSingleByViewport = window.matchMedia("(max-width: 820px)").matches;
  const spreadWidth = elements.spreadShell?.clientWidth || 0;
  const minPageWidth = 420;
  const forceSingleByContentWidth = spreadWidth > 0 && spreadWidth / 2 < minPageWidth;
  const isSingle = forceSingleByViewport || forceSingleByContentWidth;

  state.pagesPerView = isSingle ? 1 : 2;
  elements.spreadShell.classList.toggle("is-single", isSingle);
}

function turnClassName() {
  if (state.settings.animationStyle === "none") {
    return "";
  }

  const style = state.settings.animationStyle === "fade" ? "turn-fade" : "turn-slide";
  const strength = Number(state.settings.animationIntensity || 2) >= 2 ? "hard" : "soft";
  return `${style}-${strength}`;
}

function animateTurn() {
  const className = turnClassName();
  const targets = [elements.leftPage, elements.rightPage];
  const allKnown = ["turn-slide-soft", "turn-slide-hard", "turn-fade-soft", "turn-fade-hard"];

  for (const target of targets) {
    target.classList.remove(...allKnown);
    if (!className) {
      continue;
    }
    // Force reflow to replay animation class on every page turn.
    void target.offsetWidth;
    target.classList.add(className);
  }
}

function formatSize(size) {
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function buildPaginationCacheKey(bookId, chapterIndex, pageDimensions) {
  const width = pageDimensions ? Math.round(pageDimensions.width) : 0;
  const height = pageDimensions ? Math.round(pageDimensions.height) : 0;
  return [
    bookId,
    chapterIndex,
    state.settings.readingMode,
    state.settings.fontFamily,
    state.settings.fontSize,
    state.settings.lineHeight,
    width,
    height,
    state.pagesPerView
  ].join("::");
}

function getCachedPages(cacheKey) {
  const cached = state.chapterPageCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  state.chapterPageCache.delete(cacheKey);
  state.chapterPageCache.set(cacheKey, cached);
  return cached;
}

function setCachedPages(cacheKey, pages) {
  state.chapterPageCache.set(cacheKey, pages);
  while (state.chapterPageCache.size > PAGE_CACHE_LIMIT) {
    const oldestKey = state.chapterPageCache.keys().next().value;
    state.chapterPageCache.delete(oldestKey);
  }
}

function cancelPaginationWarmup() {
  if (warmupTimer) {
    cancelWarmupWork(warmupTimer);
    warmupTimer = null;
  }
}

function clearActivePaginationSession() {
  state.activePaginationSession?.fitChecker?.dispose?.();
  state.activePaginationSession = null;
  state.pendingTargetPage = null;
}

function ensurePagesLoaded(requiredCount, maxPagesToGenerate = Number.POSITIVE_INFINITY) {
  const session = state.activePaginationSession;
  if (!session) {
    return;
  }

  const { pages, done } = collectPages(session.pager, {
    requiredCount: Math.max(0, requiredCount - session.pages.length),
    maxPages: maxPagesToGenerate
  });
  session.pages.push(...pages);
  session.done = done || session.pager.done;

  // 分页器异常返回空页时停止，避免调用方空转
  if (!pages.length && !session.pager.done) {
    session.done = true;
  }

  state.pages = session.pages;
  if (session.done) {
    setCachedPages(session.cacheKey, session.pages);
    session.fitChecker?.dispose?.();
    session.fitChecker = null;
  }
}

function schedulePaginationWarmup() {
  cancelPaginationWarmup();
  const session = state.activePaginationSession;
  if (!session || session.done) {
    return;
  }

  warmupTimer = requestWarmupWork((deadline) => {
    const activeSession = state.activePaginationSession;
    if (!activeSession || activeSession.cacheKey !== session.cacheKey) {
      return;
    }

    let budgetPages = 0;
    while (budgetPages < 4 && (deadline.didTimeout || deadline.timeRemaining() > 3)) {
      const before = activeSession.pages.length;
      ensurePagesLoaded(activeSession.pages.length + 1, 1);
      if (activeSession.pages.length === before) {
        break;
      }
      budgetPages += 1;
    }

    // FR-M1：预热追上被封顶推迟的目标页后，把界面带到真正的阅读位置
    if (state.pendingTargetPage !== null && activeSession.pages.length > state.pendingTargetPage) {
      const target = state.pendingTargetPage;
      state.pendingTargetPage = null;
      state.currentPageIndex = clampSpreadStart(target, state.pages.length, state.pagesPerView);
      renderSpread();
      persistProgress();
    }

    if (activeSession.done) {
      if (state.book?.id === activeSession.bookId && state.currentChapterIndex === activeSession.chapterIndex) {
        renderSpread();
      }
      return;
    }

    schedulePaginationWarmup();
  });
}

function setBackupStatus(message, isError = false) {
  elements.backupStatus.textContent = message;
  elements.backupStatus.style.color = isError ? "#b5442a" : "";
}

function formatTargetList(targets) {
  if (!Array.isArray(targets) || targets.length === 0) {
    return "";
  }

  const locale = getCurrentLocale() === "zh_CN" ? "zh-CN" : "en";
  if (typeof Intl !== "undefined" && typeof Intl.ListFormat === "function") {
    return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(targets);
  }

  return targets.join(locale.startsWith("zh") ? "、" : ", ");
}

async function closeCurrentBookState({
  refreshLibrary = true,
  refreshRecentReadsList = true,
  resetFileMeta = true
} = {}) {
  cancelPaginationWarmup();
  clearActivePaginationSession();

  state.book = null;
  state.bookmarks = [];
  state.pages = [];
  state.currentChapterIndex = 0;
  state.currentPageIndex = 0;

  if (resetFileMeta) {
    elements.fileMeta.textContent = t("readerNoFile");
  }

  if (refreshLibrary) {
    renderLibrary();
  }

  renderBookmarks();
  renderToc();
  renderSpread();

  if (refreshRecentReadsList) {
    await refreshRecentReads();
  }
}

async function handleCloseCurrentBook() {
  if (!state.book) {
    setBackupStatus(t("readerCloseCurrentBookNoActive"), true);
    return;
  }

  const confirmed = window.confirm(t("readerCloseCurrentBookConfirm"));
  if (!confirmed) {
    return;
  }

  await closeCurrentBookState();
  setBackupStatus(t("readerCloseCurrentBookDone"));
}

function getResetOptionsAndLabels() {
  const targetDefinitions = [
    {
      key: "settings",
      checked: Boolean(elements.resetTargetSettings?.checked),
      label: t("readerResetTargetSettings")
    },
    {
      key: "progress",
      checked: Boolean(elements.resetTargetProgress?.checked),
      label: t("readerResetTargetProgress")
    },
    {
      key: "bookmarks",
      checked: Boolean(elements.resetTargetBookmarks?.checked),
      label: t("readerResetTargetBookmarks")
    },
    {
      key: "books",
      checked: Boolean(elements.resetTargetBooks?.checked),
      label: t("readerResetTargetBooks")
    }
  ];

  const options = {
    settings: targetDefinitions[0].checked,
    progress: targetDefinitions[1].checked,
    bookmarks: targetDefinitions[2].checked,
    books: targetDefinitions[3].checked
  };

  const labels = targetDefinitions.filter((item) => item.checked).map((item) => item.label);

  return { options, labels };
}

async function handleResetData() {
  const { options, labels } = getResetOptionsAndLabels();
  if (!labels.length) {
    setBackupStatus(t("readerResetNothingSelected"), true);
    return;
  }

  const targetsText = formatTargetList(labels);
  const confirmed = window.confirm(t("readerResetConfirm", { targets: targetsText }));
  if (!confirmed) {
    return;
  }

  try {
    await resetReaderData(options);
    state.chapterPageCache.clear();

    if (options.settings) {
      state.settings = await getReaderSettings();
      applySettings();
      detectPagesPerView();
    }

    if (options.books) {
      state.books = await listBooks();
      await closeCurrentBookState({
        refreshLibrary: false,
        refreshRecentReadsList: false,
        resetFileMeta: true
      });
      renderLibrary();
      await refreshRecentReads();
      setBackupStatus(t("readerResetDone", { targets: targetsText }));
      return;
    }

    if (options.progress && state.book) {
      state.currentChapterIndex = 0;
      state.currentPageIndex = 0;
      rebuildPages();
    }

    if (options.progress) {
      // 存储层已一并清除统计与最近文件，内存里的副本必须同步，否则界面还在展示旧数字
      state.readingStats = createStats();
      state.recentFiles = [];
      state.session = null;
      renderStats();
      renderRecentFiles();
    }

    if (options.bookmarks) {
      await refreshBookmarks();
    }

    if (options.progress || options.bookmarks) {
      await refreshRecentReads();
    }

    setBackupStatus(t("readerResetDone", { targets: targetsText }));
  } catch (error) {
    console.error(error);
    setBackupStatus(error instanceof Error ? error.message : t("readerResetFailed"), true);
  }
}

function setCloudStatus(message, status = "idle", isError = false) {
  elements.cloudStatus.textContent = message;
  elements.cloudStatus.style.color = isError ? "#b5442a" : "";
  elements.cloudStatusBadge.dataset.status = status;
  elements.cloudStatusBadge.title = message;
}

function updateTokenVisibility() {
  if (!elements.cloudGistToken || !elements.cloudTokenToggle) {
    return;
  }

  elements.cloudGistToken.type = state.cloudTokenVisible ? "text" : "password";
  elements.cloudTokenToggle.textContent = state.cloudTokenVisible
    ? t("readerCloudToggleTokenHide")
    : t("readerCloudToggleTokenShow");
}

function refreshI18nUi() {
  applyI18n();

  if (elements.languageSelect) {
    elements.languageSelect.value = getCurrentLocale();
  }

  if (elements.cloudGistId) {
    elements.cloudGistId.placeholder = t("readerCloudGistIdPlaceholder");
  }
  if (elements.cloudGistToken) {
    elements.cloudGistToken.placeholder = t("readerCloudTokenPlaceholder");
  }

  updateTokenVisibility();
  updateNavButtonLabels();

  // 动态生成的动作名/键位文案随语言切换刷新
  if (shortcutsOpen) renderShortcutHelp();
  if (settingsOpen) settingsPanel.refreshShortcutList();
  // 折叠分区的「展开/收起」提示由 JS 维护，需在 i18n 重刷后按当前状态回写
  settingsPanel.setCloudExpanded(settingsPanel.isCloudExpanded());

  // v0.7：这几处文案由 JS 拼接，applyI18n 覆盖不到，必须显式重刷
  renderOnboardingStep();
  renderConflictBanner();
  renderSceneState();
  renderRecentFiles();
  updateContrastStatus();
  renderStats();
}

// ---------- FR-S1 首次引导 ----------

function renderOnboardingStep() {
  if (!elements.onboardingTitle) {
    return;
  }
  const { step, index, total, isLast } = getStep(state.onboardingStep);
  state.onboardingStep = index;
  elements.onboardingProgress.textContent = t("onboardingProgress", { current: index + 1, total });
  elements.onboardingTitle.textContent = t(step.titleKey);
  elements.onboardingBody.textContent = t(step.bodyKey);
  // 最后一步的按钮是「开始阅读」而不是「下一步」——点了就该去读书，不是去第四步
  elements.onboardingNext.textContent = isLast ? t("onboardingStart") : t("onboardingNext");
  elements.onboardingSkip.classList.toggle("hidden", isLast);
}

function openOnboarding() {
  onboardingOpen = true;
  state.onboardingStep = 0;
  renderOnboardingStep();
  elements.onboardingOverlay.classList.remove("hidden");
  onboardingTrap.activate();
}

async function closeOnboarding({ skipped = false } = {}) {
  onboardingOpen = false;
  elements.onboardingOverlay.classList.add("hidden");
  onboardingTrap.deactivate();
  state.settings = markOnboardingDone(state.settings, { skipped });
  await saveReaderSettings(state.settings);
  renderLibrary();
}

/**
 * 首次运行的设备自适应默认值。
 * 只在用户从未调过版式时生效——把老用户精心调好的 26px 字号改回推荐值是最招人烦的行为之一。
 */
async function applyFirstRunDefaults() {
  if (state.settings.settingsTuned) {
    return;
  }
  const coarsePointer = Boolean(globalThis.matchMedia?.("(pointer: coarse)")?.matches);
  const recommendation = recommendDefaults({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    coarsePointer
  });
  state.settings = applyRecommendation(state.settings, recommendation, { tuned: false });
  await saveReaderSettings(state.settings);
  applySettings();
}

// ---------- FR-C2 场景模式 ----------

function renderSceneState() {
  if (!elements.sceneModeGroup) {
    return;
  }
  // 三项全等才算命中，手调过字号后所有按钮熄灭，避免「明明改过却还高亮夜间」
  const active = detectScene(state.settings);
  for (const chip of elements.sceneModeGroup.querySelectorAll(".scene-chip")) {
    chip.setAttribute("aria-pressed", String(chip.dataset.scene === active));
  }
}

async function handleSceneChange(sceneId) {
  if (shouldWarnCustomPalette(state.settings) && !window.confirm(t("sceneCustomPaletteConfirm"))) {
    return;
  }
  const next = applyScene(state.settings, sceneId);
  // 场景本身就是一套版式，标记为「已调过」以免后续推荐值又把它改掉
  state.settings = { ...next, settingsTuned: true };
  applySettings();
  detectPagesPerView();
  await saveReaderSettings(state.settings);
  rebuildPages();
  renderSceneState();
}

// ---------- FR-S4 对比度状态 ----------

function updateContrastStatus() {
  const target = elements.a11yContrastStatus;
  if (!target) {
    return;
  }
  const audit = auditPalette(captureCurrentPalette());
  if (audit.passes) {
    target.textContent = t("a11yContrastOk");
    target.classList.remove("is-warning");
    return;
  }
  const ratio = Number(audit.worst?.ratio || 0).toFixed(2);
  target.textContent = `${t("a11yContrastWarn", { count: audit.failures.length })} · ${t("a11yContrastRatio", { ratio })}`;
  target.classList.add("is-warning");
}

// ---------- v0.8 L-02 同步状态展示 ----------

/**
 * 渲染 sync 配额守卫的结果。
 *
 * 三态：已同步 / 已同步（精简模式）/ 未同步（含原因）。
 * 未同步时必须把原因说具体，否则用户只会看到"设置没同步"而无法自救。
 */
function renderSyncStatus() {
  const badge = elements.syncStatusBadge;
  const detail = elements.syncStatusDetail;
  const usage = elements.syncUsage;
  if (!badge) {
    return;
  }

  const status = getSyncStatus();
  badge.textContent = t(status.titleKey);
  badge.classList.toggle("is-ok", status.synced && !status.degraded);
  badge.classList.toggle("is-degraded", status.synced && status.degraded);
  badge.classList.toggle("is-failed", !status.synced);

  if (usage) {
    usage.textContent = status.usageText ? `${t("syncStateUsage")} ${status.usageText}` : "";
  }

  if (!detail) {
    return;
  }
  if (status.synced && !status.degraded) {
    detail.textContent = "";
    detail.classList.add("hidden");
    return;
  }

  detail.classList.remove("hidden");
  if (status.degraded) {
    const dropped = (status.droppedFields || [])
      .map((field) => {
        const key = `syncStateDrop${field.charAt(0).toUpperCase()}${field.slice(1)}`;
        const text = t(key);
        // 未翻译的字段名不要露出来，退化为通用说明
        return text === key ? "" : text;
      })
      .filter(Boolean);
    // 用当前语言的分隔符拼接，避免中文界面里冒出英文分号
    const joiner = getCurrentLocale() === "zh_CN" ? "；" : "; ";
    detail.textContent = [t("syncStateDegradedDetail"), dropped.join(joiner)].filter(Boolean).join(joiner);
    detail.classList.add("is-warning");
    return;
  }

  detail.textContent = status.detailKey ? t(status.detailKey) : status.message;
  detail.classList.add("is-warning");
}

const GIST_CONFIG_KEY = "gistCloudConfig";
const GITHUB_API_ORIGIN = "https://api.github.com/*";

function hasPermissionsApi() {
  return Boolean(globalThis.chrome?.permissions?.contains && globalThis.chrome?.permissions?.request);
}

function hasGithubHostPermission() {
  if (!hasPermissionsApi()) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    chrome.permissions.contains({ origins: [GITHUB_API_ORIGIN] }, (granted) => {
      resolve(Boolean(granted));
    });
  });
}

function requestGithubHostPermission() {
  if (!hasPermissionsApi()) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    chrome.permissions.request({ origins: [GITHUB_API_ORIGIN] }, (granted) => {
      resolve(Boolean(granted));
    });
  });
}

function loadGistConfig() {
  return new Promise((resolve) => {
    if (!globalThis.chrome?.storage?.local) {
      const storage = webLocalStorage();
      if (!storage) {
        resolve({ gistId: "", token: "" });
        return;
      }

      try {
        const config = JSON.parse(storage.getItem(GIST_CONFIG_KEY) || "{}");
        resolve({
          gistId: typeof config.gistId === "string" ? config.gistId : "",
          token: typeof config.token === "string" ? config.token : ""
        });
      } catch {
        resolve({ gistId: "", token: "" });
      }
      return;
    }

    chrome.storage.local.get([GIST_CONFIG_KEY], (result) => {
      const config = result[GIST_CONFIG_KEY] || {};
      resolve({
        gistId: typeof config.gistId === "string" ? config.gistId : "",
        token: typeof config.token === "string" ? config.token : ""
      });
    });
  });
}

function saveGistConfig(config) {
  return new Promise((resolve) => {
    if (!globalThis.chrome?.storage?.local) {
      const storage = webLocalStorage();
      if (storage) {
        storage.setItem(GIST_CONFIG_KEY, JSON.stringify(config));
      }
      resolve();
      return;
    }

    chrome.storage.local.set({ [GIST_CONFIG_KEY]: config }, () => resolve());
  });
}

function formatCloudTime(isoString) {
  if (!isoString) {
    return t("readerUnknownTime");
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return t("readerUnknownTime");
  }
  const locale = getCurrentLocale() === "zh_CN" ? "zh-CN" : "en-US";
  return date.toLocaleString(locale, { hour12: false });
}

async function handleCloudRestore(fileId) {
  if (!fileId || !state.cloudProvider || state.cloudOperationInProgress) {
    return;
  }

  setCloudActionBusy(true);
  setCloudStatus(t("readerCloudRestoring"), "connected");

  try {
    const restoreResult = await state.cloudProvider.restoreFromCloud(fileId);
    if (!restoreResult.success) {
      throw restoreResult.error || new Error(t("readerCloudRestoreFailed"));
    }

    const payload = parseBackupPayload(JSON.stringify(restoreResult.data));
    const importResult = await importBackupSnapshot(payload);

    state.chapterPageCache.clear();
    state.settings = await getReaderSettings();
    applySettings();
    detectPagesPerView();
    state.books = await listBooks();
    renderLibrary();
    await refreshRecentReads();

    const preferredBookId = state.book?.id || payload.books[0]?.id || state.books[0]?.id;
    if (preferredBookId) {
      await loadBook(preferredBookId);
    } else {
      renderBookmarks();
      renderToc();
      renderSpread();
    }

    setCloudStatus(
      t("readerCloudRestoreDone", {
        books: importResult.booksImported,
        progress: importResult.progressImported,
        bookmarks: importResult.bookmarksImported
      }),
      "connected"
    );
  } catch (error) {
    setCloudStatus(error instanceof Error ? error.message : t("readerCloudRestoreFailed"), "error", true);
  } finally {
    setCloudActionBusy(false);
  }
}

async function handleCloudDelete(fileId) {
  if (!fileId || !state.cloudProvider || state.cloudOperationInProgress) {
    return;
  }

  const confirmed = window.confirm(t("readerCloudDeleteConfirm"));
  if (!confirmed) {
    return;
  }

  setCloudActionBusy(true);
  setCloudStatus(t("readerCloudDeleting"), "connected");

  try {
    const result = await state.cloudProvider.deleteCloudBackup(fileId);
    if (!result.success) {
      throw result.error || new Error(t("readerCloudDeleteFailed"));
    }
    setCloudStatus(t("readerCloudDeleted"), "connected");
    await refreshCloudBackups();
  } catch (error) {
    setCloudStatus(error instanceof Error ? error.message : t("readerCloudDeleteFailed"), "error", true);
  } finally {
    setCloudActionBusy(false);
  }
}

function renderCloudBackups(backups) {
  elements.cloudBackupsList.innerHTML = "";
  if (!Array.isArray(backups) || backups.length === 0) {
    const empty = document.createElement("p");
    empty.className = "file-meta";
    empty.textContent = t("readerCloudBackupEmpty");
    elements.cloudBackupsList.append(empty);
    return;
  }

  for (const backup of backups) {
    const row = document.createElement("div");
    row.className = "list-item";

    const info = document.createElement("div");
    info.className = "backup-info";

    const name = document.createElement("div");
    name.className = "backup-name";
    name.textContent = backup.fileName || t("readerCloudBackupUnnamed");

    const time = document.createElement("div");
    time.className = "backup-time";
    time.textContent = `${formatCloudTime(backup.uploadedAt)} · ${formatSize(Number(backup.size || 0))}`;

    info.append(name, time);

    const actions = document.createElement("div");
    actions.className = "backup-actions";

    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.textContent = t("readerCloudRestore");
    restoreButton.addEventListener("click", () => {
      handleCloudRestore(backup.fileId);
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = t("readerCloudDelete");
    removeButton.addEventListener("click", () => {
      handleCloudDelete(backup.fileId);
    });

    actions.append(restoreButton, removeButton);
    row.append(info, actions);
    elements.cloudBackupsList.append(row);
  }
}

async function refreshCloudBackups() {
  if (!state.cloudProvider) {
    return;
  }

  const [listResult, quotaResult] = await Promise.all([
    state.cloudProvider.listCloudBackups({ limit: 20 }),
    state.cloudProvider.getCloudQuota()
  ]);

  if (listResult.success) {
    renderCloudBackups(listResult.data);
  } else {
    renderCloudBackups([]);
  }

  if (quotaResult.success && quotaResult.data) {
    const quota = quotaResult.data;
    elements.cloudQuota.textContent = t("readerCloudQuota", {
      used: formatSize(Number(quota.usedBytes || 0)),
      total: formatSize(Number(quota.totalBytes || 0))
    });
  } else {
    elements.cloudQuota.textContent = "";
  }
}

function setCloudActionBusy(isBusy) {
  state.cloudOperationInProgress = isBusy;
  elements.cloudConnect.disabled = isBusy;
  elements.cloudSync.disabled = isBusy || !state.cloudAuthed;
}

async function initializeCloudSection() {
  state.cloudConfig = await loadGistConfig();
  if (elements.cloudGistId) {
    elements.cloudGistId.value = state.cloudConfig.gistId;
  }
  if (elements.cloudGistToken) {
    elements.cloudGistToken.value = state.cloudConfig.token;
  }

  const provider = new GistProvider(state.cloudConfig);
  const providerMeta = provider.getMetadata();
  state.cloudProviderName = providerMeta.name || t("readerCloudProviderFallback");

  state.cloudProvider = new CloudStorage({
    provider
  });

  const initResult = await state.cloudProvider.initialize();
  if (!initResult.success) {
    setCloudStatus(`${state.cloudProviderName} ${t("readerInitFailed")}`, "error", true);
    setCloudActionBusy(false);
    return;
  }

  const [ready, permissionGranted] = await Promise.all([
    state.cloudProvider.isReady(),
    hasGithubHostPermission()
  ]);
  state.cloudAuthed = ready && permissionGranted;

  if (state.cloudAuthed) {
    setCloudStatus(t("readerCloudConnected", { provider: state.cloudProviderName }), "connected");
    elements.cloudBackupsContainer.classList.remove("hidden");
    await refreshCloudBackups();
  } else if (ready) {
    setCloudStatus(t("readerCloudNeedPermission"), "needs-auth");
    elements.cloudBackupsContainer.classList.add("hidden");
  } else {
    setCloudStatus(t("readerCloudNeedConfig"), "needs-auth");
    elements.cloudBackupsContainer.classList.add("hidden");
  }

  setCloudActionBusy(false);
}

async function handleCloudConnect() {
  if (!state.cloudProvider || state.cloudOperationInProgress || elements.cloudConnect.disabled) {
    return;
  }

  setCloudActionBusy(true);
  setCloudStatus(t("readerCloudConnecting", { provider: state.cloudProviderName }), "needs-auth");

  try {
    const gistId = elements.cloudGistId?.value?.trim() || "";
    const token = elements.cloudGistToken?.value?.trim() || "";

    if (!gistId || !token) {
      throw new Error(t("readerCloudNeedConfig"));
    }

    const permissionGranted = await requestGithubHostPermission();
    if (!permissionGranted) {
      throw new Error(t("readerCloudPermissionDenied"));
    }

    const result = await state.cloudProvider.requestCloudAuth({ gistId, token });
    if (result.success) {
      state.cloudAuthed = true;
      state.cloudConfig = { gistId, token };
      await saveGistConfig(state.cloudConfig);
      setCloudStatus(t("readerCloudConnected", { provider: state.cloudProviderName }), "connected");
      elements.cloudBackupsContainer.classList.remove("hidden");
      await refreshCloudBackups();
    } else {
      state.cloudAuthed = false;
      const message = result.error?.message || t("readerCloudConnectFailedShort");
      setCloudStatus(t("readerCloudConnectFailed", { message }), "error", true);
    }
  } catch (error) {
    state.cloudAuthed = false;
    setCloudStatus(error instanceof Error ? error.message : t("readerCloudConnectFailed", { message: "" }), "error", true);
  } finally {
    setCloudActionBusy(false);
  }
}

async function handleCloudSync() {
  if (!state.cloudProvider || state.cloudOperationInProgress) {
    return;
  }

  setCloudActionBusy(true);
  setCloudStatus(t("readerCloudSyncing"), "connected");

  try {
    const snapshot = await exportBackupSnapshot();
    const payload = createBackupPayload(snapshot);
    const result = await state.cloudProvider.backupToCloud(payload, {
      fileName: createBackupFilename()
    });

    if (result.success) {
      setCloudStatus(t("readerCloudSynced"), "connected");
      elements.cloudBackupsContainer.classList.remove("hidden");
      await refreshCloudBackups();
    } else {
      const message = result.error?.message || t("readerCloudSyncFailedShort");
      setCloudStatus(t("readerCloudSyncFailed", { message }), "error", true);
    }
  } catch (error) {
    setCloudStatus(error instanceof Error ? error.message : t("readerCloudSyncFailed", { message: "" }), "error", true);
  } finally {
    setCloudActionBusy(false);
  }
}

async function refreshRecentReads() {
  const [progressList, books] = await Promise.all([listAllProgress(), listBooks()]);
  const bookMap = new Map(books.map((book) => [book.id, book]));
  const recentEntries = progressList
    .filter((item) => bookMap.has(item.bookId))
    .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
    .slice(0, 5);

  elements.recentList.innerHTML = "";
  if (!recentEntries.length) {
    const empty = document.createElement("p");
    empty.className = "file-meta";
    empty.textContent = t("readerRecentEmpty");
    elements.recentList.append(empty);
    return;
  }

  for (const entry of recentEntries) {
    const book = bookMap.get(entry.bookId);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = t("readerRecentChapterItem", {
      name: book?.name || entry.bookId,
      chapter: Number(entry.chapterIndex || 0) + 1
    });
    if (state.book?.id === entry.bookId) {
      button.classList.add("active");
    }
    button.addEventListener("click", async () => {
      await loadBook(entry.bookId);
    });
    elements.recentList.append(button);
  }
}

// ---------- FR-S3 同步冲突 ----------

/**
 * 在读取设置之前先抓一份两侧快照。
 *
 * 顺序很关键：`getReaderSettings` 会把胜出一方写回另一侧，
 * 一旦先调用它，被覆盖的那一侧就永久丢失，冲突再也无从判定。
 */
async function capturePendingConflict() {
  let snapshot;
  try {
    snapshot = await readSettingsSnapshot();
  } catch {
    return;
  }
  if (!snapshot?.hasSync) {
    return;
  }
  const conflict = detectConflict(snapshot.local, snapshot.remote);
  if (!conflict) {
    return;
  }
  state.pendingConflict = { conflict, local: snapshot.local, remote: snapshot.remote };
  renderConflictBanner();
}

function renderConflictBanner() {
  const banner = elements.conflictBanner;
  if (!banner) {
    return;
  }
  const pending = state.pendingConflict;
  if (!pending) {
    banner.classList.add("hidden");
    if (elements.conflictDetail) {
      elements.conflictDetail.textContent = "";
    }
    return;
  }
  const summary = summarizeConflict(pending.conflict);
  const labels = summary.fields.map((field) => t(FIELD_LABEL_KEY[field] || "conflictDetail")).join(" / ");
  if (elements.conflictDetail) {
    elements.conflictDetail.textContent = labels ? `${t("conflictDetail")} ${labels}` : t("conflictDetail");
  }
  banner.classList.remove("hidden");
}

async function handleConflictResolve(strategy) {
  const pending = state.pendingConflict;
  if (!pending) {
    return;
  }
  // 时间戳由 resolveConflict 保证严格大于两侧，否则下次读取又会判成「对方更新」而回滚
  const merged = resolveConflict(pending.local, pending.remote, strategy, {
    now: Date.now(),
    defaults: getDefaultSettings()
  });
  state.pendingConflict = null;
  renderConflictBanner();
  state.settings = await saveResolvedSettings(merged);
  applySettings();
  detectPagesPerView();
  rebuildPages();
  renderSceneState();
  updateContrastStatus();
}

// ---------- FR-C1 最近文件 ----------

function renderRecentFiles() {
  const list = elements.recentFilesList;
  if (!list) {
    return;
  }
  const items = listRecentFiles(state.recentFiles);
  list.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "file-meta";
    empty.textContent = t("readerRecentEmpty");
    list.append(empty);
    return;
  }
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.name;
    if (state.book?.id === item.bookId) {
      button.classList.add("active");
    }
    button.addEventListener("click", async () => {
      if (item.bookId) {
        await loadBook(item.bookId);
      }
    });
    list.append(button);
  }
}

async function rememberRecentFile(imported) {
  const entry = toRecentEntry(imported, { bookId: imported?.id || null, importedAt: Date.now() });
  if (!entry) {
    return;
  }
  state.recentFiles = pushRecentFile(state.recentFiles, entry);
  await saveRecentFiles(state.recentFiles);
  renderRecentFiles();
}

// ---------- FR-S2 阅读统计 ----------

/**
 * 当前读到全书第几个字符的估算值。
 *
 * 精确值需要按页累计 DOM 字符数，代价太高且翻页频繁。
 * 这里用「已读完章节字数 + 本章按页比例折算」近似——统计用途足够，
 * 而且同一会话前后两次相减时系统误差会互相抵消。
 */
function estimateReadChars() {
  const chapters = state.book?.chapters || [];
  if (!chapters.length) {
    return 0;
  }
  let chars = 0;
  for (let index = 0; index < state.currentChapterIndex; index += 1) {
    chars += chapters[index]?.content?.length || 0;
  }
  const chapterChars = chapters[state.currentChapterIndex]?.content?.length || 0;
  const chapterPages = Math.max(1, Math.ceil(state.pages.length / Math.max(1, state.pagesPerView)));
  const readPages = state.currentPageIndex / Math.max(1, state.pagesPerView);
  return chars + Math.round((readPages / chapterPages) * chapterChars);
}

/** 任何一次翻页/滚动/跳章都算「还在读」。 */
function markReadingActivity() {
  const now = Date.now();
  if (!state.session) {
    state.session = { startedAt: now, charsStart: estimateReadChars() };
  }
  state.lastActivityAt = now;
}

async function flushReadingSession() {
  if (!state.session) {
    return;
  }
  const { startedAt, charsStart } = state.session;
  // 空闲时间不计入：长时间挂着页面去吃饭，不该算成读了 3 小时
  const endedAt = Math.min(Date.now(), state.lastActivityAt + IDLE_TIMEOUT_MS);
  const durationMs = Math.max(0, endedAt - startedAt);
  const charsRead = Math.max(0, estimateReadChars() - charsStart);
  state.session = null;

  if (durationMs < MIN_SESSION_MS) {
    return;
  }

  state.readingStats = pruneHistory(recordSession(state.readingStats, { startedAt, endedAt, durationMs, charsRead }));
  await saveReadingStats(state.readingStats);
  renderStats();
}

/** 定时检查是否已进入空闲：会话保持连续，不做碎片化切分。 */
function tickReadingSession() {
  if (!state.session) {
    return;
  }
  if (Date.now() - state.lastActivityAt >= IDLE_TIMEOUT_MS) {
    flushReadingSession().catch(() => {});
  }
}

function startReadingClock() {
  window.setInterval(tickReadingSession, 15000);
  // 切走标签页、关页面都要落盘，否则最后一段阅读会凭空消失
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushReadingSession().catch(() => {});
    }
  });
  window.addEventListener("pagehide", () => {
    flushReadingSession().catch(() => {});
  });
}

function formatDurationText(ms) {
  const { hours, minutes, seconds } = splitDuration(ms);
  if (hours > 0) {
    return t("statsDurationHour", { hours, minutes });
  }
  if (minutes > 0) {
    return t("statsDurationMinute", { minutes });
  }
  return t("statsDurationSecond", { seconds });
}

/** 本章还要读多久：按今日速度折算，速度未知时不给瞎猜的数字。 */
function estimateRemainingText(speed) {
  const chapters = state.book?.chapters || [];
  const chapterChars = chapters[state.currentChapterIndex]?.content?.length || 0;
  if (!chapterChars) {
    return "—";
  }
  const chapterPages = Math.max(1, Math.ceil(state.pages.length / Math.max(1, state.pagesPerView)));
  const readPages = state.currentPageIndex / Math.max(1, state.pagesPerView);
  const remainingChars = Math.max(0, Math.round(chapterChars * (1 - readPages / chapterPages)));
  const ms = estimateRemaining({ remainingChars, speed });
  return ms ? formatDurationText(ms) : "—";
}

function renderStats() {
  if (!state.settings.showStats) {
    elements.statsList.innerHTML = "";
    return;
  }

  const stats = [];
  const chapter = state.book?.chapters?.[state.currentChapterIndex];
  const chapterCount = state.book?.chapters?.length || 0;
  const chapterChars = chapter?.content?.length || 0;
  const totalChars = state.book?.chapters?.reduce((sum, item) => sum + (item.content?.length || 0), 0) || 0;
  const chapterProgress = chapterCount ? `${state.currentChapterIndex + 1} / ${chapterCount}` : "-";
  const pageProgress = isScrollMode()
    ? elements.pageIndicator.textContent || "0%"
    : `${Math.floor(state.currentPageIndex / Math.max(1, state.pagesPerView)) + 1} / ${Math.max(1, Math.ceil(state.pages.length / Math.max(1, state.pagesPerView)))}`;
  const reading = summarize(state.readingStats);

  // v0.7 行为统计放最前：用户更关心「今天读了多少、还剩多久」，而不是全书字数
  stats.push([t("statsToday"), reading.todayMs ? formatDurationText(reading.todayMs) : t("statsEmpty")]);
  stats.push([t("statsSpeed"), reading.speed ? t("statsSpeedUnit", { value: reading.speed }) : "—"]);
  stats.push([t("statsRemaining"), estimateRemainingText(reading.speed)]);
  stats.push([t("statsStreak"), t("statsStreakUnit", { days: reading.streak })]);

  stats.push([
    t("readerStatsMode"),
    isScrollMode() ? t("readerStatsModeScroll") : state.pagesPerView === 2 ? t("readerStatsModeBookDouble") : t("readerStatsModeBookSingle")
  ]);
  stats.push([t("readerStatsChapter"), chapterProgress]);
  stats.push([t("readerStatsPageProgress"), pageProgress]);
  stats.push([t("readerStatsChapterChars"), chapterChars ? t("readerCharsUnit", { count: chapterChars.toLocaleString() }) : "-"]);
  stats.push([t("readerStatsTotalChars"), totalChars ? t("readerCharsUnit", { count: totalChars.toLocaleString() }) : "-"]);
  stats.push([t("readerStatsBookmarkCount"), `${state.bookmarks.length}`]);

  elements.statsList.innerHTML = "";
  for (const [label, value] of stats) {
    const item = document.createElement("div");
    item.className = "stats-item";
    const left = document.createElement("span");
    left.textContent = label;
    const right = document.createElement("span");
    right.textContent = value;
    item.append(left, right);
    elements.statsList.append(item);
  }
}

function setShortcutsOverlay(open) {
  shortcutsOpen = open;
  if (open) {
    renderShortcutHelp();
  }
  elements.shortcutsOverlay.classList.toggle("hidden", !open);
  elements.shortcutsToggle.setAttribute("aria-expanded", String(open));
  if (open) {
    shortcutsTrap.activate();
  } else {
    shortcutsTrap.deactivate();
  }
}

function setSettingsOverlay(open) {
  settingsOpen = open;
  elements.settingsOverlay?.classList.toggle("hidden", !open);
  elements.settingsToggle?.setAttribute("aria-expanded", String(open));
  if (!open) {
    settingsTrap.deactivate();
    return;
  }
  settingsPanel.prepareOpen();
  renderSyncStatus();
  settingsTrap.activate();
}

function renderLibrary() {
  elements.librarySelect.innerHTML = "";

  if (!state.books.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("readerLibraryEmpty");
    elements.librarySelect.append(option);
    return;
  }

  for (const book of state.books) {
    const option = document.createElement("option");
    option.value = book.id;
    option.textContent = t("readerLibraryItem", { name: book.name, count: book.chapterCount });
    if (state.book && state.book.id === book.id) {
      option.selected = true;
    }
    elements.librarySelect.append(option);
  }

  if (!state.book) {
    elements.librarySelect.selectedIndex = -1;
  }
}

function renderToc() {
  elements.tocList.innerHTML = "";
  const chapters = state.book?.chapters || [];
  elements.chapterCount.textContent = String(chapters.length);

  for (const [index, chapter] of chapters.entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = chapter.title;
    if (index === state.currentChapterIndex) {
      button.classList.add("active");
    }
    button.addEventListener("click", () => goToChapter(index));
    elements.tocList.append(button);
  }
}

function renderBookmarks() {
  elements.bookmarkList.innerHTML = "";

  if (!state.bookmarks.length) {
    const empty = document.createElement("p");
    empty.className = "file-meta";
    empty.textContent = t("readerBookmarksEmpty");
    elements.bookmarkList.append(empty);
    return;
  }

  for (const bookmark of state.bookmarks) {
    const row = document.createElement("div");
    row.className = "bookmark-row";

    const jump = document.createElement("button");
    jump.type = "button";
    jump.textContent = bookmark.label;
    jump.addEventListener("click", () => {
      state.currentChapterIndex = bookmark.chapterIndex;
      state.currentPageIndex = bookmark.pageIndex;
      rebuildPages();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "small-button";
    remove.textContent = t("readerDelete");
    remove.addEventListener("click", async () => {
      await deleteBookmark(bookmark.id);
      await refreshBookmarks();
    });

    row.append(jump, remove);
    elements.bookmarkList.append(row);
  }
}

function applyFontSettings() {
  const effective = getEffectiveFont(state.settings);
  document.documentElement.style.setProperty("--font-family", effective);
  if (elements.fontSelect) elements.fontSelect.value = state.settings.fontFamily;
  if (elements.customFont) {
    const value = state.settings.customFont || "";
    // 仅在值不同时回写，避免输入过程中光标跳到末尾
    if (elements.customFont.value !== value) elements.customFont.value = value;
    elements.customFont.classList.toggle("invalid", Boolean(value) && !isFontFamilyValueSafe(value));
  }
  if (elements.useCustomFont) elements.useCustomFont.checked = Boolean(state.settings.customFont);
  if (elements.fontPreview) elements.fontPreview.style.fontFamily = effective;
}


function applyTheme() {
  const { theme, themeColors } = state.settings;
  const root = document.documentElement;
  if (theme === "custom") {
    // 清除预设主题属性，避免 body[data-theme] 的 CSS 覆盖自定义内联变量
    document.body.removeAttribute("data-theme");
    for (const key of COLOR_KEYS) {
      const value = themeColors?.[key];
      if (value) {
        root.style.setProperty(COLOR_VAR_MAP[key], value);
      } else {
        root.style.removeProperty(COLOR_VAR_MAP[key]);
      }
    }
    // 边框与纸影不可用取色器表达（带透明度），统一由正文色派生，保证与自定义底色和谐
    for (const [varName, alpha] of Object.entries(DERIVED_VAR_ALPHA)) {
      const derived = themeColors?.textColor ? hexToRgba(themeColors.textColor, alpha) : "";
      if (derived) {
        root.style.setProperty(varName, derived);
      } else {
        root.style.removeProperty(varName);
      }
    }
    // 外层背景渐变也随之推导，否则深色自定义主题下侧栏/页头仍残留浅色米调
    const bg = themeColors?.bgColor;
    if (bg) {
      const light = (relativeLuminance(parseHex(bg)) || 0) > 0.5;
      root.style.setProperty("--bg-gradient-start", shiftHex(bg, light ? -0.08 : -0.05));
      root.style.setProperty("--bg-glow", `rgba(255, 255, 255, ${light ? 0.4 : 0.05})`);
      root.style.setProperty("--control-bg", `rgba(255, 255, 255, ${light ? 0.35 : 0.1})`);
      root.style.setProperty(
        "--panel-wash",
        themeColors?.surfaceColor ? hexToRgba(themeColors.surfaceColor, light ? 0.4 : 0.55) : ""
      );
      if (!themeColors?.surfaceColor) root.style.removeProperty("--panel-wash");
    } else {
      root.style.removeProperty("--bg-gradient-start");
      root.style.removeProperty("--bg-glow");
      root.style.removeProperty("--control-bg");
      root.style.removeProperty("--panel-wash");
    }
  } else {
    for (const key of COLOR_KEYS) {
      root.style.removeProperty(COLOR_VAR_MAP[key]);
    }
    for (const varName of Object.keys(DERIVED_VAR_ALPHA)) {
      root.style.removeProperty(varName);
    }
    root.style.removeProperty("--bg-gradient-start");
    root.style.removeProperty("--bg-glow");
    root.style.removeProperty("--control-bg");
    root.style.removeProperty("--panel-wash");
    document.body.dataset.theme = theme || "paper";
  }

  const isCustom = theme === "custom";
  if (elements.themeColorGrid) {
    // 非自定义主题也回填当前预设的真实颜色：否则取色器一片灰，看起来像坏掉的控件
    const presetPalette = isCustom ? null : presetPaletteCache.get(theme);
    elements.themeColorGrid.querySelectorAll(".color-input").forEach((input) => {
      const key = input.dataset.colorKey;
      const rawValue = isCustom ? state.settings.themeColors?.[key] : presetPalette[key];
      input.value = toColorInputValue(rawValue);
      input.disabled = !isCustom;
      input.title = isCustom ? "" : t("warnColorLocked");
    });
  }
  // 非自定义主题时明确告知原因并给出一步到位的入口，避免取色器一片灰让人以为坏了。
  elements.colorLockedHint?.classList.toggle("hidden", isCustom);
  elements.themeColorGrid?.classList.toggle("is-locked", !isCustom);
  if (elements.contrastWarning) elements.contrastWarning.classList.add("hidden");
}

function applySettings() {
  applyTheme();
  applyFontSettings();
  document.documentElement.style.setProperty("--font-size", `${state.settings.fontSize}px`);
  document.documentElement.style.setProperty("--line-height", String(state.settings.lineHeight));
  elements.readingMode.value = state.settings.readingMode || "book";
  elements.themeSelect.value = state.settings.theme;
  elements.fontSize.value = String(state.settings.fontSize);
  elements.animationStyle.value = state.settings.animationStyle || "slide";
  elements.animationIntensity.value = String(state.settings.animationIntensity || 2);
  if (elements.showStats) {
    elements.showStats.checked = Boolean(state.settings.showStats);
  }
  if (elements.errorReporting) {
    elements.errorReporting.checked = Boolean(state.settings.errorReporting);
  }
  elements.statsSection?.classList.toggle("hidden", !state.settings.showStats);
  const disableAnimation = isScrollMode();
  elements.animationStyle.disabled = disableAnimation;
  elements.animationIntensity.disabled = disableAnimation;
  updateNavButtonLabels();
  updateImmersiveButton();
  renderSceneState();
  updateContrastStatus();
  if (!isScrollMode()) {
    hideModeHint();
  }
}

function updateScrollIndicator() {
  if (!isScrollMode()) {
    return;
  }

  const maxScroll = Math.max(1, elements.leftPage.scrollHeight - elements.leftPage.clientHeight);
  const progress = Math.round((elements.leftPage.scrollTop / maxScroll) * 100);
  elements.pageIndicator.textContent = `${progress}%`;

  if (maxScroll <= 1) {
    hideModeHint();
    return;
  }

  if (isAtScrollBoundary(1)) {
    showModeHint(t("readerHintBottomNextChapter"), 1200);
    return;
  }

  if (isAtScrollBoundary(-1)) {
    showModeHint(t("readerHintTopPrevChapter"), 1200);
    return;
  }

  hideModeHint();
}

function scrollContentBy(delta, behavior = "auto") {
  if (!isScrollMode()) {
    return;
  }

  elements.leftPage.scrollBy({ top: delta, behavior });
  window.setTimeout(updateScrollIndicator, behavior === "smooth" ? 180 : 20);
}

function scrollByScreen(direction) {
  const delta = Math.max(120, Math.floor(elements.leftPage.clientHeight * 0.9)) * direction;
  scrollContentBy(delta, "smooth");
}

function isAtScrollBoundary(direction) {
  const maxScroll = Math.max(0, elements.leftPage.scrollHeight - elements.leftPage.clientHeight);
  const top = elements.leftPage.scrollTop;
  const epsilon = 2;

  if (direction > 0) {
    return top >= maxScroll - epsilon;
  }

  return top <= epsilon;
}

function handleScrollModeSpace(direction) {
  if (direction > 0 && isAtScrollBoundary(1)) {
    if (state.book && state.currentChapterIndex + 1 < state.book.chapters.length) {
      showModeHint(t("readerHintNextChapter"), 700);
      goToChapter(state.currentChapterIndex + 1);
    }
    return;
  }

  if (direction < 0 && isAtScrollBoundary(-1)) {
    if (state.currentChapterIndex > 0) {
      showModeHint(t("readerHintPrevChapter"), 700);
      goToChapter(state.currentChapterIndex - 1);
    }
    return;
  }

  scrollByScreen(direction);
}

function scrollByLine(direction) {
  const delta = Math.max(24, Math.round(state.settings.fontSize * (state.settings.lineHeight || 1.8))) * direction;
  scrollContentBy(delta, "auto");
}

const ERROR_MESSAGE_KEYS = {
  [ERROR_KINDS.ENCODING]: "readerErrorEncoding",
  [ERROR_KINDS.EMPTY_FILE]: "readerErrorEmptyFile",
  [ERROR_KINDS.READ_FAILED]: "readerErrorReadFailed",
  [ERROR_KINDS.PARSE_FAILED]: "readerErrorParseFailed",
  [ERROR_KINDS.UNKNOWN]: "readerErrorUnknown"
};

/**
 * FR-M4：按当前状态切换「加载中 / 空 / 错误 / 阅读中」四态。
 * 阅读态下收起整个浮层，其余三态各自显示，错误态额外带出原因与恢复动作。
 */
function renderReaderState() {
  const viewState = resolveReaderViewState({
    isLoading: state.isImporting,
    error: state.importError,
    hasBook: Boolean(state.book),
    needsEncodingChoice: state.needsEncodingChoice
  });

  const toggle = (element, visible) => element?.classList.toggle("hidden", !visible);

  toggle(elements.stateOverlay, viewState !== READER_STATES.READING);
  toggle(elements.stateLoading, viewState === READER_STATES.LOADING);
  toggle(elements.stateEmpty, viewState === READER_STATES.EMPTY);
  toggle(elements.stateError, viewState === READER_STATES.ERROR);

  if (viewState === READER_STATES.ERROR) {
    const { kind, detail } = describeImportError({
      error: state.importError,
      needsEncodingChoice: state.needsEncodingChoice
    });
    const message = t(ERROR_MESSAGE_KEYS[kind] || "readerErrorUnknown");
    elements.stateErrorReason.textContent = detail ? `${message}（${detail}）` : message;
    // FR-M2：只有编码不可识别时才提供手动选编码入口，避免无关状态下误操作
    toggle(elements.stateErrorEncodingRow, kind === ERROR_KINDS.ENCODING);
  }
}

function renderSpread() {
  const chapter = state.book?.chapters?.[state.currentChapterIndex];
  const left = state.pages[state.currentPageIndex] || "";
  const right = state.pagesPerView === 2 ? state.pages[state.currentPageIndex + 1] || "" : "";
  const spreadIndex = Math.floor(state.currentPageIndex / state.pagesPerView) + 1;
  const spreadTotal = Math.max(1, Math.ceil(state.pages.length / state.pagesPerView));
  const isWarmupPending = Boolean(
    state.activePaginationSession &&
      !state.activePaginationSession.done &&
      state.activePaginationSession.bookId === state.book?.id &&
      state.activePaginationSession.chapterIndex === state.currentChapterIndex
  );

  elements.bookTitle.textContent = state.book?.name || "Xyfy TXT Reader";
  elements.leftTitle.textContent = chapter?.title || "";
  elements.rightTitle.textContent = chapter?.title || "";
  elements.leftPage.textContent = left || t("readerCurrentPageEmpty");
  elements.rightPage.textContent = right || t("readerChapterEnd");
  elements.leftPage.classList.toggle("empty", !left);
  elements.rightPage.classList.toggle("empty", !right && state.pagesPerView === 2);
  if (isScrollMode()) {
    elements.pageIndicator.textContent = "0%";
    elements.leftPage.scrollTop = 0;
    updateScrollIndicator();
  } else {
    elements.pageIndicator.textContent = isWarmupPending ? `${spreadIndex} / ${spreadTotal}+` : `${spreadIndex} / ${spreadTotal}`;
  }
  animateTurn();
  renderToc();
  renderStats();
  renderDebugPanel();
  renderReaderState();
  // 每次翻页/重排都算一次阅读活动，统计会话据此累计时长
  if (state.book) {
    markReadingActivity();
  }
}

async function persistProgress() {
  if (!state.book) {
    return;
  }

  await saveProgress({
    bookId: state.book.id,
    chapterIndex: state.currentChapterIndex,
    pageIndex: state.currentPageIndex,
    updatedAt: Date.now()
  });
  refreshRecentReads();
}

function getPageContentDimensions() {
  const el = elements.leftPage;
  if (!el || el.clientHeight === 0) return null;

  // Use the real rendered text container size, which already excludes header/footer/title areas.
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);

  let charWidth = Number.parseFloat(style.fontSize) || state.settings.fontSize;
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) {
      context.font = style.font;
      const sample = "测试中文AaBb123456";
      const measured = context.measureText(sample).width / sample.length;
      if (Number.isFinite(measured) && measured > 0) {
        charWidth = measured;
      }
    }
  } catch {
    // Ignore font measurement failures and use font-size fallback.
  }

  return {
    width: Math.max(50, Math.floor(rect.width)),
    height: Math.max(50, Math.floor(rect.height)),
    charWidth
  };
}

function estimateTargetChars(pageDimensions) {
  if (!pageDimensions) {
    return Math.max(700, Math.round(2200 - state.settings.fontSize * 45));
  }

  const lineHeightPx = state.settings.fontSize * (state.settings.lineHeight || 1.8);
  const avgCharWidth = Math.max(8, pageDimensions.charWidth || state.settings.fontSize);
  const charsPerLine = Math.floor((pageDimensions.width / avgCharWidth) * 0.93);
  const linesPerPage = Math.floor(pageDimensions.height / lineHeightPx);
  return Math.max(200, charsPerLine * linesPerPage);
}

function measureRenderedTextHeight(sourceEl, text) {
  const probe = document.createElement("div");
  const sourceStyle = window.getComputedStyle(sourceEl);
  probe.style.position = "fixed";
  probe.style.left = "-99999px";
  probe.style.top = "0";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.width = `${sourceEl.clientWidth}px`;
  probe.style.font = sourceStyle.font;
  probe.style.lineHeight = sourceStyle.lineHeight;
  probe.style.letterSpacing = sourceStyle.letterSpacing;
  probe.style.wordBreak = sourceStyle.wordBreak;
  probe.style.whiteSpace = sourceStyle.whiteSpace;
  probe.style.padding = "0";
  probe.style.margin = "0";
  probe.style.border = "0";
  probe.textContent = text || "";
  document.body.append(probe);
  const height = probe.scrollHeight;
  probe.remove();
  return height;
}

function createPageFitChecker(sourceEl) {
  const sourceStyle = window.getComputedStyle(sourceEl);
  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.left = "-99999px";
  probe.style.top = "0";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.width = `${sourceEl.clientWidth}px`;
  probe.style.font = sourceStyle.font;
  probe.style.lineHeight = sourceStyle.lineHeight;
  probe.style.letterSpacing = sourceStyle.letterSpacing;
  probe.style.wordBreak = sourceStyle.wordBreak;
  probe.style.whiteSpace = sourceStyle.whiteSpace;
  probe.style.padding = "0";
  probe.style.margin = "0";
  probe.style.border = "0";
  document.body.append(probe);

  return {
    fits(text) {
      probe.textContent = text || "";
      return probe.scrollHeight <= sourceEl.clientHeight + 1;
    },
    dispose() {
      probe.remove();
    }
  };
}

function renderDebugPanel() {
  if (!state.debugEnabled || !elements.debugPanel) {
    return;
  }

  const chapter = state.book?.chapters?.[state.currentChapterIndex];
  const pageDimensions = state.lastPageDimensions;
  const leftText = state.pages[state.currentPageIndex] || "";
  const rightText = state.pagesPerView === 2 ? state.pages[state.currentPageIndex + 1] || "" : "";
  const leftRenderedHeight = measureRenderedTextHeight(elements.leftPage, leftText);
  const rightRenderedHeight = state.pagesPerView === 2 ? measureRenderedTextHeight(elements.rightPage, rightText) : 0;
  const leftOverflow = leftRenderedHeight > elements.leftPage.clientHeight + 1;
  const rightOverflow = state.pagesPerView === 2 ? rightRenderedHeight > elements.rightPage.clientHeight + 1 : false;

  const viewportHeight = Math.round(window.innerHeight);
  const shellHeight = Math.round(elements.readerShell.getBoundingClientRect().height);
  const headerHeight = Math.round(elements.readerHeader.getBoundingClientRect().height);
  const spreadHeight = Math.round(elements.spreadShell.getBoundingClientRect().height);
  const footerHeight = Math.round(elements.readerFooter.getBoundingClientRect().height);
  const estimatedTargetChars = estimateTargetChars(pageDimensions);

  const rows = [
    "[Pagination Debug]",
    `chapter=${chapter?.title || "-"}`,
    `pageIndex=${state.currentPageIndex}/${Math.max(0, state.pages.length - 1)} pagesPerView=${state.pagesPerView}`,
    "mode=dom-fit-binary-search",
    "",
    `[layout] viewport=${viewportHeight}px shell=${shellHeight}px header=${headerHeight}px spread=${spreadHeight}px footer=${footerHeight}px`,
    `[content-box] width=${pageDimensions?.width ?? "-"} height=${pageDimensions?.height ?? "-"} charWidth=${pageDimensions ? pageDimensions.charWidth.toFixed(2) : "-"}`,
    `[estimate] targetChars=${estimatedTargetChars}`,
    "",
    `[left ] chars=${leftText.length} clientH=${elements.leftPage.clientHeight} renderedH=${leftRenderedHeight} overflow=${leftOverflow}`,
    `[right] chars=${rightText.length} clientH=${elements.rightPage.clientHeight} renderedH=${rightRenderedHeight} overflow=${rightOverflow}`
  ];

  elements.debugPanel.textContent = rows.join("\n");
}

function rebuildPages() {
  cancelPaginationWarmup();
  clearActivePaginationSession();
  const chapter = state.book?.chapters?.[state.currentChapterIndex];
  if (!chapter) {
    state.pages = [];
    renderSpread();
    return;
  }

  const pageDimensions = getPageContentDimensions();
  state.lastPageDimensions = pageDimensions;
  const cacheKey = state.book ? buildPaginationCacheKey(state.book.id, state.currentChapterIndex, pageDimensions) : null;
  if (isScrollMode()) {
    const scrollPages = cacheKey ? getCachedPages(cacheKey) : null;
    state.pages = scrollPages || [chapter.content.replace(/\r\n/g, "\n").trim()];
    if (cacheKey && !scrollPages) {
      setCachedPages(cacheKey, state.pages);
    }
    state.currentPageIndex = 0;
    renderSpread();
    persistProgress();
    return;
  }

  const cachedPages = cacheKey ? getCachedPages(cacheKey) : null;
  if (cachedPages) {
    state.pages = cachedPages;
    if (state.currentPageIndex >= state.pages.length) {
      state.currentPageIndex = 0;
    }
    if (state.currentPageIndex % state.pagesPerView !== 0) {
      state.currentPageIndex -= state.currentPageIndex % state.pagesPerView;
    }
    renderSpread();
    persistProgress();
    return;
  }

  const fitChecker = createPageFitChecker(elements.leftPage);
  const pager = createRenderedChapterPager(chapter.content, state.settings, pageDimensions, (text) => fitChecker.fits(text));
  state.activePaginationSession = {
    cacheKey,
    bookId: state.book.id,
    chapterIndex: state.currentChapterIndex,
    pager,
    fitChecker,
    pages: [],
    done: pager.done
  };
  const requiredCount = Math.max(state.currentPageIndex + state.pagesPerView, state.pagesPerView * 2);
  // FR-M1：单次生成量封顶。恢复进度到大文件深处时不能一口气生成几千页，
  // 先渲染已生成部分保证首屏，剩下的目标页交给空闲预热追赶。
  const cappedCount = Math.min(requiredCount, MAX_PAGES_PER_BUILD);
  state.pendingTargetPage = requiredCount > cappedCount ? state.currentPageIndex : null;
  ensurePagesLoaded(cappedCount);
  // 渐近分页下总页数在分页完成前未知，页码必须收敛到已生成范围，否则会渲染空白页
  state.currentPageIndex = clampSpreadStart(state.currentPageIndex, state.pages.length, state.pagesPerView);
  renderSpread();
  persistProgress();
  schedulePaginationWarmup();
}

async function refreshBookmarks() {
  if (!state.book) {
    state.bookmarks = [];
    renderBookmarks();
    return;
  }

  state.bookmarks = await listBookmarks(state.book.id);
  state.bookmarks.sort((left, right) => left.createdAt - right.createdAt);
  renderBookmarks();
}

async function loadBook(bookId) {
  const book = await getBook(bookId);
  if (!book) {
    await closeCurrentBookState({
      refreshLibrary: true,
      refreshRecentReadsList: true,
      resetFileMeta: true
    });
    return;
  }

  state.book = book;
  state.currentChapterIndex = 0;
  state.currentPageIndex = 0;
  elements.fileMeta.textContent = `${book.encoding} · ${formatSize(book.size)}`;

  const progress = await getProgress(book.id);
  if (progress) {
    state.currentChapterIndex = progress.chapterIndex || 0;
    state.currentPageIndex = progress.pageIndex || 0;
  }

  rebuildPages();
  await refreshBookmarks();
  renderLibrary();
  await refreshRecentReads();
}

/**
 * 导入文件（FR-M4 的加载态与错误态都收敛在这里）。
 * 以前这段没有任何 try/catch，损坏文件会直接抛未捕获异常、界面停在旧书上，
 * 用户既看不到原因也没有重试入口。
 *
 * @param {File} file
 * @param {string|null} encoding 手动指定的编码（FR-M2），为空则自动探测
 */
/**
 * 纯导入：解析并落库，成功后返回保存结果；失败抛出。
 * UI 状态（加载中/错误/编码选择）由调用方负责，批量队列复用这一段，
 * 避免「单文件导入」与「批量导入」各写一套解析逻辑而逐渐长歪。
 */
async function importFileCore(file, encoding = null) {
  const imported = await readTxtFile(file, encoding ? { encoding } : {});

  // FR-M2：自动探测不可靠时交由上层提示手动选编码，这里用带标记的错误区分于真正的失败
  if (imported.needsManual) {
    throw Object.assign(new Error("needs-manual-encoding"), {
      name: "NeedsManualEncodingError",
      needsManual: true
    });
  }

  if (!imported.text.trim()) {
    throw Object.assign(new Error("文件内容为空"), { name: "EmptyFileError" });
  }

  const { chapters, isFallback } = parseChaptersWithMeta(imported.text);
  // 同一文件再导入一次应该只是「重新打开」，而不是把同一本书追加成第二条
  const reopened = Boolean(await getBook(imported.id));
  const saved = await saveBook({
    ...imported,
    chapters
  });

  return { saved, isFallback, reopened };
}

async function importFile(file, encoding = null) {
  if (!file) {
    return;
  }

  state.lastImportFile = file;
  state.isImporting = true;
  state.importError = null;
  state.needsEncodingChoice = false;
  renderReaderState();

  try {
    const { saved, isFallback, reopened } = await importFileCore(file, encoding);

    state.chapterPageCache.clear();
    state.books = await listBooks();
    await loadBook(saved.id);
    await rememberRecentFile(saved);

    // FR-M3：无章节标记的书已按整本平铺，必须明确告诉用户，
    // 否则用户会以为是目录解析坏了。
    if (isFallback) {
      showModeHint(t("readerFlatBookHint"), 3200);
    }

    return { saved, isFallback, reopened };
  } catch (error) {
    if (error?.needsManual) {
      state.needsEncodingChoice = true;
      return;
    }
    state.importError = error;
    console.error("Xyfy.TxtReader 导入失败", error);
    errorReporter.report(error, { phase: "import" });
  } finally {
    state.isImporting = false;
    renderReaderState();
  }
}

/** 批量队列的单文件适配：只取「是否成功」，失败由队列自己收集。 */
async function importOneForQueue(file) {
  const { saved } = await importFileCore(file);
  return saved;
}

/** 拒绝原因压成一行：前两条给具体文件名，其余合并计数，避免提示条被撑爆。 */
function describeRejections(rejected) {
  const joiner = getCurrentLocale() === "zh_CN" ? "；" : "; ";
  const messages = rejected.map((item) =>
    t(REJECT_MESSAGE_KEY[item.reason] || "importRejectNotTxt", { name: item.name })
  );
  const shown = messages.slice(0, 2);
  if (messages.length > shown.length) {
    shown.push(t("importRejectMore", { count: messages.length - shown.length }));
  }
  return shown.join(joiner);
}

/**
 * 批量导入：先筛掉不合格的文件并逐条说明原因，再串行导入。
 * 串行是刻意的——并行解析多个大文件会把主线程打成死结。
 */
async function handleBatchImport(files) {
  const list = Array.from(files || []);
  if (!list.length) {
    return;
  }

  // 最近文件里已有的同名同大小文件也算重复：用户重拖同一本时不该再占一个书条目
  const existing = state.recentFiles.map((item) => ({ name: item.name, size: item.size }));
  const { accepted, rejected } = classifyDroppedFiles(list, { selected: existing });

  if (!accepted.length) {
    if (rejected.length) {
      elements.fileMeta.textContent = describeRejections(rejected);
    }
    return;
  }

  // 单文件导入可能是「已经在书库里」，importFileCore 会返回 reopened，这里如实说明
  if (accepted.length === 1 && !rejected.length) {
    const result = await importFile(accepted[0]);
    if (result?.reopened) {
      elements.fileMeta.textContent = t("importReopened", { name: accepted[0].name });
    }
    return;
  }

  const queue = createImportQueue({
    importOne: importOneForQueue,
    onProgress: ({ index, total }) => {
      elements.fileMeta.textContent = t("importBatchProgress", { current: index + 1, total });
    }
  });
  queue.enqueue(accepted);

  const summary = await queue.run();
  const savedList = summary.results.filter((item) => item.status === "done" && item.result).map((item) => item.result);

  // 每个成功的都要进最近文件，不能只记最后一个——用户导 5 本只看到 1 条会以为其余失败
  if (savedList.length) {
    let next = state.recentFiles;
    for (const saved of savedList) {
      const entry = toRecentEntry(saved, { bookId: saved?.id || null, importedAt: Date.now() });
      if (entry) {
        next = pushRecentFile(next, entry);
      }
    }
    state.recentFiles = next;
    await saveRecentFiles(next);
    renderRecentFiles();
  }

  // 队列里最后一个成功的书最可能是用户想看的
  const lastSaved = savedList[savedList.length - 1];
  if (lastSaved) {
    state.chapterPageCache.clear();
    state.books = await listBooks();
    await loadBook(lastSaved.id);
  }

  // 结果必须落在用户能看见的位置：showModeHint 在书本模式下不显示，等于没有反馈
  const parts = [];
  if (summary.failed > 0) {
    parts.push(t("importBatchPartial", { ok: summary.succeeded, failed: summary.failed }));
  } else {
    parts.push(t("importBatchDone", { count: summary.succeeded }));
  }
  if (rejected.length) {
    parts.push(describeRejections(rejected));
  }
  elements.fileMeta.textContent = parts.join(" · ");

  if (summary.failed > 0) {
    showModeHint(t("importBatchPartial", { ok: summary.succeeded, failed: summary.failed }), 3400);
  }
}

function handleFileSelection(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    return;
  }
  if (files.length === 1) {
    importFile(files[0]);
    return;
  }
  handleBatchImport(files);
}

/** FR-C1：整块阅读区作为拖拽落区，拖入即有实心提示。 */
function bindDropZone() {
  const zone = elements.readerShell;
  if (!zone) {
    return;
  }
  let depth = 0;

  const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");

  zone.addEventListener("dragenter", (event) => {
    if (!hasFiles(event)) {
      return;
    }
    event.preventDefault();
    depth += 1;
    elements.dropHint?.classList.remove("hidden");
  });

  zone.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) {
      return;
    }
    // 不 preventDefault 浏览器会直接打开文件，阅读器里的内容全没了
    event.preventDefault();
  });

  zone.addEventListener("dragleave", () => {
    // dragleave 在子元素间移动时也会触发，用计数避免提示层闪烁
    depth = Math.max(0, depth - 1);
    if (depth === 0) {
      elements.dropHint?.classList.add("hidden");
    }
  });

  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    depth = 0;
    elements.dropHint?.classList.add("hidden");
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length) {
      handleBatchImport(files);
    }
  });
}

/** 错误态的「重试」：有上次文件时直接重放，否则重新唤起文件选择 */
function handleRetryImport() {
  if (state.lastImportFile) {
    importFile(state.lastImportFile);
    return;
  }
  elements.fileInput?.click();
}

/** 空态的导入入口 */
function handleEmptyStateImport() {
  elements.fileInput?.click();
}

/** FR-M2：用手动选择的编码重新导入 */
function handleEncodingReimport() {
  const encoding = elements.stateErrorEncoding?.value;
  if (!encoding || !state.lastImportFile) {
    return;
  }
  importFile(state.lastImportFile, encoding);
}

/** 填充「手动选择编码」下拉（FR-M2 的手动入口） */
function fillEncodingOptions() {
  const select = elements.stateErrorEncoding;
  if (!select) {
    return;
  }

  for (const encoding of SUPPORTED_ENCODINGS) {
    const option = document.createElement("option");
    option.value = encoding;
    option.textContent = encoding;
    select.append(option);
  }
}

async function handleExportBackup() {
  const snapshot = await exportBackupSnapshot();
  const payload = createBackupPayload(snapshot);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = createBackupFilename();
  link.click();
  URL.revokeObjectURL(url);
  setBackupStatus(
    t("readerBackupExported", {
      books: payload.books.length,
      progress: payload.progress.length,
      bookmarks: payload.bookmarks.length
    })
  );
}

async function handleImportBackup(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const payload = parseBackupPayload(text);
    const result = await importBackupSnapshot(payload);

    state.chapterPageCache.clear();
    state.settings = await getReaderSettings();
    applySettings();
    detectPagesPerView();
    state.books = await listBooks();
    renderLibrary();
    await refreshRecentReads();

    const preferredBookId = state.book?.id || payload.books[0]?.id || state.books[0]?.id;
    if (preferredBookId) {
      await loadBook(preferredBookId);
    } else {
      renderBookmarks();
      renderToc();
      renderSpread();
    }

    setBackupStatus(
      t("readerBackupImported", {
        books: result.booksImported,
        progress: result.progressImported,
        bookmarks: result.bookmarksImported
      })
    );
  } catch (error) {
    console.error(error);
    setBackupStatus(error instanceof Error ? error.message : t("readerBackupImportFailed"), true);
  } finally {
    event.target.value = "";
  }
}

function goToChapter(index) {
  state.currentChapterIndex = index;
  state.currentPageIndex = 0;
  rebuildPages();
}

function nextPage() {
  if (!state.book) {
    return;
  }

  if (isScrollMode()) {
    handleScrollModeSpace(1);
    return;
  }

  ensurePagesLoaded(state.currentPageIndex + state.pagesPerView + state.pagesPerView);

  if (state.currentPageIndex + state.pagesPerView < state.pages.length) {
    state.currentPageIndex += state.pagesPerView;
    renderSpread();
    persistProgress();
    return;
  }

  if (state.currentChapterIndex + 1 < state.book.chapters.length) {
    goToChapter(state.currentChapterIndex + 1);
  }
}

function prevPage() {
  if (!state.book) {
    return;
  }

  if (isScrollMode()) {
    handleScrollModeSpace(-1);
    return;
  }

  if (state.currentPageIndex - state.pagesPerView >= 0) {
    state.currentPageIndex -= state.pagesPerView;
    renderSpread();
    persistProgress();
    return;
  }

  if (state.currentChapterIndex > 0) {
    state.currentChapterIndex -= 1;
    rebuildPages();
    state.currentPageIndex = Math.max(0, state.pages.length - (state.pages.length % state.pagesPerView || state.pagesPerView));
    renderSpread();
    persistProgress();
  }
}

async function addBookmark() {
  if (!state.book) {
    return;
  }

  const chapter = state.book.chapters[state.currentChapterIndex];
  const label = t("readerBookmarkLabel", {
    chapter: chapter.title,
    page: Math.floor(state.currentPageIndex / state.pagesPerView) + 1
  });
  await saveBookmark({
    id: `${state.book.id}:${state.currentChapterIndex}:${state.currentPageIndex}`,
    bookId: state.book.id,
    chapterIndex: state.currentChapterIndex,
    pageIndex: state.currentPageIndex,
    label,
    createdAt: Date.now()
  });
  await refreshBookmarks();
}

async function handleSettingsChange() {
  const nextTheme = elements.themeSelect.value;
  let themeColors = state.settings.themeColors;
  // 首次切入自定义主题时，先按当前观感填好各色值，而不是留空让用户从零调
  if (nextTheme === "custom" && !Object.values(themeColors || {}).some(Boolean)) {
    themeColors = captureCurrentPalette();
  }
  state.settings = {
    ...state.settings,
    readingMode: elements.readingMode.value,
    theme: nextTheme,
    themeColors,
    fontFamily: elements.fontSelect.value,
    fontSize: Number(elements.fontSize.value),
    lineHeight: state.settings.lineHeight,
    animationStyle: elements.animationStyle.value,
    animationIntensity: Number(elements.animationIntensity.value),
    showStats: Boolean(elements.showStats?.checked),
    errorReporting: Boolean(elements.errorReporting?.checked),
    // 用户亲手改过版式：后续设备自适应推荐不再覆盖，场景高亮也随之熄灭
    settingsTuned: true,
    scene: ""
  };
  applySettings();
  if (nextTheme === "custom") {
    updateContrastWarning(state.settings.themeColors);
  }
  detectPagesPerView();
  await saveReaderSettings(state.settings);
  // 写入后立刻刷新同步状态：超配额时用户必须当场看到「未同步」
  renderSyncStatus();
  rebuildPages();
}

function toggleSidePanel() {
  const hidden = elements.appShell.classList.toggle("panel-hidden");
  elements.togglePanel.setAttribute("aria-pressed", String(hidden));
  // Re-paginate after transition completes so new page width is measured correctly
  setTimeout(() => {
    detectPagesPerView();
    if (state.currentPageIndex % state.pagesPerView !== 0) {
      state.currentPageIndex -= state.currentPageIndex % state.pagesPerView;
    }
    rebuildPages();
  }, 250);
}

function toggleDebugPanel() {
  state.debugEnabled = !state.debugEnabled;
  elements.debugPanel.classList.toggle("hidden", !state.debugEnabled);
  elements.debugToggle.classList.toggle("active", state.debugEnabled);
  elements.debugToggle.setAttribute("aria-pressed", String(state.debugEnabled));
  if (state.debugEnabled) {
    renderDebugPanel();
  }
}

const EMPTY_THEME_COLORS = {
  bgColor: "",
  surfaceColor: "",
  textColor: "",
  mutedColor: "",
  accentColor: "",
  accentStrong: ""
};


function renderShortcutHelp() {
  if (!elements.shortcutHelpList) return;
  elements.shortcutHelpList.innerHTML = "";
  for (const action of READER_ACTIONS) {
    // 展示该动作的全部绑定（如「→ / ]」），避免次要键位生效却不可见。
    const keys = formatActionBindings(state.settings.keybindings, action);
    if (!keys) continue;
    const row = document.createElement("div");
    const key = document.createElement("strong");
    key.textContent = keys;
    const desc = document.createElement("span");
    desc.textContent = t(ACTION_LABEL_KEY[action] || action);
    row.append(key, desc);
    elements.shortcutHelpList.append(row);
  }
}



function resetColors() {
  state.settings = {
    ...state.settings,
    theme: "paper",
    themeColors: { ...EMPTY_THEME_COLORS }
  };
  applySettings();
  saveReaderSettings(state.settings).catch(() => {});
}

function updateContrastWarning(colors) {
  if (!elements.contrastWarning) return;
  // 正文同时显示在页面底色与纸面（面板/卡片）上，两者都需达标
  const ratios = [
    contrastRatio(colors.textColor, colors.bgColor),
    contrastRatio(colors.textColor, colors.surfaceColor)
  ].filter((r) => r !== null);
  const tooLow = ratios.some((r) => r < 4.5);
  elements.contrastWarning.classList.toggle("hidden", !tooLow);
}

function handleColorInputChange(event) {
  const input = event.target;
  const key = input.dataset.colorKey;
  if (!key) return;
  const nextColors = { ...state.settings.themeColors, [key]: input.value };
  const nextSettings = { ...state.settings, themeColors: nextColors };
  if (nextSettings.theme !== "custom") {
    nextSettings.theme = "custom";
    if (elements.themeSelect) elements.themeSelect.value = "custom";
  }
  state.settings = nextSettings;
  applyTheme();
  updateContrastWarning(nextColors);
  saveReaderSettings(state.settings).catch(() => {});
}

function applyCustomFontChange() {
  const useCustom = Boolean(elements.useCustomFont?.checked);
  let value = (elements.customFont?.value || "").trim();
  if (useCustom && !value) {
    // 勾选但尚未填写时保持勾选并把焦点交给输入框，避免"勾了没反应"
    state.settings = { ...state.settings, customFont: "" };
    applyFontSettings();
    elements.useCustomFont.checked = true;
    elements.customFont?.focus();
    return;
  }
  if (!useCustom) {
    value = "";
  }
  state.settings = { ...state.settings, customFont: value };
  applyFontSettings();
  saveReaderSettings(state.settings).catch(() => {});
}

function dispatchReaderAction(action) {
  switch (action) {
    case "nextChapter":
      if (state.book && state.currentChapterIndex + 1 < state.book.chapters.length) {
        goToChapter(state.currentChapterIndex + 1);
      }
      break;
    case "prevChapter":
      if (state.currentChapterIndex > 0) {
        goToChapter(state.currentChapterIndex - 1);
      }
      break;
    case "nextPage":
      if (isScrollMode()) {
        handleScrollModeSpace(1);
      } else {
        nextPage();
      }
      break;
    case "prevPage":
      if (isScrollMode()) {
        handleScrollModeSpace(-1);
      } else {
        prevPage();
      }
      break;
    case "scrollLineDown":
      scrollByLine(1);
      break;
    case "scrollLineUp":
      scrollByLine(-1);
      break;
    case "bookmark":
      addBookmark();
      break;
    case "togglePanel":
      toggleSidePanel();
      break;
    case "toggleDebug":
      toggleDebugPanel();
      break;
    case "openShortcuts":
      setShortcutsOverlay(true);
      break;
    default:
      break;
  }
}

function bindEvents() {
  settingsPanel.init();
  elements.fileInput.addEventListener("change", handleFileSelection);
  // FR-M4：三态对应的恢复动作——空态导入、错误态重试、错误态手动改编码重导入
  elements.stateEmptyImport?.addEventListener("click", handleEmptyStateImport);
  elements.stateErrorRetry?.addEventListener("click", handleRetryImport);
  elements.stateErrorEncodingApply?.addEventListener("click", handleEncodingReimport);
  fillEncodingOptions();
  elements.exportBackup.addEventListener("click", () => {
    handleExportBackup();
  });
  elements.importBackup.addEventListener("change", handleImportBackup);
  elements.resetData?.addEventListener("click", () => {
    handleResetData();
  });
  elements.closeCurrentBook?.addEventListener("click", () => {
    handleCloseCurrentBook();
  });
  elements.cloudConnect?.addEventListener("click", () => {
    handleCloudConnect();
  });
  elements.cloudSync?.addEventListener("click", () => {
    handleCloudSync();
  });
  elements.cloudTokenToggle?.addEventListener("click", () => {
    state.cloudTokenVisible = !state.cloudTokenVisible;
    updateTokenVisibility();
  });
  elements.languageSelect?.addEventListener("change", async (event) => {
    const nextLocale = event.target.value;
    await setLocale(nextLocale);
    refreshI18nUi();
    renderLibrary();
    renderBookmarks();
    renderStats();
    renderToc();
    renderSpread();
    await refreshRecentReads();
  });
  elements.librarySelect.addEventListener("change", (event) => {
    if (event.target.value) {
      loadBook(event.target.value);
    }
  });
  elements.prevPage.addEventListener("click", prevPage);
  elements.nextPage.addEventListener("click", nextPage);
  elements.prevChapter.addEventListener("click", () => {
    if (state.currentChapterIndex > 0) {
      goToChapter(state.currentChapterIndex - 1);
    }
  });
  elements.nextChapter.addEventListener("click", () => {
    if (state.book && state.currentChapterIndex + 1 < state.book.chapters.length) {
      goToChapter(state.currentChapterIndex + 1);
    }
  });
  elements.bookmarkButton.addEventListener("click", addBookmark);
  elements.togglePanel.addEventListener("click", toggleSidePanel);
  elements.immersiveToggle.addEventListener("click", () => {
    toggleImmersiveMode();
  });
  elements.immersiveExit.addEventListener("click", () => {
    toggleImmersiveMode();
  });
  elements.shortcutsToggle.addEventListener("click", () => {
    setShortcutsOverlay(true);
  });
  elements.settingsToggle?.addEventListener("click", () => {
    setSettingsOverlay(true);
  });
  elements.settingsClose?.addEventListener("click", () => {
    setSettingsOverlay(false);
  });
  elements.settingsOverlay?.addEventListener("click", (event) => {
    if (event.target === elements.settingsOverlay) {
      setSettingsOverlay(false);
    }
  });
  elements.shortcutsClose.addEventListener("click", () => {
    setShortcutsOverlay(false);
  });
  elements.shortcutsOverlay.addEventListener("click", (event) => {
    if (event.target === elements.shortcutsOverlay) {
      setShortcutsOverlay(false);
    }
  });
  elements.debugToggle.addEventListener("click", toggleDebugPanel);
  elements.readingMode.addEventListener("change", handleSettingsChange);
  elements.themeSelect.addEventListener("change", handleSettingsChange);
  elements.fontSelect.addEventListener("change", handleSettingsChange);
  elements.fontSize.addEventListener("input", handleSettingsChange);
  elements.animationStyle.addEventListener("change", handleSettingsChange);
  elements.animationIntensity.addEventListener("input", handleSettingsChange);
  elements.showStats?.addEventListener("change", handleSettingsChange);
  elements.errorReporting?.addEventListener("change", handleSettingsChange);

  // FR-C3：全局异常兜底。开关关闭时这两条只会写本地日志，不会外发任何数据。
  window.addEventListener("error", (event) => {
    errorReporter.report(event.error || new Error(event.message), { phase: "window.onerror" });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    errorReporter.report(reason, { phase: "unhandledrejection" });
  });
  elements.leftPage.addEventListener("scroll", () => {
    if (isScrollMode()) {
      updateScrollIndicator();
    }
  });

  window.addEventListener("resize", () => {
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }

    resizeTimer = setTimeout(() => {
      detectPagesPerView();
      if (state.currentPageIndex % state.pagesPerView !== 0) {
        state.currentPageIndex -= state.currentPageIndex % state.pagesPerView;
      }
      rebuildPages();
    }, 120);
  });

  elements.customFont?.addEventListener("input", applyCustomFontChange);
  elements.useCustomFont?.addEventListener("change", applyCustomFontChange);
  elements.resetColors?.addEventListener("click", resetColors);
  elements.resetKeys?.addEventListener("click", () => settingsPanel.resetKeys());
  elements.switchToCustom?.addEventListener("click", async () => {
    // 切回自定义主题时保留此前调好的配色，而不是让用户从头再调一遍
    state.settings = restoreCustomPalette(state.settings);
    elements.themeSelect.value = "custom";
    await handleSettingsChange();
  });
  elements.themeColorGrid?.querySelectorAll(".color-input").forEach((input) => {
    input.addEventListener("input", handleColorInputChange);
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
      return;
    }

    // Escape 关闭浮层为不可重绑的保护性固定行为；引导层级最高，先关它
    if (event.key === "Escape") {
      if (onboardingOpen) {
        event.preventDefault();
        closeOnboarding({ skipped: true });
        return;
      }
      if (shortcutsOpen) {
        event.preventDefault();
        setShortcutsOverlay(false);
        return;
      }
      if (settingsOpen) {
        event.preventDefault();
        setSettingsOverlay(false);
        return;
      }
      return;
    }

    // 引导是模态的：打开期间其余快捷键不该穿透到正文，否则用户按空格会翻页却看不见
    if (onboardingOpen) {
      return;
    }

    const action = matchKeyBinding(event, state.settings.keybindings);
    if (action) {
      event.preventDefault();
      dispatchReaderAction(action);
    }
  });

  // FR-C2 场景按钮
  elements.sceneModeGroup?.querySelectorAll(".scene-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      handleSceneChange(chip.dataset.scene);
    });
  });

  // FR-S3 冲突裁决
  elements.conflictKeepLocal?.addEventListener("click", () => handleConflictResolve("keep-local"));
  elements.conflictKeepRemote?.addEventListener("click", () => handleConflictResolve("keep-remote"));
  elements.conflictMerge?.addEventListener("click", () => handleConflictResolve("newest-per-field"));

  // FR-S1 引导
  elements.onboardingSkip?.addEventListener("click", () => closeOnboarding({ skipped: true }));
  elements.onboardingNext?.addEventListener("click", async () => {
    const { index, isLast } = getStep(state.onboardingStep);
    if (isLast) {
      await closeOnboarding({ skipped: false });
      return;
    }
    state.onboardingStep = nextStepIndex(index);
    renderOnboardingStep();
  });

  // FR-S4 跳到正文：把焦点交给主区域，读屏会从这里继续
  elements.skipToContent?.addEventListener("click", (event) => {
    event.preventDefault();
    elements.readerMain?.focus();
  });

  // FR-C1 拖拽落区
  bindDropZone();
}

async function bootstrap() {
  await initializeI18n();
  refreshI18nUi();

  // 必须在 getReaderSettings 之前：后者会把胜出一方写回另一侧，冲突就再也判不出来了
  await capturePendingConflict();

  state.settings = await getReaderSettings();
  state.books = await listBooks();
  state.readingStats = (await getReadingStats()) || createStats();
  state.recentFiles = await getRecentFiles();
  detectPagesPerView();
  applySettings();
  renderLibrary();
  renderBookmarks();
  renderStats();
  renderRecentFiles();
  renderSceneState();
  bindEvents();
  await initializeCloudSection();
  await refreshRecentReads();

  if (state.books[0]) {
    await loadBook(state.books[0].id);
  }

  // 首次引导：先套用设备推荐值，再展示引导，用户第一眼看到的就是适合当前屏幕的版式
  if (shouldShowOnboarding({ settings: state.settings, bookCount: state.books.length })) {
    await applyFirstRunDefaults();
    openOnboarding();
  }

  startReadingClock();
}

bootstrap().catch((error) => {
  console.error(error);
  elements.fileMeta.textContent = t("readerInitFailed");
});
