import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import {
  getReaderSettings,
  listAllProgress,
  listBookmarks,
  listBooks,
  resetReaderData,
  saveBook,
  saveBookmark,
  saveProgress,
  saveReaderSettings
} from "../modules/storage.js";

const DATABASE_NAME = "xyfy-txt-reader";

function createStorageArea(seed = {}) {
  const state = { ...seed };

  return {
    state,
    api: {
      async get(keys) {
        if (typeof keys === "string") {
          return { [keys]: state[keys] };
        }

        if (Array.isArray(keys)) {
          return Object.fromEntries(keys.map((key) => [key, state[key]]));
        }

        return { ...state };
      },
      async set(values) {
        Object.assign(state, values);
      },
      async remove(keys) {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const key of list) {
          delete state[key];
        }
      }
    }
  };
}

function deleteDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

async function setupChromeStorage({ withSync }) {
  await deleteDatabase(DATABASE_NAME);

  const local = createStorageArea();
  const sync = createStorageArea();
  globalThis.chrome = {
    storage: withSync
      ? { local: local.api, sync: sync.api }
      : { local: local.api }
  };

  return { localState: local.state, syncState: sync.state };
}

async function seedReaderState() {
  await saveReaderSettings({ theme: "night" });
  await saveBook({
    id: "book-1",
    name: "测试书",
    size: 128,
    encoding: "utf-8",
    chapters: [{ title: "第一章", content: "内容" }]
  });
  await saveProgress({
    bookId: "book-1",
    chapterIndex: 0,
    pageIndex: 1,
    updatedAt: 100
  });
  await saveBookmark({
    id: "bm-1",
    bookId: "book-1",
    chapterIndex: 0,
    pageIndex: 1,
    label: "书签",
    createdAt: 100
  });
}

async function testResetKeepsBooks() {
  const { syncState } = await setupChromeStorage({ withSync: true });
  await seedReaderState();

  const result = await resetReaderData({
    settings: true,
    progress: true,
    bookmarks: true,
    books: false
  });

  assert.equal(result.settingsReset, true);
  assert.equal(result.progressCleared, true);
  assert.equal(result.bookmarksCleared, true);
  assert.equal(result.booksCleared, false);
  assert.equal(result.syncUsed, true);

  const settings = await getReaderSettings();
  const books = await listBooks();
  const progress = await listAllProgress();
  const bookmarks = await listBookmarks("book-1");

  assert.equal(settings.theme, "paper");
  assert.equal(books.length, 1);
  assert.equal(progress.length, 0);
  assert.equal(bookmarks.length, 0);
  assert.ok(syncState["reader-settings-sync"]);
  assert.equal(syncState["reader-progress-sync"], undefined);
}

async function testResetCanClearBooksOnly() {
  await setupChromeStorage({ withSync: true });
  await seedReaderState();

  const result = await resetReaderData({
    settings: false,
    progress: false,
    bookmarks: false,
    books: true
  });

  assert.equal(result.booksCleared, true);
  assert.equal(result.settingsReset, false);

  const settings = await getReaderSettings();
  const books = await listBooks();
  const progress = await listAllProgress();
  const bookmarks = await listBookmarks("book-1");

  assert.equal(settings.theme, "night");
  assert.equal(books.length, 0);
  assert.equal(progress.length, 1);
  assert.equal(bookmarks.length, 1);
}

async function testResetWithoutSyncFallsBackToLocalOnly() {
  const { localState } = await setupChromeStorage({ withSync: false });
  await seedReaderState();

  const result = await resetReaderData({
    settings: true,
    progress: false,
    bookmarks: false,
    books: false
  });

  assert.equal(result.syncUsed, false);
  const settings = await getReaderSettings();
  assert.equal(settings.theme, "paper");
  assert.equal(localState["reader-settings"].theme, "paper");
}

async function run() {
  await testResetKeepsBooks();
  await testResetCanClearBooksOnly();
  await testResetWithoutSyncFallsBackToLocalOnly();
  await deleteDatabase(DATABASE_NAME);
  console.log("storage reset tests passed");
}

run();