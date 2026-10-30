# 商店素材草案（可直接粘贴）

## 基础信息

- 扩展名称：Xyfy TXT Reader
- 类别建议：Books / Productivity
- 语言：中文（可同时提供英文）
- 隐私政策（GitHub Pages）：https://xyfy.github.io/Xyfy.TxtReader/privacy-policy.html
- 隐私政策（备用直链）：https://raw.githubusercontent.com/xyfy/Xyfy.TxtReader/main/privacy-policy.html

## 简短描述（80-132 字符可裁剪）

本地 TXT 小说阅读器，支持章节识别、书本双页与滚动阅读、沉浸模式、书签、进度同步与备份恢复，可自定义快捷键、主题配色与字体。

## 详细描述（中文版）

Xyfy TXT Reader 是一个面向本地 TXT 文件的浏览器阅读扩展。你可以导入小说文本，自动识别章节目录，并在书本双页模式与单页滚动模式之间自由切换。

核心能力：

- 自动章节解析，快速跳转
- DOM 实测分页，双页阅读更接近纸书体验
- 单页滚动与整屏/小步滚动
- 沉浸模式，减少视觉干扰
- 书签与最近阅读记录
- 轻量阅读进度同步（chrome.storage.sync）
- JSON 备份导出与导入恢复
- 可选 Gist 云备份（写入用户自己的 GitHub Gist）
- 自定义快捷键：逐项重绑，冲突键位实时拦截，可一键恢复默认
- 自定义模板颜色：主题可选“自定义”，分别调整背景、纸面、正文、次要、强调、强强调 6 个颜色
- 自定义字体：预设之外可填写任意字体栈，实时预览，非法值自动回退
- 编码自动识别：UTF-8 / UTF-16 / GB18030 / Big5 自动探测，识别不了时可手动选编码重导入
- 无目录书也能读：通篇没有章节标记的书按段落平铺，不切断段落
- 大文件稳定：分页分批生成，恢复阅读进度到深处不卡界面
- 首次引导：首次安装走三步引导，按窗口大小和触屏状态推荐合适的字号与版式
- 阅读统计：按天记录阅读时长与字数，给出阅读速度、本章剩余时长和连续阅读天数
- 三档场景模式：日间 / 夜间 / 护眼一键切换，手调后自动取消高亮
- 批量导入：多选文件或直接拖入窗口，非 TXT、空文件、超大文件逐条给出原因，最近导入可一键重开
- 多设备同步冲突：两侧短时间改过不同内容时给出冲突条，可保留一侧或逐项取较新
- 无障碍：支持键盘完整操作、可见焦点环、浮层焦点陷阱、页码朗读，三套预设主题对比度达 WCAG AA

隐私与数据：

- 可选的匿名错误上报默认关闭，开启后仅上报版本、平台与匿名错误栈

- 正文和主要阅读数据默认保存在本地浏览器存储
- 不上传用户 TXT 正文到开发者服务器
- 云备份启用后，备份写入用户自己的 GitHub Gist，不占用开发者存储
- 权限用于阅读数据保存（storage）；Gist 访问通过用户自填 Token 完成

## Detailed Description (English)

Xyfy TXT Reader is a browser extension for reading local TXT novels. It auto-detects chapters and provides both a two-page book layout and a smooth scrolling mode.

Key features:

- Automatic chapter parsing and navigation
- Real DOM pagination for book-like reading
- Scroll mode with page-step and line-step controls
- Immersive reading mode
- Bookmarks and recent reading history
- Lightweight progress/settings sync via chrome.storage.sync
- JSON backup export and restore
- Optional Gist backup stored in the user's own GitHub Gist
- Custom keyboard shortcuts with conflict detection and one-click reset
- Custom theme colors: adjust background, surface, text, muted, accent and strong accent
- Custom font stack with live preview and safe fallback
- Automatic encoding detection for UTF-8 / UTF-16 / GB18030 / Big5, with manual override when detection fails
- Books without chapter markers are laid out flat along paragraph boundaries, never cutting a paragraph in half
- Stable large-file pagination: pages are generated in batches, so resuming deep into a big file stays responsive
- First-run onboarding with device-aware defaults for font size, line height and pages per view
- Reading stats: daily duration and character counts, reading speed, chapter time left, and reading streak
- Three scene presets (day / night / eye-care) with one-tap switching and auto-unhighlight after manual tweaks
- Batch import by multi-select or drag-and-drop, with per-file rejection reasons and a recent-files list
- Sync conflict banner when two devices change different settings within minutes; keep either side or merge field by field
- Accessibility: full keyboard operation, visible focus ring, dialog focus trap, page-number announcements, and WCAG AA contrast in all preset themes

Privacy and data handling:

- Main content and reading data stay in local browser storage
- No TXT body upload to developer servers
- Optional anonymous error reporting is off by default; when enabled it sends only version, platform and an anonymised stack
- If cloud backup is enabled, backups are stored in the user's own GitHub Gist, not developer storage
- Permissions are used for local data storage; Gist access uses a user-provided token

## 更新日志模板

版本 0.7.0

- 新增：首次安装三步引导（导入 → 阅读 → 备份），并按窗口大小与触屏状态推荐字号、行高、每屏页数，已调过版式的用户不会被覆盖
- 新增：阅读统计细化，按天累计阅读时长与字数，显示阅读速度、本章剩余时长与连续阅读天数
- 新增：三档场景模式（日间 / 夜间 / 护眼），一键切换主题、字号与行高；手动微调后取消高亮，自定义配色切场景前先确认
- 新增：批量导入与拖拽投放，逐条给出拒绝原因（非 TXT / 空文件 / 超过 20 MB），队列串行且单个失败不中断，最近导入保留 8 条
- 新增：多设备同步冲突提示，可选保留本地 / 保留云端 / 逐字段取较新，键位映射按动作合并而非整片覆盖
- 新增：无障碍支持，跳转到正文链接、全局可见焦点环、浮层焦点陷阱、页码朗读，三套预设主题对比度全部达 WCAG AA
- 修复：护眼主题次要文字对比度仅 4.42:1，未达 AA 标准，已调整为 4.82:1
- 优化：`Esc` 优先关闭最上层浮层，关闭后焦点回到打开它的元素

版本 0.6.0

- 新增：编码自动识别与防乱码，支持 UTF-8 / UTF-16 / GB18030 / Big5，识别不了时可手动选编码重导入
- 新增：没有章节标记的书自动按段落平铺阅读，并提示未识别到章节
- 新增：加载中 / 空 / 错误 / 阅读中四种状态各有明确界面，导入失败不再一片空白，给出原因与重试
- 新增：可选的匿名错误上报开关（默认关闭），开启后仅上报版本、平台与匿名错误栈，不含正文与任何个人信息
- 优化：大文件分页改为分批生成，恢复阅读进度到深处不再卡住界面
- 修复：翻页到未生成区域时偶发空白页
- 修复：无目录书平铺时把段落切成两半
- 修复：导入损坏文件时会静默失败，界面停在上一本书

版本 0.5.0

- 优化：设置面板改为分区结构，标题与快捷导航吸顶常驻，一键跳转到通用 / 备份 / 字体 / 配色 / 按键 / 云备份
- 优化：快捷键列表改为两列（窄屏回落单列），云备份配置默认收起，需要时再展开
- 修复：非自定义主题下取色器不再显示为一片灰，改为显示当前主题的真实配色
- 修复：设置面板内输入框与提示框被内边距撑出卡片边缘
- 优化：阅读器主文件按职责拆分（配色计算、设置面板独立成模块），后续维护成本更低

版本 0.4.1

- 调整：方括号键位方向修正，`[` 为上一章、`]` 为下一章，与方向键语义一致
- 优化：移除向所有网站暴露内部文件的声明，缩小权限面
- 修复：键盘映射测试未纳入测试链，长期未被 CI 执行

版本 0.4.0

- 新增：自定义快捷键，支持逐项重绑、冲突拦截与一键恢复默认
- 新增：自定义模板颜色，主题新增“自定义”，可调整 6 个颜色并给出对比度提示
- 新增：自定义字体，支持任意字体栈、实时预览与非法值回退
- 修复：深色配色下外层背景、侧栏、下拉框仍为浅色导致文字不可读
- 修复：自定义配色下边框与纸影无法表达透明度

---

## 上架提交清单（逐项勾选）

提交前按从上到下顺序检查，打勾后再提交。

---

### 一、代码与包

- [ ] `manifest.json` 版本号已递增（与上次发布不同）
- [ ] `npm test` 通过，无失败用例
- [ ] `npm run build:zip` 生成最新 ZIP
- [ ] ZIP 解压后 `manifest.json` 在根目录（非子目录）
- [ ] ZIP 内不含开发/测试文件（tests、docs、.git、node_modules、dist）
- [ ] ZIP 文件大小 < 10 MB（Chrome 商店上限）

---

### 二、图标素材

| 规格 | 用途 | 格式要求 | 已准备 |
|------|------|----------|--------|
| 16 × 16 px | 浏览器工具栏小图 | PNG，不透明或透明均可 | [ ] |
| 32 × 32 px | Windows 高 DPI 工具栏 | PNG | [ ] |
| 48 × 48 px | 扩展管理页面列表 | PNG | [ ] |
| 128 × 128 px | Chrome/Edge 商店详情页主图 | PNG，**必填** | [ ] |

> Chrome Web Store 只强制要求 128 × 128；建议四个尺寸全部提供以避免模糊。

---

### 三、商店截图

建议分辨率：**1280 × 800** 或 **1440 × 900**；Chrome 商店至少提供 1 张，建议 3–5 张。

| 编号 | 内容 | 拍摄要点 | 已准备 |
|------|------|----------|--------|
| 截图 1 | 导入页 | 展示 TXT 导入入口、文件选择按钮 | [ ] |
| 截图 2 | 书本双页模式 | 展示双栏排版与翻页效果 | [ ] |
| 截图 3 | 滚动阅读模式 | 展示单列滚动与进度条 | [ ] |
| 截图 4 | 章节目录 / 侧栏 | 展示章节列表与书签入口 | [ ] |
| 截图 5 | 沉浸模式或设置面板 | 展示字体、主题、行距可调 | [ ] |

格式要求：PNG 或 JPG，宽度不低于 1280 px，文件大小 < 2 MB/张。

---

### 四、宣传图（可选，提升曝光效果）

| 规格 | 用途（Chrome Web Store） | 已准备 |
|------|--------------------------|--------|
| 440 × 280 px | 商店搜索结果卡片小图 | [ ] |
| 920 × 680 px | 商店详情页顶部大图 | [ ] |
| 1400 × 560 px | 特色推广横幅（Featured 位置） | [ ] |

> Edge Add-ons 使用类似规格，以实际后台为准。宣传图全部可选，不影响审核通过。

---

### 五、文案与链接

- [ ] 扩展名称（≤ 45 字符）：`Xyfy TXT Reader`
- [ ] 简短描述（≤ 132 字符）已填写
- [ ] 详细描述（中英文）已填写
- [ ] 分类已选择（Books / Productivity）
- [ ] 隐私政策链接已填写：`https://xyfy.github.io/Xyfy.TxtReader/privacy-policy.html`
- [ ] 数据使用声明已勾选正确选项：不收集用户数据 / 仅本地存储
- [ ] 更新日志已填写（当前版本改动描述）

---

### 六、Chrome Web Store 专项

- [ ] 已关联 Google 开发者账号（一次性注册费 $5）
- [ ] 已在 Developer Dashboard 完成开发者信息
- [ ] 已提交"单一用途"说明（Single Purpose Description）
- [ ] 权限理由已填写（`storage` 用于阅读数据保存；访问 GitHub API 用于用户自有 Gist 云备份）
- [ ] 审核通过后状态变为 "Published"

---

### 七、Edge Add-ons 专项

- [ ] 已在 Partner Center 完成发布者认证
- [ ] 已上传与 Chrome 相同的 ZIP（MV3 兼容，无需修改）
- [ ] 已填写 Availability（目标市场）
- [ ] 审核通过（Edge 通常 1–3 个工作日）

---

### 八、发布后验收

- [ ] 在 Chrome 中从商店安装，功能全部正常
- [ ] 在 Edge 中从商店安装，功能全部正常
- [ ] 章节解析、书签、进度读取无异常
- [ ] 隐私政策页面可正常访问
- [ ] 版本号与商店显示一致
