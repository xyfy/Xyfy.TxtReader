const LOCALE_ZH = "zh_CN";
const LOCALE_EN = "en";
const LOCALE_STORAGE_KEY = "uiLocale";

export const MESSAGES = {
  en: {
    extName: "Xyfy TXT Reader",
    popupEyebrow: "TXT Reader",
    popupHeading: "Open Reader",
    popupSummary: "Import a local TXT file and continue reading with pagination, backup, and sync support.",
    popupOpenButton: "Open Reader",
    readerHeaderEyebrow: "Book View",
    readerImportLabel: "Import",
    readerChooseLocalTxt: "Choose local TXT",
    readerNoFile: "No file imported yet",
    readerRecentReads: "Recent Reads",
    readerLibrary: "Library",
    readerToc: "Contents",
    readerBookmarks: "Bookmarks",
    readerAddBookmark: "Add",
    readerBackup: "Backup",
    readerExportJson: "Export JSON",
    readerImportBackup: "Restore Backup",
    readerBackupHint: "Export or restore books, progress, bookmarks, and reading settings",
    readerStats: "Reading Stats",
    readerTogglePanelTitle: "Show or hide sidebar (Tab)",
    readerShortcutsButton: "Shortcuts",
    readerShortcutsTitle: "Keyboard Shortcuts",
    readerShortcutsClose: "Close",
    readerDebugButton: "Debug",
    readerDebugTitle: "Pagination debug panel",
    readerPrevChapter: "Previous Chapter",
    readerNextChapter: "Next Chapter",
    readerEmptyPageStart: "Import a TXT file to start reading",
    readerEmptyPageSupport: "Contents, bookmarks, settings, and shortcuts are supported",
    readerPrevPage: "Previous Page",
    readerNextPage: "Next Page",
    readerScrollUp: "Scroll Up",
    readerScrollDown: "Scroll Down",
    readerModeLabel: "Mode",
    readerModeBook: "Two-page Book",
    readerModeScroll: "Scrolling",
    readerThemeLabel: "Background",
    readerThemePaper: "Paper",
    readerThemeSepia: "Sepia",
    readerThemeNight: "Night",
    readerFontLabel: "Font",
    readerFontSerif: "Serif",
    readerFontSans: "Sans",
    readerFontKai: "Kai",
    readerFontSizeLabel: "Font Size",
    readerAnimationLabel: "Animation",
    readerAnimationNone: "Off",
    readerAnimationSlide: "Slide",
    readerAnimationFade: "Fade",
    readerIntensityLabel: "Intensity",
    readerImmersiveEnter: "Enter immersive mode",
    readerImmersiveExit: "Exit immersive mode",
    readerShortcutsDescArrows: "Switch chapters",
    readerShortcutsDescSpace: "Next page (or next chapter at page boundary)",
    readerShortcutsDescShiftSpace: "Previous page (or previous chapter at page boundary)",
    readerShortcutsDescVertical: "Scroll by small steps in scrolling mode",
    readerShortcutsDescBookmark: "Add a bookmark for the current location",
    readerShortcutsDescSidebar: "Show or hide the sidebar",
    readerShortcutsDescHelp: "Open keyboard shortcuts help",
    readerShortcutsDescDebug: "Toggle the pagination debug panel",
    readerShortcutsDescEsc: "Close the shortcuts overlay",
    readerRecentEmpty: "No recent reading history yet",
    readerRecentChapterItem: "{name} · Chapter {chapter}",
    readerStatsMode: "Mode",
    readerStatsModeBookDouble: "Two-page Book",
    readerStatsModeBookSingle: "Single-page Book",
    readerStatsModeScroll: "Scrolling",
    readerStatsChapter: "Chapter",
    readerStatsPageProgress: "Page Progress",
    readerStatsChapterChars: "Chapter Length",
    readerStatsTotalChars: "Book Length",
    readerStatsBookmarkCount: "Bookmarks",
    readerCharsUnit: "{count} chars",
    readerLibraryEmpty: "No saved books yet",
    readerLibraryItem: "{name} · {count} chapters",
    readerBookmarksEmpty: "No bookmarks for this book yet",
    readerDelete: "Delete",
    readerHintBottomNextChapter: "At the end. Press Space to move to the next chapter.",
    readerHintTopPrevChapter: "At the top. Press Shift+Space to return to the previous chapter.",
    readerHintNextChapter: "Switched to next chapter",
    readerHintPrevChapter: "Switched to previous chapter",
    readerCurrentPageEmpty: "This page is empty",
    readerChapterEnd: "You have reached the end of this chapter",
    readerBackupExported: "Exported {books} books, {progress} progress items, and {bookmarks} bookmarks",
    readerBackupImported: "Restored {books} books, {progress} progress items, and {bookmarks} bookmarks",
    readerBackupImportFailed: "Failed to restore backup",
    readerResetTitle: "Reset data",
    readerResetTargetSettings: "Reading settings",
    readerResetTargetProgress: "Reading progress",
    readerResetTargetBookmarks: "Bookmarks",
    readerResetTargetBooks: "Imported books",
    readerResetAction: "Reset selected items",
    readerResetConfirm: "Confirm reset for: {targets}? This cannot be undone.",
    readerResetNothingSelected: "Select at least one reset target",
    readerResetDone: "Reset completed: {targets}",
    readerResetFailed: "Failed to reset selected data",
    readerLanguageLabel: "Language",
    readerLanguageZh: "简体中文",
    readerLanguageEn: "English",
    readerManageButton: "Manage",
    readerManageTitle: "Reading Management",
    readerManageShowStats: "Show reading stats",
    readerCloudBackup: "Cloud Backup",
    readerCloudConnect: "Connect Gist",
    readerCloudSync: "Sync",
    readerCloudBackups: "Cloud Backup List",
    readerCloudStatusHint: "Enter your own Gist ID and Token. Backups are stored in your Gist.",
    readerCloudGistId: "Gist ID",
    readerCloudGistIdPlaceholder: "e.g. a1b2c3d4...",
    readerCloudToken: "Token",
    readerCloudTokenPlaceholder: "GitHub Personal Access Token",
    readerCloudToggleTokenShow: "Show",
    readerCloudToggleTokenHide: "Hide",
    readerCloudTokenRequirement: "Token must include Gist write permission (classic token: gist, or fine-grained token with gist access).",
    readerCloudNeedConfig: "Please fill in Gist ID and Token, then click Connect Gist",
    readerCloudConnecting: "Connecting to {provider}...",
    readerCloudConnected: "Connected to {provider}. Backups will be stored in your Gist",
    readerCloudSyncing: "Syncing to cloud...",
    readerCloudSynced: "Cloud backup updated",
    readerCloudSyncFailed: "Sync failed: {message}",
    readerCloudConnectFailed: "Connection failed: {message}",
    readerCloudSyncFailedShort: "Sync failed",
    readerCloudConnectFailedShort: "Connection failed",
    readerCloudDeleteConfirm: "Delete this cloud backup? This cannot be undone.",
    readerCloudDeleting: "Deleting cloud backup...",
    readerCloudDeleted: "Cloud backup deleted",
    readerCloudDeleteFailed: "Delete failed",
    readerCloudRestoring: "Restoring backup from cloud...",
    readerCloudRestoreFailed: "Cloud restore failed",
    readerCloudRestoreDone: "Restore complete: {books} books, {progress} progress items, {bookmarks} bookmarks",
    readerCloudBackupEmpty: "No cloud backup yet",
    readerCloudBackupUnnamed: "Unnamed backup",
    readerCloudQuota: "Cloud usage: {used} / {total}",
    readerCloudRestore: "Restore",
    readerCloudDelete: "Delete",
    readerSyncFallbackLocalOnly: "{provider} sync is unavailable. Using local storage only.",
    readerBookmarkLabel: "{chapter} · Page group {page}",
    readerInitFailed: "Initialization failed. Check the console for details.",
    readerUnknownTime: "Unknown time",
    readerCloudProviderFallback: "Cloud Service"
  },
  zh_CN: {
    extName: "文本阅读器",
    popupEyebrow: "TXT Reader",
    popupHeading: "打开阅读器",
    popupSummary: "导入本地 TXT 后即可继续阅读，并支持分页、备份和同步。",
    popupOpenButton: "进入阅读器",
    readerHeaderEyebrow: "阅读视图",
    readerImportLabel: "导入",
    readerChooseLocalTxt: "选择本地 TXT",
    readerNoFile: "尚未导入文件",
    readerRecentReads: "最近阅读",
    readerLibrary: "书架",
    readerToc: "目录",
    readerBookmarks: "书签",
    readerAddBookmark: "添加",
    readerBackup: "备份",
    readerExportJson: "导出 JSON",
    readerImportBackup: "恢复备份",
    readerBackupHint: "可导出书籍、进度、书签与阅读设置",
    readerStats: "阅读统计",
    readerTogglePanelTitle: "隐藏/显示侧边栏 (Tab)",
    readerShortcutsButton: "快捷键",
    readerShortcutsTitle: "快捷键帮助",
    readerShortcutsClose: "关闭",
    readerDebugButton: "调试",
    readerDebugTitle: "分页调试面板",
    readerPrevChapter: "上一章",
    readerNextChapter: "下一章",
    readerEmptyPageStart: "导入 TXT 后开始阅读",
    readerEmptyPageSupport: "支持目录、书签、设置与快捷键",
    readerPrevPage: "上一页",
    readerNextPage: "下一页",
    readerScrollUp: "上滚",
    readerScrollDown: "下滚",
    readerModeLabel: "模式",
    readerModeBook: "书本双页",
    readerModeScroll: "单页滚动",
    readerThemeLabel: "背景",
    readerThemePaper: "纸张",
    readerThemeSepia: "护眼",
    readerThemeNight: "夜间",
    readerFontLabel: "字体",
    readerFontSerif: "衬线",
    readerFontSans: "黑体",
    readerFontKai: "楷体",
    readerFontSizeLabel: "字号",
    readerAnimationLabel: "动画",
    readerAnimationNone: "关闭",
    readerAnimationSlide: "滑动",
    readerAnimationFade: "淡入",
    readerIntensityLabel: "强度",
    readerImmersiveEnter: "进入沉浸模式",
    readerImmersiveExit: "退出沉浸模式",
    readerShortcutsDescArrows: "切换章节",
    readerShortcutsDescSpace: "下一页（页末自动切到下一章）",
    readerShortcutsDescShiftSpace: "上一页（页首自动回到上一章）",
    readerShortcutsDescVertical: "单页滚动模式下小步滚动",
    readerShortcutsDescBookmark: "添加当前书签",
    readerShortcutsDescSidebar: "显示/隐藏左侧栏",
    readerShortcutsDescHelp: "打开快捷键帮助",
    readerShortcutsDescDebug: "切换分页调试面板",
    readerShortcutsDescEsc: "关闭快捷键帮助浮层",
    readerRecentEmpty: "还没有最近阅读记录",
    readerRecentChapterItem: "{name} · 第 {chapter} 章",
    readerStatsMode: "模式",
    readerStatsModeBookDouble: "书本双页",
    readerStatsModeBookSingle: "书本单页",
    readerStatsModeScroll: "单页滚动",
    readerStatsChapter: "章节",
    readerStatsPageProgress: "页进度",
    readerStatsChapterChars: "本章字数",
    readerStatsTotalChars: "全书字数",
    readerStatsBookmarkCount: "书签数",
    readerCharsUnit: "{count} 字",
    readerLibraryEmpty: "暂无已保存书籍",
    readerLibraryItem: "{name} · {count}章",
    readerBookmarksEmpty: "当前书籍还没有书签",
    readerDelete: "删除",
    readerHintBottomNextChapter: "已到底，按空格切下一章",
    readerHintTopPrevChapter: "已到顶，按 Shift+空格回上一章",
    readerHintNextChapter: "切换到下一章",
    readerHintPrevChapter: "切换到上一章",
    readerCurrentPageEmpty: "当前页没有内容",
    readerChapterEnd: "已经到本章末尾",
    readerBackupExported: "已导出 {books} 本书、{progress} 条进度、{bookmarks} 个书签",
    readerBackupImported: "已恢复 {books} 本书、{progress} 条进度、{bookmarks} 个书签",
    readerBackupImportFailed: "恢复备份失败",
    readerResetTitle: "重置数据",
    readerResetTargetSettings: "阅读设置",
    readerResetTargetProgress: "阅读进度",
    readerResetTargetBookmarks: "书签",
    readerResetTargetBooks: "已导入书籍",
    readerResetAction: "重置已选项",
    readerResetConfirm: "确认重置：{targets}？该操作不可撤销。",
    readerResetNothingSelected: "请至少选择一个重置项",
    readerResetDone: "重置完成：{targets}",
    readerResetFailed: "重置失败",
    readerLanguageLabel: "语言",
    readerLanguageZh: "简体中文",
    readerLanguageEn: "English",
    readerManageButton: "管理",
    readerManageTitle: "阅读管理",
    readerManageShowStats: "显示统计信息",
    readerCloudBackup: "云备份",
    readerCloudConnect: "连接 Gist",
    readerCloudSync: "同步",
    readerCloudBackups: "云备份列表",
    readerCloudStatusHint: "填写你自己的 Gist ID 和 Token，备份会写入你的 Gist。",
    readerCloudGistId: "Gist ID",
    readerCloudGistIdPlaceholder: "例如：a1b2c3d4...",
    readerCloudToken: "Token",
    readerCloudTokenPlaceholder: "GitHub Personal Access Token",
    readerCloudToggleTokenShow: "显示",
    readerCloudToggleTokenHide: "隐藏",
    readerCloudTokenRequirement: "Token 需要具备 Gist 写入权限（经典 token 选 gist，或细粒度 token 授予 gist 访问）。",
    readerCloudNeedConfig: "请填写 Gist ID 和 Token，再点击“连接 Gist”",
    readerCloudConnecting: "正在连接 {provider}...",
    readerCloudConnected: "{provider} 连接成功，备份将写入你的 Gist",
    readerCloudSyncing: "正在同步到云端...",
    readerCloudSynced: "云端备份已更新",
    readerCloudSyncFailed: "同步失败：{message}",
    readerCloudConnectFailed: "连接失败：{message}",
    readerCloudSyncFailedShort: "同步失败",
    readerCloudConnectFailedShort: "连接失败",
    readerCloudDeleteConfirm: "确认删除这条云备份吗？此操作不可撤销。",
    readerCloudDeleting: "正在删除云端备份...",
    readerCloudDeleted: "云端备份已删除",
    readerCloudDeleteFailed: "删除失败",
    readerCloudRestoring: "正在从云端恢复备份...",
    readerCloudRestoreFailed: "云端恢复失败",
    readerCloudRestoreDone: "恢复完成：{books} 本书、{progress} 条进度、{bookmarks} 个书签",
    readerCloudBackupEmpty: "暂无云端备份",
    readerCloudBackupUnnamed: "未命名备份",
    readerCloudQuota: "云空间：{used} / {total}",
    readerCloudRestore: "恢复",
    readerCloudDelete: "删除",
    readerSyncFallbackLocalOnly: "{provider} 同步不可用，已仅使用本地存储。",
    readerBookmarkLabel: "{chapter} · 第 {page} 页组",
    readerInitFailed: "初始化失败，请查看控制台错误。",
    readerUnknownTime: "未知时间",
    readerCloudProviderFallback: "云服务"
  }
};

function resolveLocale() {
  const uiLanguage = globalThis.chrome?.i18n?.getUILanguage?.() || globalThis.navigator?.language || LOCALE_EN;
  return uiLanguage.toLowerCase().startsWith("zh") ? LOCALE_ZH : LOCALE_EN;
}

function isSupportedLocale(locale) {
  return locale === LOCALE_ZH || locale === LOCALE_EN;
}

let currentLocale = resolveLocale();

export function getSupportedLocales() {
  return [LOCALE_ZH, LOCALE_EN];
}

export async function initializeI18n() {
  if (!globalThis.chrome?.storage?.local) {
    return currentLocale;
  }

  const savedLocale = await new Promise((resolve) => {
    chrome.storage.local.get([LOCALE_STORAGE_KEY], (result) => {
      resolve(result[LOCALE_STORAGE_KEY]);
    });
  });

  if (isSupportedLocale(savedLocale)) {
    currentLocale = savedLocale;
  }

  return currentLocale;
}

export async function setLocale(locale) {
  if (!isSupportedLocale(locale)) {
    return currentLocale;
  }

  currentLocale = locale;
  if (globalThis.chrome?.storage?.local) {
    await new Promise((resolve) => {
      chrome.storage.local.set({ [LOCALE_STORAGE_KEY]: locale }, () => resolve());
    });
  }
  return currentLocale;
}

export function getCurrentLocale() {
  return currentLocale;
}

export function getDocumentLanguage() {
  return currentLocale === LOCALE_ZH ? "zh-CN" : "en";
}

export function t(key, substitutions = {}) {
  const message = MESSAGES[currentLocale]?.[key] ?? MESSAGES[LOCALE_EN][key] ?? key;
  return message.replace(/\{(\w+)\}/g, (_, name) => String(substitutions[name] ?? `{${name}}`));
}

export function applyI18n(root = document) {
  document.documentElement.lang = getDocumentLanguage();

  for (const element of root.querySelectorAll("[data-i18n]")) {
    const key = element.getAttribute("data-i18n");
    if (key) {
      element.textContent = t(key);
    }
  }

  for (const element of root.querySelectorAll("[data-i18n-attr]")) {
    const descriptors = element.getAttribute("data-i18n-attr")?.split(";") || [];
    for (const descriptor of descriptors) {
      const [attribute, key] = descriptor.split(":").map((item) => item.trim());
      if (attribute && key) {
        element.setAttribute(attribute, t(key));
      }
    }
  }
}
