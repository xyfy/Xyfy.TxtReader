import { readTxtFile } from "../modules/file-handler.js";
import { createBackupFilename, createBackupPayload, parseBackupPayload } from "../modules/backup.js";
import { parseChapters } from "../modules/chapter-parser.js";
import { createRenderedChapterPager, paginateChapter } from "../modules/paginator.js";
import { CloudStorage } from "../modules/cloud-storage.js";
import { GistProvider } from "../modules/gist-provider.js";
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
  cloudConnect: document.getElementById("cloud-connect"),
  cloudSync: document.getElementById("cloud-sync"),
  cloudStatus: document.getElementById("cloud-status"),
  cloudStatusBadge: document.getElementById("cloud-status-badge"),
  cloudBackupsContainer: document.getElementById("cloud-backups-container"),
  cloudBackupsList: document.getElementById("cloud-backups-list"),
  cloudQuota: document.getElementById("cloud-quota"),
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
  spreadShell: document.querySelector(".spread-shell"),
  appShell: document.querySelector(".app-shell"),
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
    elements.prevPage.textContent = "上滚";
    elements.nextPage.textContent = "下滚";
    return;
  }

  elements.prevPage.textContent = "上一页";
  elements.nextPage.textContent = "下一页";
}

function updateImmersiveButton() {
  elements.immersiveToggle.classList.toggle("active", state.immersiveActive);
  elements.immersiveToggle.setAttribute("aria-pressed", String(state.immersiveActive));
  elements.immersiveToggle.setAttribute("aria-label", state.immersiveActive ? "退出沉浸模式" : "进入沉浸模式");
  elements.immersiveToggle.title = state.immersiveActive ? "退出沉浸模式" : "进入沉浸模式";
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

function setCloudStatus(message, status = "idle", isError = false) {
  elements.cloudStatus.textContent = message;
  elements.cloudStatus.style.color = isError ? "#b5442a" : "";
  elements.cloudStatusBadge.dataset.status = status;
  elements.cloudStatusBadge.title = message;
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
    return "未知时间";
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

async function handleCloudRestore(fileId) {
  if (!fileId || !state.cloudProvider || state.cloudOperationInProgress) {
    return;
  }

  setCloudActionBusy(true);
  setCloudStatus("正在从云端恢复备份...", "connected");

  try {
    const restoreResult = await state.cloudProvider.restoreFromCloud(fileId);
    if (!restoreResult.success) {
      throw restoreResult.error || new Error("云端恢复失败");
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
      `恢复完成：${importResult.booksImported} 本书、${importResult.progressImported} 条进度、${importResult.bookmarksImported} 个书签`,
      "connected"
    );
  } catch (error) {
    setCloudStatus(error instanceof Error ? error.message : "云端恢复失败", "error", true);
  } finally {
    setCloudActionBusy(false);
  }
}

async function handleCloudDelete(fileId) {
  if (!fileId || !state.cloudProvider || state.cloudOperationInProgress) {
    return;
  }

  const confirmed = window.confirm("确认删除这条云备份吗？此操作不可撤销。");
  if (!confirmed) {
    return;
  }

  setCloudActionBusy(true);
  setCloudStatus("正在删除云端备份...", "connected");

  try {
    const result = await state.cloudProvider.deleteCloudBackup(fileId);
    if (!result.success) {
      throw result.error || new Error("删除失败");
    }
    setCloudStatus("云端备份已删除", "connected");
    await refreshCloudBackups();
  } catch (error) {
    setCloudStatus(error instanceof Error ? error.message : "删除失败", "error", true);
  } finally {
    setCloudActionBusy(false);
  }
}

function renderCloudBackups(backups) {
  elements.cloudBackupsList.innerHTML = "";
  if (!Array.isArray(backups) || backups.length === 0) {
    const empty = document.createElement("p");
    empty.className = "file-meta";
    empty.textContent = "暂无云端备份";
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
    name.textContent = backup.fileName || "未命名备份";

    const time = document.createElement("div");
    time.className = "backup-time";
    time.textContent = `${formatCloudTime(backup.uploadedAt)} · ${formatSize(Number(backup.size || 0))}`;

    info.append(name, time);

    const actions = document.createElement("div");
    actions.className = "backup-actions";

    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.textContent = "恢复";
    restoreButton.addEventListener("click", () => {
      handleCloudRestore(backup.fileId);
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "删除";
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
    elements.cloudQuota.textContent = `云空间：${formatSize(Number(quota.usedBytes || 0))} / ${formatSize(Number(quota.totalBytes || 0))}`;
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
  state.cloudProviderName = providerMeta.name || "云服务";

  state.cloudProvider = new CloudStorage({
    provider
  });

  const initResult = await state.cloudProvider.initialize();
  if (!initResult.success) {
    setCloudStatus(`${state.cloudProviderName} 初始化失败`, "error", true);
    setCloudActionBusy(false);
    return;
  }

  const ready = await state.cloudProvider.isReady();
  state.cloudAuthed = ready;

  if (ready) {
    setCloudStatus(`已连接 ${state.cloudProviderName}（使用你的 Gist 存储）`, "connected");
    elements.cloudBackupsContainer.classList.remove("hidden");
    await refreshCloudBackups();
  } else {
    setCloudStatus("请填写 Gist ID 和 Token，再点击“连接 Gist”", "needs-auth");
    elements.cloudBackupsContainer.classList.add("hidden");
  }

  setCloudActionBusy(false);
}

async function handleCloudConnect() {
  if (!state.cloudProvider || state.cloudOperationInProgress || elements.cloudConnect.disabled) {
    return;
  }

  setCloudActionBusy(true);
  setCloudStatus(`正在连接 ${state.cloudProviderName}...`, "needs-auth");

  try {
    const gistId = elements.cloudGistId?.value?.trim() || "";
    const token = elements.cloudGistToken?.value?.trim() || "";

    if (!gistId || !token) {
      throw new Error("请填写 Gist ID 和 Token");
    }

    const result = await state.cloudProvider.requestCloudAuth({ gistId, token });
    if (result.success) {
      state.cloudAuthed = true;
      state.cloudConfig = { gistId, token };
      await saveGistConfig(state.cloudConfig);
      setCloudStatus(`${state.cloudProviderName} 连接成功，备份将写入你的 Gist`, "connected");
      elements.cloudBackupsContainer.classList.remove("hidden");
      await refreshCloudBackups();
    } else {
      state.cloudAuthed = false;
      const message = result.error?.message || "连接失败";
      setCloudStatus(`连接失败：${message}`, "error", true);
    }
  } catch (error) {
    state.cloudAuthed = false;
    setCloudStatus(error instanceof Error ? error.message : "连接失败", "error", true);
  } finally {
    setCloudActionBusy(false);
  }
}

async function handleCloudSync() {
  if (!state.cloudProvider || state.cloudOperationInProgress) {
    return;
  }

  setCloudActionBusy(true);
  setCloudStatus("正在同步到云端...", "connected");

  try {
    const snapshot = await exportBackupSnapshot();
    const payload = createBackupPayload(snapshot);
    const result = await state.cloudProvider.backupToCloud(payload, {
      fileName: createBackupFilename()
    });

    if (result.success) {
      setCloudStatus("云端备份已更新", "connected");
      elements.cloudBackupsContainer.classList.remove("hidden");
      await refreshCloudBackups();
    } else {
      const message = result.error?.message || "同步失败";
      setCloudStatus(`同步失败：${message}`, "error", true);
    }
  } catch (error) {
    setCloudStatus(error instanceof Error ? error.message : "同步失败", "error", true);
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
    empty.textContent = "还没有最近阅读记录";
    elements.recentList.append(empty);
    return;
  }

  for (const entry of recentEntries) {
    const book = bookMap.get(entry.bookId);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${book?.name || entry.bookId} · 第 ${Number(entry.chapterIndex || 0) + 1} 章`;
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
  const stats = [];
  const chapter = state.book?.chapters?.[state.currentChapterIndex];
  const chapterCount = state.book?.chapters?.length || 0;
  const chapterChars = chapter?.content?.length || 0;
  const totalChars = state.book?.chapters?.reduce((sum, item) => sum + (item.content?.length || 0), 0) || 0;
  const chapterProgress = chapterCount ? `${state.currentChapterIndex + 1} / ${chapterCount}` : "-";
  const pageProgress = isScrollMode()
    ? elements.pageIndicator.textContent || "0%"
    : `${Math.floor(state.currentPageIndex / Math.max(1, state.pagesPerView)) + 1} / ${Math.max(1, Math.ceil(state.pages.length / Math.max(1, state.pagesPerView)))}`;

  stats.push(["模式", isScrollMode() ? "单页滚动" : state.pagesPerView === 2 ? "书本双页" : "书本单页"]);
  stats.push(["章节", chapterProgress]);
  stats.push(["页进度", pageProgress]);
  stats.push(["本章字数", chapterChars ? `${chapterChars.toLocaleString()} 字` : "-"]);
  stats.push(["全书字数", totalChars ? `${totalChars.toLocaleString()} 字` : "-"]);
  stats.push(["书签数", `${state.bookmarks.length}`]);

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

function renderLibrary() {
  elements.librarySelect.innerHTML = "";

  if (!state.books.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "暂无已保存书籍";
    elements.librarySelect.append(option);
    return;
  }

  for (const book of state.books) {
    const option = document.createElement("option");
    option.value = book.id;
    option.textContent = `${book.name} · ${book.chapterCount}章`;
    if (state.book && state.book.id === book.id) {
      option.selected = true;
    }
    elements.librarySelect.append(option);
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
    empty.textContent = "当前书籍还没有书签";
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
    remove.textContent = "删除";
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
    showModeHint("已到底，按右方向键或空格切下一章", 1200);
    return;
  }

  if (isAtScrollBoundary(-1)) {
    showModeHint("已到顶，按左方向键或 Shift+空格回上一章", 1200);
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
      showModeHint("切换到下一章", 700);
      goToChapter(state.currentChapterIndex + 1);
    }
    return;
  }

  if (direction < 0 && isAtScrollBoundary(-1)) {
    if (state.currentChapterIndex > 0) {
      showModeHint("切换到上一章", 700);
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
  elements.leftPage.textContent = left || "当前页没有内容";
  elements.rightPage.textContent = right || "已经到本章末尾";
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
  setBackupStatus(`已导出 ${payload.books.length} 本书、${payload.progress.length} 条进度、${payload.bookmarks.length} 个书签`);
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
      `已恢复 ${result.booksImported} 本书、${result.progressImported} 条进度、${result.bookmarksImported} 个书签`
    );
  } catch (error) {
    console.error(error);
    setBackupStatus(error instanceof Error ? error.message : "恢复备份失败", true);
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
  const label = `${chapter.title} · 第 ${Math.floor(state.currentPageIndex / state.pagesPerView) + 1} 页组`;
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
    animationIntensity: Number(elements.animationIntensity.value)
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
  elements.cloudConnect?.addEventListener("click", () => {
    handleCloudConnect();
  });
  elements.cloudSync?.addEventListener("click", () => {
    handleCloudSync();
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

    if (event.key === "ArrowRight" || (!isScrollMode() && event.key.toLowerCase() === "j")) {
      event.preventDefault();
      nextPage();
    }

    if (event.key === "ArrowLeft" || (!isScrollMode() && event.key.toLowerCase() === "k")) {
      event.preventDefault();
      prevPage();
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
          if (state.currentChapterIndex > 0) {
            goToChapter(state.currentChapterIndex - 1);
          }
        } else {
          if (state.book && state.currentChapterIndex + 1 < state.book.chapters.length) {
            goToChapter(state.currentChapterIndex + 1);
          }
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
  elements.fileMeta.textContent = "初始化失败，请查看控制台错误。";
});
