import assert from "node:assert/strict";
import {
  BACKUP_SCHEMA_VERSION,
  createBackupFilename,
  createBackupPayload,
  parseBackupPayload
} from "../modules/backup.js";

function run() {
  const snapshot = {
    settings: { theme: "paper", readingMode: "book" },
    books: [{ id: "book-1", name: "测试书", chapters: [{ title: "第一章", content: "内容" }] }],
    progress: [{ bookId: "book-1", chapterIndex: 0, pageIndex: 0, updatedAt: 1 }],
    bookmarks: [{ id: "bm-1", bookId: "book-1", chapterIndex: 0, pageIndex: 0, label: "起点", createdAt: 1 }]
  };

  const payload = createBackupPayload(snapshot);
  assert.equal(payload.schemaVersion, BACKUP_SCHEMA_VERSION);
  assert.equal(payload.books.length, 1);

  const parsed = parseBackupPayload(JSON.stringify(payload));
  assert.equal(parsed.books[0].id, "book-1");
  assert.equal(parsed.bookmarks[0].id, "bm-1");

  const filename = createBackupFilename(new Date("2026-03-28T12:34:56.000Z"));
  assert.equal(filename, "xyfy-txt-reader-backup-2026-03-28T12-34-56Z.json");

  assert.throws(() => parseBackupPayload("{}"), /不支持的备份版本/);
  assert.throws(
    () =>
      parseBackupPayload(
        JSON.stringify({
          schemaVersion: BACKUP_SCHEMA_VERSION,
          books: {},
          progress: [],
          bookmarks: []
        })
      ),
    /缺少必要数据/
  );

  console.log("backup tests passed");
}

run();