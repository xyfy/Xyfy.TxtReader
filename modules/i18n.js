const LOCALE_ZH = "zh_CN";
const LOCALE_EN = "en";
const LOCALE_STORAGE_KEY = "uiLocale";

function readLocaleFromWebStorage() {
  try {
    return globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function writeLocaleToWebStorage(locale) {
  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore storage write failures in restricted browser contexts.
  }
}

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
    // FR-M4 边界四态
    readerStateLoading: "Importing and parsing the file…",
    readerStateEmpty: "No book imported yet",
    readerStateImport: "Import a TXT file",
    readerStateRetry: "Retry",
    readerErrorEncoding: "Cannot detect the file encoding. Pick one manually and try again.",
    readerErrorEmptyFile: "The file is empty or has no readable text",
    readerErrorReadFailed: "Failed to read the file",
    readerErrorParseFailed: "Failed to parse the file",
    readerErrorUnknown: "Import failed",
    // FR-M3 无目录书平铺提示
    readerFlatBookHint: "No chapter markers found — showing the book as one continuous text",
    // FR-C3 可选错误上报开关
    readerErrorReporting: "Anonymous error reporting (off by default)",
    readerErrorReportingHint:
      "When enabled, only the app version, platform, and an anonymized stack are sent — never book text, Gist tokens, or any personal information.",
    readerStateEncodingLabel: "Encoding",
    readerStateEncodingApply: "Re-import with this encoding",
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
    readerThemeCustom: "Custom",
    chkUseCustomFont: "Use custom font",
    readerFontCustomPlaceholder: 'e.g. "LXGW WenKai", serif',
    lblFontPreview: "Preview: The quick brown fox · 窗含西岭千秋雪 ABC 123",
    sectionCustomFont: "Custom Font",
    sectionTemplateColor: "Template Color",
    templateColorHint: "Pick “Custom” theme to adjust colors (empty falls back to preset).",
    lblBgColor: "Background",
    lblSurfaceColor: "Surface",
    lblTextColor: "Text",
    lblMutedColor: "Muted",
    lblAccentColor: "Accent",
    lblAccentStrong: "Strong Accent",
    warnContrastLow: "Low contrast between text and background may reduce readability.",
    btnResetColors: "Reset colors",
    btnSwitchToCustom: "Switch to custom theme",
    warnColorLocked: "The current theme is not \"Custom\", so these colors can't be edited.",
    sectionShortcuts: "Keyboard Shortcuts",
    navSettingsAria: "Settings sections",
    navGeneral: "General",
    navBackup: "Backup",
    navFont: "Font",
    navColor: "Colors",
    navShortcuts: "Keys",
    navCloud: "Cloud",
    cloudExpand: "Expand",
    cloudCollapse: "Collapse",
    actRebindingHint: "Click “Rebind” then press the new key combo; Esc cancels. Tab/Space/Arrows are allowed but will warn about system semantics.",
    btnResetKeys: "Restore defaults",
    actCloseShortcuts: "Close overlays (Esc)",
    actOpenShortcuts: "Open shortcuts help",
    actToggleDebug: "Toggle debug panel",
    actTogglePanel: "Toggle sidebar",
    actBookmark: "Add bookmark",
    actScrollLineUp: "Scroll up (scroll mode)",
    actScrollLineDown: "Scroll down (scroll mode)",
    actPrevPage: "Previous page",
    actNextPage: "Next page",
    actPrevChapter: "Previous chapter",
    actNextChapter: "Next chapter",
    actRebind: "Rebind",
    warnKeyConflict: "This key is already used by {action}.",
    shortcutRebindHint: "Click, then press a new key. Only the new key will be kept for this action.",
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
    readerCloseCurrentBook: "Close current book",
    readerCloseCurrentBookConfirm: "Close the current book? You can reopen it from the library.",
    readerCloseCurrentBookDone: "Current book closed",
    readerCloseCurrentBookNoActive: "No book is currently open",
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
    readerCloudNeedPermission: "Click Connect Gist to grant GitHub API access.",
    readerCloudPermissionDenied: "GitHub API access is required for cloud backup. Please grant permission and try again.",
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
    readerCloudProviderFallback: "Cloud Service",

    // v0.7 FR-S1 首次引导
    onboardingTitle: "Welcome to Xyfy TXT Reader",
    onboardingSkip: "Skip",
    onboardingNext: "Next",
    onboardingStart: "Start reading",
    onboardingProgress: "Step {current} of {total}",
    onboardingImportTitle: "Drop in a TXT file",
    onboardingImportBody:
      "Pick a local TXT novel, or drag it into the window. Chapters are detected automatically, so you can jump around right away.",
    onboardingReadTitle: "Read the way you like",
    onboardingReadBody:
      "Switch between two-page book mode and single-page scrolling, then tune font size, line height and theme. Day, night and eye-care presets are one click away.",
    onboardingBackupTitle: "Your progress is saved",
    onboardingBackupBody:
      "Reading progress, bookmarks and settings stay on this device. You can also export a JSON backup or sync through your own Gist.",

    // v0.7 FR-S2 阅读统计
    statsToday: "Today",
    statsTodayHint: "Reading time today, idle gaps over 2 minutes are excluded",
    statsSpeed: "Reading speed",
    statsSpeedUnit: "{value} chars/min",
    statsRemaining: "Time left in chapter",
    statsStreak: "Reading streak",
    statsStreakUnit: "{days} days",
    statsEmpty: "No reading data yet",
    statsDurationHour: "{hours} h {minutes} min",
    statsDurationMinute: "{minutes} min",
    statsDurationSecond: "{seconds} s",

    // v0.7 FR-C2 场景模式
    sceneLabel: "Scene",
    sceneDay: "Day",
    sceneNight: "Night",
    sceneEyeCare: "Eye care",
    sceneCustomPaletteConfirm: "Switching scene will discard your custom colors. Continue?",

    // v0.7 FR-C1 批量导入
    importDropHint: "Drop TXT files to import",
    importRecentFiles: "Recently imported",
    importRejectTitle: "Skipped files",
    importRejectNotTxt: "{name} is not a TXT file",
    importRejectEmpty: "{name} is empty",
    importRejectTooLarge: "{name} is larger than 20 MB",
    importRejectDuplicate: "{name} is already in this batch",
    importRejectDuplicateRecent: "{name} is already in your library",
    importRejectMore: "+{count} more",
    importReopened: "{name} is already open",
    importBatchProgress: "Importing {current} / {total}",
    importBatchDone: "Imported {count} files",
    importBatchPartial: "{ok} imported, {failed} failed",

    // v0.7 FR-S3 同步冲突
    conflictTitle: "Settings changed on another device",
    conflictDetail: "Both devices changed different settings within 5 minutes.",
    conflictKeepLocal: "Keep this device",
    conflictKeepRemote: "Keep cloud",
    conflictMerge: "Merge both",
    conflictResolved: "Conflict resolved",
    // v0.8 L-02：sync 配额与同步状态
    syncStateLabel: "Sync status",
    syncStateOkTitle: "Synced",
    syncStateDegradedTitle: "Synced (simplified)",
    syncStateFailedTitle: "Not synced",
    syncStateDegradedDetail: "Some custom colors or shortcuts were not uploaded to keep within the browser sync limit. They are still saved on this device.",
    syncStateItemTooLarge: "Settings are too large for a single sync item (limit 8 KB).",
    syncStateTotalTooLarge: "Total sync data exceeds the browser limit (100 KB).",
    syncStateUsage: "Usage",
    syncStateDropThemeColors: "Custom colors kept local only",
    syncStateDropKeybindings: "Custom shortcuts kept local only",
    syncStateDropCustomFont: "Custom font kept local only",
    fieldTheme: "Theme",
    fieldThemeColors: "Colors",
    fieldFontFamily: "Font",
    fieldCustomFont: "Custom font",
    fieldFontSize: "Font size",
    fieldLineHeight: "Line height",
    fieldReadingMode: "Reading mode",
    fieldAnimationStyle: "Animation",
    fieldAnimationIntensity: "Animation intensity",
    fieldShowStats: "Stats panel",
    fieldKeybindings: "Shortcuts",

    // v0.7 FR-S4 无障碍
    a11ySkipToContent: "Skip to content",
    a11ySection: "Accessibility",
    a11yContrastOk: "All color pairs meet WCAG AA",
    a11yContrastWarn: "{count} color pairs below WCAG AA",
    a11yContrastRatio: "Lowest contrast {ratio}:1",
    a11yContrastUnknown: "Calculating…",
    a11yFocusHint: "Press Tab to move focus, Esc to close",
    a11yPageAnnounce: "Page {page} of {total}"
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
    // FR-M4 边界四态
    readerStateLoading: "正在导入并解析文件…",
    readerStateEmpty: "还没有导入任何书籍",
    readerStateImport: "导入 TXT 文件",
    readerStateRetry: "重试",
    readerErrorEncoding: "无法识别文件编码，请手动选择编码后重试",
    readerErrorEmptyFile: "文件为空或不含可读内容",
    readerErrorReadFailed: "文件读取失败",
    readerErrorParseFailed: "文件解析失败",
    readerErrorUnknown: "导入失败",
    // FR-M3 无目录书平铺提示
    readerFlatBookHint: "未识别到章节标记，已按整本平铺阅读",
    // FR-C3 可选错误上报开关
    readerErrorReporting: "匿名错误上报（默认关闭）",
    readerErrorReportingHint:
      "开启后仅上报版本、平台与匿名错误栈，不含正文、Gist Token 或任何个人信息。",
    readerStateEncodingLabel: "编码",
    readerStateEncodingApply: "用此编码重新导入",
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
    readerThemeCustom: "自定义",
    chkUseCustomFont: "使用自定义字体",
    readerFontCustomPlaceholder: "例如：\"LXGW WenKai\", serif",
    lblFontPreview: "预览：窗含西岭千秋雪 · 门泊东吴万里船 ABC 123",
    sectionCustomFont: "自定义字体",
    sectionTemplateColor: "模板颜色",
    templateColorHint: "选择“自定义”主题后即可调整下列颜色（留空则沿用对应预设）。",
    lblBgColor: "背景",
    lblSurfaceColor: "纸面",
    lblTextColor: "正文",
    lblMutedColor: "次要",
    lblAccentColor: "强调",
    lblAccentStrong: "强强调",
    warnContrastLow: "文字与背景对比度偏低，可能影响阅读清晰度。",
    btnResetColors: "重置颜色",
    btnSwitchToCustom: "切换为自定义主题",
    warnColorLocked: "当前主题不是“自定义”，颜色不可调整。",
    sectionShortcuts: "快捷键",
    navSettingsAria: "设置分区导航",
    navGeneral: "通用",
    navBackup: "备份",
    navFont: "字体",
    navColor: "配色",
    navShortcuts: "按键",
    navCloud: "云备份",
    cloudExpand: "展开",
    cloudCollapse: "收起",
    actRebindingHint: "点击「重新绑定」后按下新组合键；按 Esc 取消。Tab / Space / 方向键允许但会提示系统语义。",
    btnResetKeys: "恢复默认",
    actCloseShortcuts: "关闭浮层（Esc）",
    actOpenShortcuts: "打开快捷键帮助",
    actToggleDebug: "切换调试面板",
    actTogglePanel: "显示/隐藏侧栏",
    actBookmark: "添加书签",
    actScrollLineUp: "上滚（滚动模式）",
    actScrollLineDown: "下滚（滚动模式）",
    actPrevPage: "上一页",
    actNextPage: "下一页",
    actPrevChapter: "上一章",
    actNextChapter: "下一章",
    actRebind: "重新绑定",
    warnKeyConflict: "该按键已被 {action} 占用。",
    shortcutRebindHint: "点击后按下新键位，该动作将只保留新键位。",
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
    readerCloseCurrentBook: "关闭当前书籍",
    readerCloseCurrentBookConfirm: "确认关闭当前书籍？你可以在书架中重新打开。",
    readerCloseCurrentBookDone: "已关闭当前书籍",
    readerCloseCurrentBookNoActive: "当前没有打开的书籍",
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
    readerCloudNeedPermission: "请点击“连接 Gist”以授权访问 GitHub API。",
    readerCloudPermissionDenied: "云备份需要 GitHub API 主机权限，请授权后重试。",
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
    readerCloudProviderFallback: "云服务",

    // v0.7 FR-S1 首次引导
    onboardingTitle: "欢迎使用 Xyfy TXT Reader",
    onboardingSkip: "跳过",
    onboardingNext: "下一步",
    onboardingStart: "开始阅读",
    onboardingProgress: "第 {current} 步，共 {total} 步",
    onboardingImportTitle: "把 TXT 拖进来",
    onboardingImportBody:
      "选择本地 TXT 小说，或直接拖进窗口。章节会自动识别，导入后即可按目录跳转。",
    onboardingReadTitle: "按你的习惯阅读",
    onboardingReadBody:
      "书本双页与单页滚动随时切换，字号、行高与主题都能调。日间、夜间、护眼三套预设一键可得。",
    onboardingBackupTitle: "进度会留在本机",
    onboardingBackupBody:
      "阅读进度、书签与设置都存在本机。你也可以导出 JSON 备份，或用你自己的 Gist 做云备份。",

    // v0.7 FR-S2 阅读统计
    statsToday: "今日阅读",
    statsTodayHint: "今天的阅读时长，超过 2 分钟无操作不计入",
    statsSpeed: "阅读速度",
    statsSpeedUnit: "{value} 字/分",
    statsRemaining: "本章剩余",
    statsStreak: "连续阅读",
    statsStreakUnit: "{days} 天",
    statsEmpty: "暂无阅读数据",
    statsDurationHour: "{hours} 小时 {minutes} 分",
    statsDurationMinute: "{minutes} 分钟",
    statsDurationSecond: "{seconds} 秒",

    // v0.7 FR-C2 场景模式
    sceneLabel: "场景",
    sceneDay: "日间",
    sceneNight: "夜间",
    sceneEyeCare: "护眼",
    sceneCustomPaletteConfirm: "切换场景会清空你的自定义配色，继续吗？",

    // v0.7 FR-C1 批量导入
    importDropHint: "松开即可导入 TXT",
    importRecentFiles: "最近导入",
    importRejectTitle: "已跳过文件",
    importRejectNotTxt: "{name} 不是 TXT 文件",
    importRejectEmpty: "{name} 是空文件",
    importRejectTooLarge: "{name} 超过 20 MB",
    importRejectDuplicate: "{name} 在本批次里重复",
    importRejectDuplicateRecent: "{name} 已在书库中",
    importRejectMore: "另有 {count} 个文件被跳过",
    importReopened: "已打开 {name}",
    importBatchProgress: "正在导入 {current} / {total}",
    importBatchDone: "已导入 {count} 个文件",
    importBatchPartial: "{ok} 个成功，{failed} 个失败",

    // v0.7 FR-S3 同步冲突
    conflictTitle: "另一台设备修改了设置",
    conflictDetail: "两台设备在 5 分钟内各自改动了不同设置。",
    conflictKeepLocal: "保留本机",
    conflictKeepRemote: "保留云端",
    conflictMerge: "两者合并",
    conflictResolved: "冲突已解决",
    // v0.8 L-02：sync 配额与同步状态
    syncStateLabel: "同步状态",
    syncStateOkTitle: "已同步",
    syncStateDegradedTitle: "已同步（精简模式）",
    syncStateFailedTitle: "未同步",
    syncStateDegradedDetail: "为控制在浏览器同步配额内，部分自定义配色或快捷键未上传。它们仍保存在本机。",
    syncStateItemTooLarge: "设置体积超过单条同步上限（8 KB）。",
    syncStateTotalTooLarge: "同步数据总量超过浏览器上限（100 KB）。",
    syncStateUsage: "已用容量",
    syncStateDropThemeColors: "自定义配色仅保存在本机",
    syncStateDropKeybindings: "自定义快捷键仅保存在本机",
    syncStateDropCustomFont: "自定义字体仅保存在本机",
    fieldTheme: "主题",
    fieldThemeColors: "配色",
    fieldFontFamily: "字体",
    fieldCustomFont: "自定义字体",
    fieldFontSize: "字号",
    fieldLineHeight: "行高",
    fieldReadingMode: "阅读模式",
    fieldAnimationStyle: "动画",
    fieldAnimationIntensity: "动画强度",
    fieldShowStats: "统计面板",
    fieldKeybindings: "快捷键",

    // v0.7 FR-S4 无障碍
    a11ySkipToContent: "跳到正文",
    a11ySection: "无障碍",
    a11yContrastOk: "所有配色均达 WCAG AA",
    a11yContrastWarn: "{count} 处配色未达 WCAG AA",
    a11yContrastRatio: "最低对比度 {ratio}:1",
    a11yContrastUnknown: "计算中…",
    a11yFocusHint: "按 Tab 移动焦点，Esc 关闭",
    a11yPageAnnounce: "第 {page} 页，共 {total} 页"
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
    const savedLocale = readLocaleFromWebStorage();
    if (isSupportedLocale(savedLocale)) {
      currentLocale = savedLocale;
    }
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
  } else {
    writeLocaleToWebStorage(locale);
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
