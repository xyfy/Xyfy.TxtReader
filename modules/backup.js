export const BACKUP_SCHEMA_VERSION = 1;

export function createBackupPayload(snapshot) {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: {
      name: "Xyfy TXT Reader"
    },
    settings: snapshot.settings || {},
    books: Array.isArray(snapshot.books) ? snapshot.books : [],
    progress: Array.isArray(snapshot.progress) ? snapshot.progress : [],
    bookmarks: Array.isArray(snapshot.bookmarks) ? snapshot.bookmarks : []
  };
}

export function parseBackupPayload(text) {
  const data = JSON.parse(text);

  if (!data || typeof data !== "object") {
    throw new Error("备份文件格式无效。");
  }

  if (data.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error(`不支持的备份版本: ${data.schemaVersion ?? "unknown"}`);
  }

  if (!Array.isArray(data.books) || !Array.isArray(data.progress) || !Array.isArray(data.bookmarks)) {
    throw new Error("备份文件缺少必要数据。" );
  }

  return {
    settings: data.settings || {},
    books: data.books,
    progress: data.progress,
    bookmarks: data.bookmarks,
    exportedAt: data.exportedAt || null
  };
}

export function createBackupFilename(date = new Date()) {
  const stamp = date.toISOString().replace(/[:]/g, "-").replace(/\.\d{3}Z$/, "Z");
  return `xyfy-txt-reader-backup-${stamp}.json`;
}