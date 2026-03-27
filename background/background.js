chrome.runtime.onInstalled.addListener(() => {
  console.log("Xyfy TXT Reader installed");
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "open-reader") {
    return;
  }

  chrome.tabs.create({ url: chrome.runtime.getURL("reader/reader.html") });
});
