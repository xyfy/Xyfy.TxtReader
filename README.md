# Xyfy.TxtReader

Chrome 和 Edge 可用的 TXT 小说阅读扩展，面向本地小说阅读场景，重点提供书本式双页、单页滚动、沉浸阅读和本地数据迁移能力。

## 插件信息

- 名称：Xyfy TXT Reader
- 版本：0.6.0
- 形态：Manifest V3 扩展
- 平台：Chrome / Edge
- 数据策略：正文保存在 IndexedDB，轻量设置与进度可镜像到 `chrome.storage.sync`

## 当前功能

- 本地 TXT 导入，自动识别章节目录
- DOM 实测分页，双页书本模式与自适应单页降级
- 单页滚动模式，支持整屏滚动与小步滚动
- 页面内沉浸模式，隐藏侧栏与控制区专注阅读
- 书签、最近阅读列表、阅读统计面板
- JSON 备份导出 / 导入恢复
- `chrome.storage.sync` 轻量同步设置与阅读进度
- 云备份（用户自填 Gist ID + Token）
- 大章节增量分页、章节分页缓存、空闲时后台预热
- **自定义快捷键**：设置面板内逐项重绑，键位冲突实时拦截，可一键恢复默认；快捷键帮助浮层按当前键位动态生成
- **自定义模板颜色**：主题新增「自定义」，可单独调整背景、纸面、正文、次要、强调、强强调 6 个颜色，正文与背景/纸面对比度过低时给出可读性提示
- **自定义字体**：内置预设之外可填写任意字体栈，带字符集安全校验、实时预览与非法值回退
- **设置面板分区导航**：标题与导航吸顶常驻，一键跳到通用 / 备份 / 字体 / 配色 / 按键 / 云备份；快捷键两列排布，云备份配置默认收起
- **编码兼容与防乱码**：自动探测 UTF-8 / UTF-16 LE / BE / GB18030 / Big5，BOM 与真实编码不符时回退启发式；确实无法识别时提示手动选编码并重导入
- **无目录书兜底**：通篇没有章节标记的书按段落边界平铺阅读，不切断段落
- **边界四态**：加载中 / 空 / 错误 / 阅读中四种状态各有明确界面，错误态给出原因、重试入口与手动选编码入口
- **可选匿名错误上报**：默认关闭；开启后仅上报版本、平台、错误类型与匿名调用栈，不含正文、Token 或任何个人信息

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
- GitHub API 主机权限仅在用户点击“连接 Gist”时按需申请，默认安装不会预先获取。

## 打包发布

### 一键打包

1. 安装依赖（如需）：`npm install`
2. 执行代码检查：`npm run lint`
3. 执行测试：`npm test`
4. 生成发布包：`npm run build:zip`

执行后会在 `dist` 目录下生成：

- `xyfy-txt-reader-v<version>.zip`

说明：

- ZIP 根目录就是扩展根目录（`manifest.json` 在压缩包根层级）
- 已自动排除开发与构建文件：`tests`、`docs`、`scripts`、`web`、`node_modules`、`.git`、`.github`、`.vscode`、`dist`，以及 `eslint.config.js`、`package-lock.json`、`tag-release.sh`
- 该 ZIP 同时适用于 Chrome Web Store 与 Edge Add-ons，无需分别打包

### 发布前检查清单

- `manifest.json` 里的 `version` 已递增（且与 `package.json` 保持一致）
- `npm run lint` 与 `npm test` 均通过
- 图标与商店截图已准备（至少 128x128 图标 + 1280x800 截图）
- 权限最小化（默认仅 `storage`，GitHub API 主机权限在“连接 Gist”时按需申请）
- 已验证升级安装后的阅读进度与设置兼容性（旧版本设置项会被自动补全默认值）
- 隐私政策链接可正常打开：`https://xyfy.github.io/Xyfy.TxtReader/privacy-policy.html`
- 商店文案素材可直接使用：`docs/store-listing.md`

### GitHub Pages 隐私政策链接启用

1. 推送当前仓库到 GitHub 默认分支（例如 `main`）。
2. 进入仓库 Settings -> Pages。
3. Source 选择 `Deploy from a branch`。
4. Branch 选择 `main`，目录选择 `/ (root)`，保存。
5. 等待 Pages 发布完成后，使用：`https://xyfy.github.io/Xyfy.TxtReader/privacy-policy.html`

> 注意：如果 Pages 里配置过自定义域名，`*.github.io` 会被 301 重定向到该域名。自定义域名一旦过期，隐私政策链接会直接失效（商店审核会因此拒绝）。此时需到 Settings -> Pages 清空 Custom domain 后再验证。

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

默认键位如下，**除 `Esc` 外均可在「设置 → 快捷键」中重绑**，重绑后快捷键帮助浮层会自动同步。

| 操作 | 默认键位 |
|------|----------|
| 下一章 | `→` 或 `]` |
| 上一章 | `←` 或 `[` |
| 下一页（书本模式）/ 向下滚一屏（滚动模式） | `Space` |
| 上一页（书本模式）/ 向上滚一屏（滚动模式） | `Shift + Space` |
| 小步下滚 / 上滚（滚动模式） | `↓` / `↑` |
| 添加书签 | `B` |
| 显示 / 隐藏左侧栏 | `Tab` |
| 打开快捷键帮助 | `H` 或 `?` |
| 分页调试面板 | `Alt + D` |
| 关闭浮层 | `Esc`（固定键位，不可重绑） |

## 当前目录

- popup: 扩展弹窗
- reader: 阅读器页面与交互逻辑（配色计算与设置面板已拆为 `reader-color.js`、`reader-settings-panel.js`）
- background: MV3 service worker
- modules: 核心模块（解析、分页、编码、章节、边界状态、错误上报、备份、存储、快捷键映射、i18n）
- web: 站点版入口（由 `npm run build:webapp` 生成，不参与扩展打包）
- tests: 分页、编码、章节、边界四态、错误上报、样本集、回归，以及备份、同步、快捷键映射、云备份抽象层、配色计算、设置面板结构与双端 HTML 一致性测试
- docs: 商店素材与规划文档
- scripts: 打包、图标生成与测试样本生成脚本

## 测试

`npm test` 一次跑完 16 个测试组（分页、编码、章节、边界四态、错误上报、样本集、回归、备份、同步、快捷键、双端一致性、设置面板、配色、云备份）。

手工验证用的样本集由脚本生成，不入库：

```bash
npm run gen:samples                            # 9 类 11 个样本，大文件 100 万字
node scripts/gen-test-samples.mjs --scale 3.5  # 大文件放大到约 10 MB
```

样本清单与每个样本的用途见 `tests/samples/README.md`。
