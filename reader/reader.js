import { readTxtFile } from "../modules/file-handler.js";
import { createBackupFilename, createBackupPayload, parseBackupPayload } from "../modules/backup.js";
import { parseChapters } from "../modules/chapter-parser.js";
import { createRenderedChapterPager, paginateChapter } from "../modules/paginator.js";
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
  importBackupSnapshot,
  listAllProgress,
  listBookmarks,
  listBooks,
  resetReaderData,
  saveBook,
  saveBookmark,
  saveProgress,
  saveReaderSettings
} from "../modules/storage.js";

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
  cloudConfig: {
    gistId: "",
    token: ""
  },
  cloudTokenVisible: false,
  cloudAuthed: false,
  cloudOperationInProgress: false
};

const PAGE_CACHE_LIMIT = 8;

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
  readerShell: document.querySelector(".reader-shell")
};

let resizeTimer = null;
let modeHintTimer = null;
let warmupTimer = null;
let shortcutsOpen = false;
let settingsOpen = false;

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
}

function ensurePagesLoaded(requiredCount, maxPagesToGenerate = Number.POSITIVE_INFINITY) {
  const session = state.activePaginationSession;
  if (!session) {
    return;
  }

  let generated = 0;
  while (!session.done && session.pages.length < requiredCount && generated < maxPagesToGenerate) {
    const nextPage = session.pager.next();
    if (!nextPage) {
      session.done = true;
      break;
    }
    session.pages.push(nextPage);
    session.done = session.pager.done;
    generated += 1;
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
}

const GIST_CONFIG_KEY = "gistCloudConfig";

function loadGistConfig() {
  return new Promise((resolve) => {
    if (!globalThis.chrome?.storage?.local) {
      resolve({ gistId: "", token: "" });
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

  const ready = await state.cloudProvider.isReady();
  state.cloudAuthed = ready;

  if (ready) {
    setCloudStatus(t("readerCloudConnected", { provider: state.cloudProviderName }), "connected");
    elements.cloudBackupsContainer.classList.remove("hidden");
    await refreshCloudBackups();
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
  elements.shortcutsOverlay.classList.toggle("hidden", !open);
}

function setSettingsOverlay(open) {
  settingsOpen = open;
  elements.settingsOverlay?.classList.toggle("hidden", !open);
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

function applySettings() {
  document.body.dataset.theme = state.settings.theme;
  document.documentElement.style.setProperty("--font-family", state.settings.fontFamily);
  document.documentElement.style.setProperty("--font-size", `${state.settings.fontSize}px`);
  document.documentElement.style.setProperty("--line-height", String(state.settings.lineHeight));
  elements.readingMode.value = state.settings.readingMode || "book";
  elements.themeSelect.value = state.settings.theme;
  elements.fontSelect.value = state.settings.fontFamily;
  elements.fontSize.value = String(state.settings.fontSize);
  elements.animationStyle.value = state.settings.animationStyle || "slide";
  elements.animationIntensity.value = String(state.settings.animationIntensity || 2);
  if (elements.showStats) {
    elements.showStats.checked = Boolean(state.settings.showStats);
  }
  elements.statsSection?.classList.toggle("hidden", !state.settings.showStats);
  const disableAnimation = isScrollMode();
  elements.animationStyle.disabled = disableAnimation;
  elements.animationIntensity.disabled = disableAnimation;
  updateNavButtonLabels();
  updateImmersiveButton();
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
  ensurePagesLoaded(requiredCount);
  if (state.currentPageIndex >= state.pages.length) {
    state.currentPageIndex = 0;
  }
  if (state.currentPageIndex % state.pagesPerView !== 0) {
    state.currentPageIndex -= state.currentPageIndex % state.pagesPerView;
  }
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

async function handleFileSelection(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const imported = await readTxtFile(file);
  const chapters = parseChapters(imported.text);
  const saved = await saveBook({
    ...imported,
    chapters
  });

  state.chapterPageCache.clear();
  state.books = await listBooks();
  await loadBook(saved.id);
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
  state.settings = {
    ...state.settings,
    readingMode: elements.readingMode.value,
    theme: elements.themeSelect.value,
    fontFamily: elements.fontSelect.value,
    fontSize: Number(elements.fontSize.value),
    lineHeight: state.settings.lineHeight,
    animationStyle: elements.animationStyle.value,
    animationIntensity: Number(elements.animationIntensity.value),
    showStats: Boolean(elements.showStats?.checked)
  };
  applySettings();
  detectPagesPerView();
  await saveReaderSettings(state.settings);
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

function bindEvents() {
  elements.fileInput.addEventListener("change", handleFileSelection);
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

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
      return;
    }

    if (event.key === "Escape" && shortcutsOpen) {
      event.preventDefault();
      setShortcutsOverlay(false);
      return;
    }

    if (event.key === "Escape" && settingsOpen) {
      event.preventDefault();
      setSettingsOverlay(false);
      return;
    }

    if (event.key === "?" || event.key.toLowerCase() === "h") {
      event.preventDefault();
      setShortcutsOverlay(true);
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      toggleSidePanel();
    }

    if (event.altKey && event.key.toLowerCase() === "d") {
      event.preventDefault();
      toggleDebugPanel();
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (state.book && state.currentChapterIndex + 1 < state.book.chapters.length) {
        goToChapter(state.currentChapterIndex + 1);
      }
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (state.currentChapterIndex > 0) {
        goToChapter(state.currentChapterIndex - 1);
      }
    }

    if (isScrollMode() && event.key === "ArrowDown") {
      event.preventDefault();
      scrollByLine(1);
    }

    if (isScrollMode() && event.key === "ArrowUp") {
      event.preventDefault();
      scrollByLine(-1);
    }

    if (event.key === " ") {
      event.preventDefault();
      if (isScrollMode()) {
        handleScrollModeSpace(event.shiftKey ? -1 : 1);
      } else {
        if (event.shiftKey) {
          prevPage();
        } else {
          nextPage();
        }
      }
    }

    if (event.key === "[") {
      event.preventDefault();
      if (state.currentChapterIndex > 0) {
        goToChapter(state.currentChapterIndex - 1);
      }
    }

    if (event.key === "]") {
      event.preventDefault();
      if (state.book && state.currentChapterIndex + 1 < state.book.chapters.length) {
        goToChapter(state.currentChapterIndex + 1);
      }
    }

    if (event.key.toLowerCase() === "b") {
      event.preventDefault();
      addBookmark();
    }
  });

}

async function bootstrap() {
  await initializeI18n();
  refreshI18nUi();

  state.settings = await getReaderSettings();
  state.books = await listBooks();
  detectPagesPerView();
  applySettings();
  renderLibrary();
  renderBookmarks();
  renderStats();
  bindEvents();
  await initializeCloudSection();
  await refreshRecentReads();

  if (state.books[0]) {
    await loadBook(state.books[0].id);
  }
}

bootstrap().catch((error) => {
  console.error(error);
  elements.fileMeta.textContent = t("readerInitFailed");
});
