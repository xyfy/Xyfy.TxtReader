import assert from "node:assert/strict";
import { chooseNewerRecord, normalizeStoredSettings } from "../modules/storage.js";

function run() {
  const normalized = normalizeStoredSettings({ theme: "night" }, 123);
  assert.equal(normalized.theme, "night");
  assert.equal(normalized.settingsUpdatedAt, 123);
  assert.equal(normalized.readingMode, "book");

  const localSettings = { theme: "paper", settingsUpdatedAt: 100 };
  const syncSettings = { theme: "night", settingsUpdatedAt: 200 };
  assert.equal(chooseNewerRecord(localSettings, syncSettings), syncSettings);
  assert.equal(chooseNewerRecord(syncSettings, localSettings), syncSettings);

  const localProgress = { bookId: "1", chapterIndex: 2, pageIndex: 3, updatedAt: 500 };
  const syncProgress = { bookId: "1", chapterIndex: 1, pageIndex: 8, updatedAt: 300 };
  assert.equal(chooseNewerRecord(localProgress, syncProgress), localProgress);
  assert.equal(chooseNewerRecord(null, syncProgress), syncProgress);
  assert.equal(chooseNewerRecord(localProgress, null), localProgress);

  console.log("storage sync tests passed");
}

run();