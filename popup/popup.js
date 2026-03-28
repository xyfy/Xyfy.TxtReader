import { applyI18n } from "../modules/i18n.js";

applyI18n();

const openReaderButton = document.getElementById("open-reader");

openReaderButton?.addEventListener("click", async () => {
  const readerUrl = chrome.runtime.getURL("reader/reader.html");
  await chrome.tabs.create({ url: readerUrl });
  window.close();
});
