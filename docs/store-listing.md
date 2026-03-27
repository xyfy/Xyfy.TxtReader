# 商店素材草案（可直接粘贴）

## 基础信息

- 扩展名称：Xyfy TXT Reader
- 类别建议：Books / Productivity
- 语言：中文（可同时提供英文）
- 隐私政策（GitHub Pages）：https://xyfy.github.io/Xyfy.TxtReader/privacy-policy.html
- 隐私政策（备用直链）：https://raw.githubusercontent.com/xyfy/Xyfy.TxtReader/main/privacy-policy.html

## 简短描述（80-132 字符可裁剪）

本地 TXT 小说阅读器，支持章节识别、书本双页与滚动阅读、沉浸模式、书签、阅读进度同步与备份恢复。

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

隐私与数据：

- 正文和主要阅读数据默认保存在本地浏览器存储
- 不上传用户 TXT 正文到开发者服务器
- 仅使用 storage 权限用于保存必要阅读数据

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

Privacy and data handling:

- Main content and reading data stay in local browser storage
- No TXT body upload to developer servers
- Only storage permission is used for reading-related data

## 更新日志模板

版本 0.2.0

- 新增：本地备份导入导出
- 新增：轻量阅读进度同步
- 优化：大章节分页性能与缓存
- 修复：章节边界翻页行为

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
- [ ] 权限理由已填写（`storage` 用于保存阅读进度与设置）
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
