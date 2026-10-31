# Xyfy TXT Reader v1.0.0 发布手册

> 编写日期：2026-10-31 · 适用版本：**v1.0.0（能力冻结）** · 执行人：项目 owner
> 目标：把已经完成的代码交付，一步一步推到 Chrome Web Store 与 Edge Add-ons 上架。

## 关于本文里的命令路径（先读这段）

本文所有命令使用**相对路径**，起点是仓库根目录。仓库在你本机的实际位置是：

```
/workspace/Xyfy.TxtReader
```

所以下面两种写法等价，任选一种：

```bash
# 写法 A：绝对路径，任何当前位置都能跑
cd /workspace/Xyfy.TxtReader && sha256sum dist/xyfy-txt-reader-v1.0.0.zip

# 写法 B：先回到工作区，再用相对路径（与本文命令一致）
cd /workspace
cd Xyfy.TxtReader
sha256sum dist/xyfy-txt-reader-v1.0.0.zip
```

> 如果你在 `Xyfy.TxtReader` 目录里直接执行 `cd Xyfy.TxtReader`，会报 `No such file or directory`——因为仓库目录里没有同名子目录。这是最常见的踩坑点。

---

## 第 0 步：先看结论——你现在卡在哪

| 状态 | 数量 | 说明 |
|------|------|------|
| 代码与包 | ✅ 全部就绪 | 版本冻结完成，Release 已发，CI 全绿 |
| Go/No-Go 检查项 | **12 / 13 已勾** | 只剩「双端商店素材与文案一致」这 1 项 |
| 商店素材 | ⚠️ **未就绪** | 图标有；**截图 0 张，宣传图 0 张** |

**唯一阻塞项是素材，不是代码。** 素材一旦备齐，即可直接提审。

---

## 第 1 步：核对待发布包（5 分钟）

### 1.1 包指纹

| 项 | 值 |
|----|----|
| 文件 | `dist/xyfy-txt-reader-v1.0.0.zip` |
| 大小 | **151 445 B** |
| SHA-256 | `b61586bf6200b71405201b11cbfa28d466c7ffb146532cee07f538eb9bd8b167` |
| 条目数 | 49 项（含 6 个目录条目，实文件 43 个） |
| 远端一致性 | ✅ 与 GitHub Release v1.0.0 附件 digest 逐字节一致 |

### 1.2 本地自检命令

**在仓库根目录执行**（`/workspace/Xyfy.TxtReader`，先 `cd /workspace/Xyfy.TxtReader` 一次即可）：

```bash
# 进入仓库根目录（绝对路径，避免相对路径踩坑）
cd /workspace/Xyfy.TxtReader

# 1) 哈希是否与手册一致
sha256sum dist/xyfy-txt-reader-v1.0.0.zip

# 2) manifest 版本是否为 1.0.0
unzip -p dist/xyfy-txt-reader-v1.0.0.zip manifest.json | grep '"version"'

# 3) manifest 是否在根目录（不能有顶层子目录）
unzip -l dist/xyfy-txt-reader-v1.0.0.zip | head -6

# 4) 是否混入了开发文件（应为空）
unzip -l dist/xyfy-txt-reader-v1.0.0.zip | grep -E 'tests/|docs/|node_modules|\.git/|eslint|package\.json' || echo "OK: 无开发文件"

# 5) 大小远小于 10 MB 上限
```

> **不要重新跑 `npm run build:zip`。** 重新打包会改变 ZIP 内的时间戳，哈希随之变化，与 Release 附件和回滚预案记录的指纹就对不上了。除非你要改代码，否则直接用现有包。

### 1.3 需要重新打包的唯一情形

改了任何被包进去的文件（`manifest.json` / `reader/*` / `modules/*` / `_locales/*` / `icons/*` / `privacy-policy.html` / `CHANGELOG.md` / `README.md`）之后：

```bash
npm test && npm run lint && npm run build:zip
sha256sum dist/xyfy-txt-reader-v1.0.0.zip   # 记录新哈希
# 然后必须同步更新 docs/rollback-runbook.md 第一节的 SHA-256，并替换 Release 附件
```

---

## 第 2 步：备齐商店素材（唯一的实际工作量）

### 2.1 图标——已有，直接用

| 文件 | 尺寸 | 体积 | 用途 |
|------|------|------|------|
| `icons/icon16.png` | 16×16 | 643 B | 工具栏 |
| `icons/icon32.png` | 32×32 | 1 338 B | Windows 高 DPI |
| `icons/icon48.png` | 48×48 | 2 183 B | 扩展管理页 |
| `icons/icon128.png` | 128×128 | 7 515 B | **商店详情页主图（必填）** |

### 2.2 截图——需要你拍（共 5 张）

规格：**1280 × 800**（或 1440 × 900）/ PNG 或 JPG / 宽度 ≥ 1280 px / 单张 < 2 MB。
Chrome 商店最少 1 张，建议 3–5 张。

| 编号 | 拍什么 | 画面里必须能看到的元素 | 建议怎么摆 |
|------|--------|------------------------|------------|
| 1 | 导入页 | TXT 导入入口、文件选择按钮 | 用一本真实小说（如 100 万字样本）导入，让「最近导入」列表里有 2–3 本 |
| 2 | 书本双页 | 双栏排版 + 页码 | 翻到书中段，正文有对话、有多段落，体现纸书感 |
| 3 | 滚动阅读 | 单列滚动 + 底部进度条 | 让进度条处在 ~40%，一眼能看出「读到哪」 |
| 4 | 章节目录 | 章节列表 + 书签入口 | 目录滚动到中间，露出 10 章以上，体现「100 万字也能跳」 |
| 5 | 沉浸模式 / 设置面板 | 字体、主题、行距可调 | 优先选**设置面板**，一屏展示「自定义配色 + 自定义字体」，信息密度最高 |

**拍摄技巧（决定截图过不过审）**：

1. 浏览器窗口先缩到 1280×800 再用系统截图，或用 DevTools 设备模式固定视口，不要靠后期缩放（会糊）。
2. **截前清场**：关掉其他扩展图标、隐藏书签栏（`Ctrl+Shift+B`）、用干净的用户配置文件，避免露出私人书签。
3. **不要出现真实版权内容**：正文用仓库自带的测试样本（`npm run gen:samples` 生成的虚构文本），避免商店以「展示侵权内容」为由驳回。
4. **不要 P 上虚假功能**：截图里的界面必须是当前版本真实存在的，1.0 的截图里不要出现 EPUB / TTS 之类不存在的东西。
5. 中英文各一套更好（Chrome 商店按语言展示），至少准备中文一套。

**存放位置建议**（当前仓库里没有任何截图文件，需要你自己建）：

```
Xyfy.TxtReader/store-assets/
├── screenshots/    01-import.png … 05-settings.png
├── promo/          440x280.png / 920x680.png / 1400x560.png
└── icons/          直接从 icons/ 复制
```

> `store-assets/` 不需要进发布包。已在 `package.json` 的 `build:zip` 里加上 `'store-assets/*'` 排除规则，并实测验证过：建了目录后重新打包，包内条目数仍为 49、SHA-256 仍为 `b61586bf…9bd8b167`，素材不会污染发布包。

### 2.3 宣传图——可选，不影响过审

| 规格 | 位置 | 优先级 |
|------|------|--------|
| 440×280 | 搜索结果卡片小图 | 低 |
| 920×680 | 详情页顶部大图 | 中 |
| 1400×560 | Featured 推广横幅 | 低（需申请） |

**建议：第一版先不传宣传图**，直接提审，过审后再补。少一个变量少一次被打回。

### 2.4 文案——已写好，直接粘贴

全部文案在 **`docs/store-listing.md`** 里，逐段复制即可：

| 字段 | 商店限制 | 文档位置 |
|------|----------|----------|
| 扩展名称 | ≤ 45 字符 | 第 7 行：`Xyfy TXT Reader` |
| 简短描述 | ≤ 132 字符 | 第 12 行 |
| 详细描述（中） | ≤ 16 000 字符 | 第 16–48 行 |
| 详细描述（英） | ≤ 16 000 字符 | 第 52–86 行 |
| 分类 | — | Books / Productivity |
| 隐私政策 URL | 必填 | 见下方第 3 步 |
| 更新日志 | — | 需按 1.0.0 重写，见下方 |

**更新日志要新写一段**。`docs/store-listing.md` 里现有的模板只到 0.7.0，提审时填这个：

```
版本 1.0.0

- 能力冻结版本：核心阅读链路经真实大文件验证，P0/P1 缺陷清零
- 优化：100 万字文件首屏渲染 522ms，108 章目录跳转 39ms
- 优化：大批量阅读时内存占用稳定在 5.8MB 量级
- 修复：导入损坏文件、无目录书段落被切断、翻页出现空白页等已知问题
- 无障碍：三套预设主题对比度全部达到 WCAG AA（paper 4.77 / night 6.09 / sepia 4.82）
- 完整变更见 https://github.com/xyfy/Xyfy.TxtReader/blob/main/CHANGELOG.md
```

---

## 第 3 步：提审前的最后 4 项确认

### 3.1 隐私政策 URL 必须能打开

商店审核第一步就是点这个链接，打不开直接驳回。

- 主用：`https://xyfy.github.io/Xyfy.TxtReader/privacy-policy.html`
- 备用：`https://raw.githubusercontent.com/xyfy/Xyfy.TxtReader/main/privacy-policy.html`

> 已核实：GitHub Pages 状态为 `built`，最近一次构建 `2026-10-31 12:40 UTC`，源为 `main` 分支根目录，HTTPS 强制开启。**提审前请在你自己浏览器里实际点一次**——沙箱网络限制导致我这边无法直接验证 HTTP 可达性，只能验证 GitHub 侧的构建状态。

### 3.2 数据使用声明（Chrome 的 Privacy practices 表单）

这是 1.0 提审**最容易被打回**的一栏，逐项对照填：

| 表单问题 | 怎么填 | 依据 |
|----------|--------|------|
| 是否收集用户数据 | **否**（不勾选任何数据类型） | 正文与阅读数据仅存本地；错误上报 `transport: null`，无上报端点 |
| 是否向第三方出售数据 | 否 | — |
| 是否用于与核心功能无关的用途 | 否 | — |
| 是否使用远程代码 | **否** | 包内无远程脚本加载，全部代码随包分发 |
| 权限用途说明（storage） | 保存书籍、阅读进度、书签与设置 | `manifest.json` |
| 权限用途说明（permissions） | 读取可选权限状态，用于云备份开关 | `manifest.json` |
| 可选权限（api.github.com） | 仅在用户主动开启 Gist 云备份并填入自己 Token 时请求 | `optional_host_permissions` |

> **关键点**：Gist 备份是「用户用自己的 Token 写自己的 Gist」，数据不经过开发者。表单里如被问及「是否传输用户数据到第三方」，如实说明这是用户主动发起、目标为用户本人账户即可，这不构成「开发者收集」。

### 3.3 权限面自查——已审计，无冗余

当前 `manifest.json` 声明的权限：

```json
"permissions": ["storage", "permissions"],
"optional_host_permissions": ["https://api.github.com/*"]
```

审计结论：三项均在用，**无 `tabs` / `scripting` / `cookies` / `<all_urls>` / content_scripts / 静态 host 权限**。审核员问起来直接答「storage 存本地数据、permissions 读可选权限状态、api.github.com 为可选项」。

### 3.4 提审前跑一遍自动化

```bash
npm test    # 期望：23 组 / 67 条断言全绿
npm run lint # 期望：0 error（8 个 warning 为历史遗留，与 v0.8.1 持平）
```

---

## 第 4 步：Chrome Web Store 提审

1. 打开 <https://chrome.google.com/webstore/devconsole>，用发布账号登录（首次需付 **$5 一次性注册费**）。
2. **New item** → 上传 `dist/xyfy-txt-reader-v1.0.0.zip`。
3. **Store listing** 页逐项填：
   - 名称 / 简短描述 / 详细描述（从 `docs/store-listing.md` 复制）
   - 分类：**Books**（次选 Productivity）
   - 语言：中文（简体）+ English
   - 图标 128×128：`icons/icon128.png`
   - 截图：至少 1 张 1280×800（建议 5 张）
   - 隐私政策 URL：见 3.1
4. **Privacy practices** 页：按 3.2 表格填，勾选「不收集用户数据」。
5. **Distribution** 页：可见性选 **Public**；定价 Free。
6. **Submit for review**。

**审核周期**：首次提审通常 **1–7 个工作日**（1.0 是首次上架，会比后续更新慢）。
**被打回怎么办**：驳回原因会写清楚（多为隐私表单与实际行为不符、截图不合规、权限说明不足）。改完重新提交，不要重复提交同一份。

---

## 第 5 步：Edge Add-ons 提审

1. 打开 <https://partner.microsoft.com/dashboard/microsoftedge>，用 Microsoft 账号注册开发者（**免费**，无需 $5）。
2. **新建扩展** → 上传同一个 `dist/xyfy-txt-reader-v1.0.0.zip`（Chrome 包可直接复用，MV3 兼容）。
3. 填写商店信息：名称、描述、分类、图标、截图规格与 Chrome 基本一致（以后台实际提示为准）。
4. **隐私政策 URL** 同样必填，用 3.1 的链接。
5. 提交审核。

**审核周期**：**1–3 个工作日**，通常比 Chrome 快。Edge 对截图尺寸更宽容，但同一套 1280×800 直接复用即可。

> **顺序建议**：先提 Edge（快、免费、能快速验证包本身没问题），过审后再提 Chrome。这样如果包有问题，Edge 审核员会先告诉你。

---

## 第 6 步：发布后 7 天观察（对应任务 `rqZ6YU`）

上架后 7 天内每天扫一遍：

| 观察项 | 看哪里 | 异常阈值 |
|--------|--------|----------|
| 崩溃率 | 商店后台 / 用户反馈 | 出现任一「安装后白屏」即升级为 P1 |
| 安装量 | 商店后台 | 仅作参考，不作决策 |
| 评分与评论 | 商店评论区 | 出现 1–2 星差评先读内容，区分「功能缺失」与「Bug」 |
| 隐私投诉 | 评论 / GitHub Issues | **任一隐私类投诉立即按 P0 处理** |
| Issue 增量 | <https://github.com/xyfy/Xyfy.TxtReader/issues> | 新建 P0/P1 单当日响应 |
| 数据一致性 | 自己装一份，导入同一本书对比 | 进度、书签、备份是否与本地版一致 |

观察期结束后的动作：把结论写回 `Xyfy.TxtReader-项目计划与路线图.md`，然后把 v1.1 立项（`rBVAM5`：FR-S2 阅读目标与进度可视化）。

---

## 第 7 步：出事怎么办——回滚

完整预案见 **`docs/rollback-runbook.md`**。这里只放最关键的判断：

### 触发回滚的条件（满足任一）

| 等级 | 场景 |
|------|------|
| **P0** | 导入即崩溃 / 已导入书籍全部不可读 |
| **P0** | 隐私事故：正文、书名、Token 或 PII 外泄到任何外部端点 |
| **P0** | 分页或章节识别导致主链路大面积不可用 |
| P1（评估） | 单一平台安装后白屏且无法自助恢复 |

**不满足以上条件 → 走 1.0.x 补丁，不整版回滚。**

### 回滚包

| 版本 | 文件 | 大小 | SHA-256 |
|------|------|------|---------|
| v0.8.1（回滚目标） | `dist/xyfy-txt-reader-v0.8.1.zip` | 149 080 B | `9fa0101b…d01b5fe` |
| v1.0.0（当前） | `dist/xyfy-txt-reader-v1.0.0.zip` | 151 445 B | `b61586bf…9bd8b167` |

**重要前提**：v1.0.0 与 v0.8.1 的**代码逻辑完全一致**，1.0 只是版本号与文档冻结。所以回滚到 0.8.1 在功能上零损失，只是版本号回落——这让 1.0 发布的实质风险很低。

### 三步回滚

1. 商店后台 → 上传 v0.8.1 包 → 提审并标注「紧急回滚」（Chrome 1–24 h，Edge 1–3 天）。
2. 仓库侧打标签 `git tag -a v1.0.1-rollback-to-0.8.1`，**不要删 v1.0.0**，保留审计痕迹。
3. 回滚**不清除** IndexedDB 与 `chrome.storage`，用户书籍与进度不受影响。

---

## 附录 A：截图清单在哪、本地能不能打开

**位置**：`Xyfy.TxtReader/docs/store-listing.md` → 第 **164** 行 `### 三、商店截图`
（绝对路径：`/workspace/Xyfy.TxtReader/docs/store-listing.md`）

本地可以直接看：

```bash
cd /workspace/Xyfy.TxtReader
sed -n '160,200p' docs/store-listing.md     # 截图 + 宣传图 + 文案勾选清单
less docs/store-listing.md                  # 全文看
```

**但要说清楚一件事**：那是一份**规格清单，不是素材**。

| 事实 | 证据 |
|------|------|
| 5 张截图的「已准备」列**全部是 `[ ]` 未勾** | `docs/store-listing.md` 第 168–174 行 |
| 3 张宣传图同样全部未勾 | 第 182–188 行 |
| 仓库里**没有任何图片素材** | `find . -iname "*.png" -o -iname "*.jpg" -o -iname "*screenshot*"` → 只有 `icons/` 下 4 个 PNG |
| 没有独立的截图目录 | `.v070-assets/` 只有 `docs/`、`modules/`、`tests/`，无图片 |

**结论：截图必须实机拍，仓库里不会有现成的。** 唯一现成可用的是 `icons/` 下 16/32/48/128 四个尺寸的图标。

拍摄流程：`chrome://extensions` → 开启开发者模式 → **加载已解压的扩展程序** → 选 `Xyfy.TxtReader` 目录 → 导入 `npm run gen:samples` 生成的样本 → 按 2.2 表格逐张截。

---

## 附录 B：一页速查

| 事项 | 值 |
|------|-----|
| 待上传包 | `dist/xyfy-txt-reader-v1.0.0.zip`（151 445 B） |
| SHA-256 | `b61586bf6200b71405201b11cbfa28d466c7ffb146532cee07f538eb9bd8b167` |
| 版本号 | `1.0.0`（manifest / package.json / app-info.js 三处一致） |
| 图标 | `icons/icon128.png` |
| 文案 | `docs/store-listing.md` |
| 截图规格 | 1280×800 / PNG / <2 MB / ≥1 张（建议 5 张） |
| 隐私政策 | `https://xyfy.github.io/Xyfy.TxtReader/privacy-policy.html` |
| Release | <https://github.com/xyfy/Xyfy.TxtReader/releases/tag/v1.0.0> |
| 回滚预案 | `docs/rollback-runbook.md` |
| Go/No-Go | 12 / 13（缺「双端商店素材」） |

---

## 附录 C：先把流程走通的建议顺序

1. **今天**：`chrome://extensions` 加载已解压扩展，导入样本，按 2.2 拍 5 张截图（约 1 小时）。
2. **今天**：按 3.1 在自己浏览器点一次隐私政策链接，确认能打开。
3. **今天**：按 3.2 把隐私表单答案先写在纸上，别到后台现编。
4. **明天**：提 Edge（免费、快），1–3 天出结果，先验证包本身没问题。
5. **Edge 过审后**：提 Chrome（$5 注册费，1–7 天）。
6. **双端上线后**：启动 `rqZ6YU` 的 7 天观察，宣传图有空再补。

> 整个卡点只有一件事：**5 张截图**。其余全部就绪。
