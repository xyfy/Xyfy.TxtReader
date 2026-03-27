const SETTINGS_KEY = "reader-settings";
const SETTINGS_SYNC_KEY = "reader-settings-sync";
const PROGRESS_SYNC_KEY = "reader-progress-sync";
const SETTINGS_UPDATED_AT_KEY = "settingsUpdatedAt";
const DEFAULT_SETTINGS = {
  theme: "paper",
  fontFamily: '"Noto Serif SC", Georgia, serif',
  fontSize: 18,
  lineHeight: 1.8,
  readingMode: "book",
  animationStyle: "slide",
  animationIntensity: 2
};
const DATABASE_NAME = "xyfy-txt-reader";
const DATABASE_VERSION = 1;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains("books")) {
        database.createObjectStore("books", { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains("progress")) {
        database.createObjectStore("progress", { keyPath: "bookId" });
      }

      if (!database.objectStoreNames.contains("bookmarks")) {
        const store = database.createObjectStore("bookmarks", { keyPath: "id" });
        store.createIndex("bookId", "bookId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(storeName, mode, callback) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, mode);
  const store = transaction.objectStore(storeName);
  const result = await callback(store);
  await transactionDone(transaction);
  database.close();
  return result;
}

function storageArea() {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return null;
  }

  return chrome.storage.local;
}

function syncArea() {
  if (typeof chrome === "undefined" || !chrome.storage?.sync) {
    return null;
  }

  return chrome.storage.sync;
}

export function normalizeStoredSettings(settings = {}, updatedAt = 0) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    [SETTINGS_UPDATED_AT_KEY]: Number(settings?.[SETTINGS_UPDATED_AT_KEY] || updatedAt || 0)
  };
}

export function chooseNewerRecord(localRecord, syncRecord) {
  const localUpdatedAt = Number(localRecord?.updatedAt || localRecord?.[SETTINGS_UPDATED_AT_KEY] || 0);
  const syncUpdatedAt = Number(syncRecord?.updatedAt || syncRecord?.[SETTINGS_UPDATED_AT_KEY] || 0);

  if (!localRecord) {
    return syncRecord || null;
  }

  if (!syncRecord) {
    return localRecord;
  }

  return syncUpdatedAt > localUpdatedAt ? syncRecord : localRecord;
}

async function mirrorSettingsToSync(settings) {
  const area = syncArea();
  if (!area) {
    return;
  }

  await area.set({
    [SETTINGS_SYNC_KEY]: settings
  });
}

async function mirrorProgressToSync(progress) {
  const area = syncArea();
  if (!area) {
    return;
  }

  const existing = await area.get(PROGRESS_SYNC_KEY);
  const next = {
    ...(existing[PROGRESS_SYNC_KEY] || {}),
    [progress.bookId]: {
      chapterIndex: progress.chapterIndex,
      pageIndex: progress.pageIndex,
      updatedAt: progress.updatedAt
    }
  };

  await area.set({
    [PROGRESS_SYNC_KEY]: next
  });
}

export function getDefaultSettings() {
  return normalizeStoredSettings(DEFAULT_SETTINGS);
}

export async function getReaderSettings() {
  const area = storageArea();
  if (!area) {
    return getDefaultSettings();
  }

  const [localResult, syncResult] = await Promise.all([
    area.get(SETTINGS_KEY),
    syncArea() ? syncArea().get(SETTINGS_SYNC_KEY) : Promise.resolve({})
  ]);

  const localSettings = localResult[SETTINGS_KEY] ? normalizeStoredSettings(localResult[SETTINGS_KEY]) : null;
  const syncedSettings = syncResult[SETTINGS_SYNC_KEY] ? normalizeStoredSettings(syncResult[SETTINGS_SYNC_KEY]) : null;
  const winner = chooseNewerRecord(localSettings, syncedSettings) || getDefaultSettings();

  if (!localSettings || winner[SETTINGS_UPDATED_AT_KEY] > localSettings[SETTINGS_UPDATED_AT_KEY]) {
    await area.set({ [SETTINGS_KEY]: winner });
  }
  if (!syncedSettings || winner[SETTINGS_UPDATED_AT_KEY] > syncedSettings[SETTINGS_UPDATED_AT_KEY]) {
    await mirrorSettingsToSync(winner);
  }

  return winner;
}

export async function saveReaderSettings(settings) {
  const area = storageArea();
  if (!area) {
    return;
  }

  const nextSettings = normalizeStoredSettings(settings, Date.now());

  await area.set({
    [SETTINGS_KEY]: nextSettings
  });
  await mirrorSettingsToSync(nextSettings);
}

export async function saveBook(book) {
  const payload = {
    ...book,
    updatedAt: Date.now()
  };

  await withStore("books", "readwrite", async (store) => {
    store.put(payload);
  });

  return payload;
}

export async function listBooks() {
  const books = await withStore("books", "readonly", async (store) => {
    return requestToPromise(store.getAll());
  });

  return books
    .map(({ id, name, size, encoding, updatedAt, chapters = [] }) => ({
      id,
      name,
      size,
      encoding,
      updatedAt,
      chapterCount: chapters.length
    }))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function getBook(bookId) {
  return withStore("books", "readonly", async (store) => {
    return requestToPromise(store.get(bookId));
  });
}

export async function saveProgress(progress) {
  await withStore("progress", "readwrite", async (store) => {
    store.put(progress);
  });
  await mirrorProgressToSync(progress);
}

export async function getProgress(bookId) {
  const [localProgress, syncResult] = await Promise.all([
    withStore("progress", "readonly", async (store) => {
      return requestToPromise(store.get(bookId));
    }),
    syncArea() ? syncArea().get(PROGRESS_SYNC_KEY) : Promise.resolve({})
  ]);

  const syncProgress = syncResult[PROGRESS_SYNC_KEY]?.[bookId] || null;
  const winner = chooseNewerRecord(localProgress, syncProgress);

  if (winner && (!localProgress || winner.updatedAt > Number(localProgress.updatedAt || 0))) {
    await withStore("progress", "readwrite", async (store) => {
      store.put({
        bookId,
        chapterIndex: winner.chapterIndex || 0,
        pageIndex: winner.pageIndex || 0,
        updatedAt: winner.updatedAt || Date.now()
      });
    });
  }

  if (winner && (!syncProgress || winner.updatedAt > Number(syncProgress.updatedAt || 0))) {
    await mirrorProgressToSync({
      bookId,
      chapterIndex: winner.chapterIndex || 0,
      pageIndex: winner.pageIndex || 0,
      updatedAt: winner.updatedAt || Date.now()
    });
  }

  return winner;
}

export async function listBookmarks(bookId) {
  return withStore("bookmarks", "readonly", async (store) => {
    const index = store.index("bookId");
    return requestToPromise(index.getAll(bookId));
  });
}

export async function saveBookmark(bookmark) {
  await withStore("bookmarks", "readwrite", async (store) => {
    store.put(bookmark);
  });
}

export async function deleteBookmark(bookmarkId) {
  await withStore("bookmarks", "readwrite", async (store) => {
    store.delete(bookmarkId);
  });
}

export async function exportBackupSnapshot() {
  const [books, progress, bookmarks, settings] = await Promise.all([
    withStore("books", "readonly", async (store) => requestToPromise(store.getAll())),
    withStore("progress", "readonly", async (store) => requestToPromise(store.getAll())),
    withStore("bookmarks", "readonly", async (store) => requestToPromise(store.getAll())),
    getReaderSettings()
  ]);

  return {
    settings,
    books,
    progress,
    bookmarks
  };
}

export async function importBackupSnapshot(snapshot) {
  const normalizedSettings = normalizeStoredSettings(snapshot.settings || {}, Date.now());
  const books = Array.isArray(snapshot.books) ? snapshot.books : [];
  const progress = Array.isArray(snapshot.progress) ? snapshot.progress : [];
  const bookmarks = Array.isArray(snapshot.bookmarks) ? snapshot.bookmarks : [];

  await Promise.all([
    saveReaderSettings(normalizedSettings),
    withStore("books", "readwrite", async (store) => {
      for (const book of books) {
        store.put({
          ...book,
          updatedAt: book.updatedAt || Date.now()
        });
      }
    }),
    withStore("progress", "readwrite", async (store) => {
      for (const item of progress) {
        store.put(item);
      }
    }),
    withStore("bookmarks", "readwrite", async (store) => {
      for (const bookmark of bookmarks) {
        store.put(bookmark);
      }
    })
  ]);

  for (const item of progress) {
    await mirrorProgressToSync(item);
  }

  return {
    settings: normalizedSettings,
    booksImported: books.length,
    progressImported: progress.length,
    bookmarksImported: bookmarks.length
  };
}
