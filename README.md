# Xyfy.TxtReader

Chrome 和 Edge 可用的 TXT 小说阅读扩展，面向本地小说阅读场景，重点提供书本式双页、单页滚动、沉浸阅读和本地数据迁移能力。

## 插件信息

- 名称：Xyfy TXT Reader
- 版本：0.3.0
- 形态：Manifest V3 扩展
- 平台：Chrome / Edge
- 数据策略：正文保存在 IndexedDB，轻量设置与进度可镜像到 `chrome.storage.sync`

## 当前功能

- 本地 TXT 导入，自动识别章节目录
- DOM 实测分页，双页书本模式与自适应单页降级
- 单页滚动模式，支持整屏滚动与小步滚动
- 页面内沉浸模式，隐藏侧栏与控制区专注阅读
- 左右方向键切换章节，空格/Shift+空格翻页
- 书签、最近阅读列表、阅读统计面板
- 快捷键帮助浮层
- JSON 备份导出 / 导入恢复
- `chrome.storage.sync` 轻量同步设置与阅读进度
- 云备份（用户自填 Gist ID + Token）
- 大章节增量分页、章节分页缓存、空闲时后台预热

## 本地运行

1. 打开 Chrome 或 Edge 的扩展管理页面。
2. 启用开发者模式。
3. 选择“加载已解压的扩展程序”。
4. 选择当前项目目录。
5. 点击扩展图标，打开阅读器。

### 云备份配置（开发态）

1. 在 GitHub 创建一个用于备份的 Gist。
2. 在 GitHub 生成 Personal Access Token（需包含 Gist 写入权限）。
3. 在阅读器侧栏填写 Gist ID 和 Token，点击“连接 Gist”。

说明：

- 云备份写入用户自己的 Gist，不占用开发者存储。
- Token 仅保存在用户本地浏览器存储，用于访问用户自己的 Gist。

## 打包发布

### 一键打包

1. 安装依赖（如需）：`npm install`
2. 执行测试：`npm test`
3. 生成发布包：`npm run build:zip`

执行后会在 `dist` 目录下生成：

- `xyfy-txt-reader-v<version>.zip`

说明：

- ZIP 根目录就是扩展根目录（`manifest.json` 在压缩包根层级）
- 已自动排除 `tests`、`docs`、`.git`、`node_modules`、`dist`

### 发布前检查清单

- `manifest.json` 里的 `version` 已递增
- 图标与商店截图已准备（建议至少 128x128 图标）
- 权限最小化（当前仅 `storage`）
- 权限最小化（当前仅 `storage`，并访问 `https://api.github.com/*`）
- 已验证升级安装后的阅读进度与设置兼容性
- 隐私政策链接已准备：`https://xyfy.github.io/Xyfy.TxtReader/privacy-policy.html`
- 商店文案素材可直接使用：`docs/store-listing.md`

### GitHub Pages 隐私政策链接启用

1. 推送当前仓库到 GitHub 默认分支（例如 `main`）。
2. 进入仓库 Settings -> Pages。
3. Source 选择 `Deploy from a branch`。
4. Branch 选择 `main`，目录选择 `/ (root)`，保存。
5. 等待 Pages 发布完成后，使用：`https://xyfy.github.io/Xyfy.TxtReader/privacy-policy.html`

### Chrome Web Store 发布

1. 进入 Chrome Web Store Developer Dashboard。
2. 新建扩展并上传 `dist` 下 ZIP。
3. 完成商店信息：描述、截图、分类、隐私政策。
4. 提交审核并发布。
5. 后续更新重复以上流程，仅需先提升版本号。

### Edge Add-ons 发布

1. 进入 Edge Add-ons 开发者中心。
2. 创建扩展并上传同一 ZIP。
3. 补充商店信息并提交审核。

### Firefox AMO 发布（可选）

1. 进入 AMO 开发者后台上传 ZIP。
2. 检查 Manifest V3 API 兼容性并按提示修复。
3. 完成审核后发布。

## 常用快捷键

- `← / →`：切换章节
- `Space`：书本模式下一页；滚动模式下滚一整屏
- `Shift + Space`：书本模式上一页；滚动模式上滚一整屏或回上一章
- `↑ / ↓`：单页滚动模式下小步滚动
- `B`：添加书签
- `Tab`：显示 / 隐藏左侧栏
- `H` 或 `?`：打开快捷键帮助浮层
- `Alt + D`：切换分页调试面板
- `Esc`：关闭快捷键帮助浮层

## 当前目录

- popup: 扩展弹窗
- reader: 阅读器页面与交互逻辑
- background: MV3 service worker
- modules: 核心模块（解析、分页、备份、存储）
- tests: 分页、备份、同步、云备份抽象层测试
- docs: 规划文档
