import { readTxtFile } from "../modules/file-handler.js";
import { parseChapters } from "../modules/chapter-parser.js";
import { paginateChapter } from "../modules/paginator.js";
import {
  deleteBookmark,
  getBook,
  getDefaultSettings,
  getProgress,
  getReaderSettings,
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
  debugEnabled: false,
  lastPageDimensions: null,
  pagesPerView: 2,
  currentChapterIndex: 0,
  currentPageIndex: 0
};

const elements = {
  fileInput: document.getElementById("file-input"),
  fileMeta: document.getElementById("file-meta"),
  librarySelect: document.getElementById("library-select"),
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
  prevPage: document.getElementById("prev-page"),
  nextPage: document.getElementById("next-page"),
  prevChapter: document.getElementById("prev-chapter"),
  nextChapter: document.getElementById("next-chapter"),
  themeSelect: document.getElementById("theme-select"),
  fontSelect: document.getElementById("font-select"),
  fontSize: document.getElementById("font-size"),
  animationStyle: document.getElementById("animation-style"),
  animationIntensity: document.getElementById("animation-intensity"),
  spreadShell: document.querySelector(".spread-shell"),
  appShell: document.querySelector(".app-shell"),
  togglePanel: document.getElementById("toggle-panel"),
  debugToggle: document.getElementById("debug-toggle"),
  debugPanel: document.getElementById("debug-panel"),
  readerHeader: document.querySelector(".reader-header"),
  readerFooter: document.querySelector(".reader-footer"),
  readerShell: document.querySelector(".reader-shell")
};

function detectPagesPerView() {
  const isMobile = window.matchMedia("(max-width: 820px)").matches;
  state.pagesPerView = isMobile ? 1 : 2;
  elements.spreadShell.classList.toggle("is-single", isMobile);
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
  elements.themeSelect.value = state.settings.theme;
  elements.fontSelect.value = state.settings.fontFamily;
  elements.fontSize.value = String(state.settings.fontSize);
  elements.animationStyle.value = state.settings.animationStyle || "slide";
  elements.animationIntensity.value = String(state.settings.animationIntensity || 2);
}

function renderSpread() {
  const chapter = state.book?.chapters?.[state.currentChapterIndex];
  const left = state.pages[state.currentPageIndex] || "";
  const right = state.pagesPerView === 2 ? state.pages[state.currentPageIndex + 1] || "" : "";
  const spreadIndex = Math.floor(state.currentPageIndex / state.pagesPerView) + 1;
  const spreadTotal = Math.max(1, Math.ceil(state.pages.length / state.pagesPerView));

  elements.bookTitle.textContent = state.book?.name || "Xyfy TXT Reader";
  elements.leftTitle.textContent = chapter?.title || "";
  elements.rightTitle.textContent = chapter?.title || "";
  elements.leftPage.textContent = left || "当前页没有内容";
  elements.rightPage.textContent = right || "已经到本章末尾";
  elements.leftPage.classList.toggle("empty", !left);
  elements.rightPage.classList.toggle("empty", !right && state.pagesPerView === 2);
  elements.pageIndicator.textContent = `${spreadIndex} / ${spreadTotal}`;
  animateTurn();
  renderToc();
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
  const chapter = state.book?.chapters?.[state.currentChapterIndex];
  if (!chapter) {
    state.pages = [];
    renderSpread();
    return;
  }

  const pageDimensions = getPageContentDimensions();
  state.lastPageDimensions = pageDimensions;
  let fitChecker = null;
  try {
    fitChecker = createPageFitChecker(elements.leftPage);
    state.pages = paginateChapter(chapter.content, state.settings, pageDimensions, (text) => fitChecker.fits(text));
  } finally {
    fitChecker?.dispose();
  }
  if (state.currentPageIndex >= state.pages.length) {
    state.currentPageIndex = 0;
  }
  if (state.currentPageIndex % state.pagesPerView !== 0) {
    state.currentPageIndex -= state.currentPageIndex % state.pagesPerView;
  }
  renderSpread();
  persistProgress();
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

  state.books = await listBooks();
  await loadBook(saved.id);
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
    theme: elements.themeSelect.value,
    fontFamily: elements.fontSelect.value,
    fontSize: Number(elements.fontSize.value),
    lineHeight: state.settings.lineHeight,
    animationStyle: elements.animationStyle.value,
    animationIntensity: Number(elements.animationIntensity.value)
  };
  applySettings();
  await saveReaderSettings(state.settings);
  rebuildPages();
}

function toggleSidePanel() {
  const hidden = elements.appShell.classList.toggle("panel-hidden");
  elements.togglePanel.setAttribute("aria-pressed", String(hidden));
  // Re-paginate after transition completes so new page width is measured correctly
  setTimeout(() => rebuildPages(), 250);
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
  elements.debugToggle.addEventListener("click", toggleDebugPanel);
  elements.themeSelect.addEventListener("change", handleSettingsChange);
  elements.fontSelect.addEventListener("change", handleSettingsChange);
  elements.fontSize.addEventListener("input", handleSettingsChange);
  elements.animationStyle.addEventListener("change", handleSettingsChange);
  elements.animationIntensity.addEventListener("input", handleSettingsChange);

  window.addEventListener("resize", () => {
    detectPagesPerView();
    if (state.currentPageIndex % state.pagesPerView !== 0) {
      state.currentPageIndex -= state.currentPageIndex % state.pagesPerView;
    }
    rebuildPages();
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
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

    if (event.key === "ArrowRight" || event.key.toLowerCase() === "j") {
      event.preventDefault();
      nextPage();
    }

    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "k") {
      event.preventDefault();
      prevPage();
    }

    if (event.key === " ") {
      event.preventDefault();
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
  bindEvents();

  if (state.books[0]) {
    await loadBook(state.books[0].id);
  }
}

bootstrap().catch((error) => {
  console.error(error);
  elements.fileMeta.textContent = "初始化失败，请查看控制台错误。";
});
