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
  fontSize: document.getElementById("font-size")
};

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
}

function renderSpread() {
  const chapter = state.book?.chapters?.[state.currentChapterIndex];
  const left = state.pages[state.currentPageIndex] || "";
  const right = state.pages[state.currentPageIndex + 1] || "";
  const spreadIndex = Math.floor(state.currentPageIndex / 2) + 1;
  const spreadTotal = Math.max(1, Math.ceil(state.pages.length / 2));

  elements.bookTitle.textContent = state.book?.name || "Xyfy TXT Reader";
  elements.leftTitle.textContent = chapter?.title || "";
  elements.rightTitle.textContent = chapter?.title || "";
  elements.leftPage.textContent = left || "当前页没有内容";
  elements.rightPage.textContent = right || "已经到本章末尾";
  elements.leftPage.classList.toggle("empty", !left);
  elements.rightPage.classList.toggle("empty", !right);
  elements.pageIndicator.textContent = `${spreadIndex} / ${spreadTotal}`;
  renderToc();
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

function rebuildPages() {
  const chapter = state.book?.chapters?.[state.currentChapterIndex];
  if (!chapter) {
    state.pages = [];
    renderSpread();
    return;
  }

  state.pages = paginateChapter(chapter.content, state.settings);
  if (state.currentPageIndex >= state.pages.length) {
    state.currentPageIndex = 0;
  }
  if (state.currentPageIndex % 2 !== 0) {
    state.currentPageIndex -= 1;
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

  if (state.currentPageIndex + 2 < state.pages.length) {
    state.currentPageIndex += 2;
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

  if (state.currentPageIndex - 2 >= 0) {
    state.currentPageIndex -= 2;
    renderSpread();
    persistProgress();
    return;
  }

  if (state.currentChapterIndex > 0) {
    state.currentChapterIndex -= 1;
    rebuildPages();
    state.currentPageIndex = Math.max(0, state.pages.length - (state.pages.length % 2 === 0 ? 2 : 1));
    renderSpread();
    persistProgress();
  }
}

async function addBookmark() {
  if (!state.book) {
    return;
  }

  const chapter = state.book.chapters[state.currentChapterIndex];
  const label = `${chapter.title} · 第 ${Math.floor(state.currentPageIndex / 2) + 1} 页组`;
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
    lineHeight: state.settings.lineHeight
  };
  applySettings();
  await saveReaderSettings(state.settings);
  rebuildPages();
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
  elements.themeSelect.addEventListener("change", handleSettingsChange);
  elements.fontSelect.addEventListener("change", handleSettingsChange);
  elements.fontSize.addEventListener("input", handleSettingsChange);

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
      return;
    }

    if (event.key === "ArrowRight" || event.key.toLowerCase() === "j") {
      event.preventDefault();
      nextPage();
    }

    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "k") {
      event.preventDefault();
      prevPage();
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
