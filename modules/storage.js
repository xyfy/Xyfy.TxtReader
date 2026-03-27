const SETTINGS_KEY = "reader-settings";
const DEFAULT_SETTINGS = {
  theme: "paper",
  fontFamily: '"Noto Serif SC", Georgia, serif',
  fontSize: 18,
  lineHeight: 1.8,
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

export function getDefaultSettings() {
  return { ...DEFAULT_SETTINGS };
}

export async function getReaderSettings() {
  const area = storageArea();
  if (!area) {
    return getDefaultSettings();
  }

  const result = await area.get(SETTINGS_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...(result[SETTINGS_KEY] || {})
  };
}

export async function saveReaderSettings(settings) {
  const area = storageArea();
  if (!area) {
    return;
  }

  await area.set({
    [SETTINGS_KEY]: settings
  });
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
}

export async function getProgress(bookId) {
  return withStore("progress", "readonly", async (store) => {
    return requestToPromise(store.get(bookId));
  });
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
