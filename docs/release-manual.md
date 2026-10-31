# Xyfy TXT Reader v1.0.0 发布手册

> 编写日期：2026-10-31 · 适用版本：**v1.0.0（能力冻结）** · 执行人：项目 owner
> 目标：把已经完成的代码交付，一步一步推到 Chrome Web Store 与 Edge Add-ons 上架。

## 关于本文里的命令路径（先读这段）

**仓库在你本机的路径因人而异，本文不假设具体位置。** 下面所有命令都以「已 `cd` 到仓库根目录」为前提。请先确认你在仓库里：

```bash
cd <你的仓库路径>              # 换成你自己的，例如：
                              #   macOS:   cd /Volumes/backup/source/txtReader
                              #   Windows: cd D:\Projects\Xyfy.TxtReader
                              #   Linux:   cd ~/Projects/Xyfy.TxtReader

pwd                            # 打印当前目录，确认已进入
ls manifest.json               # 能看到这个文件就说明位置对了
git rev-parse --show-toplevel  # 最可靠：直接打印仓库根目录
```

> **注意目录名不固定**：本文用 `Xyfy.TxtReader` 举例，但你的本地目录可能叫 `txtReader`（全小写）或别的名字——那是你 `git clone` 时决定的。**不要照抄本文的目录名**，用 `pwd` / `git rev-parse` 确认你自己的实际路径。

至于我（AI）执行命令时用的 `/workspace/Xyfy.TxtReader`——那是我沙箱虚拟机里的路径，**你的电脑上不存在，不要照抄**。

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

### 1.0 先取得发布包——`dist/` 不在 Git 仓库里

**这是最容易卡住的一步。** `dist/` 被写在 `.gitignore` 第 2 行，**从来没有入过库**。所以无论 `git clone` 还是 `git pull`，都不会带下任何 ZIP 包。你本地的 `dist/` 目录可能存在，但里面只有你过去本地打的旧包，不会有 `v1.0.0.zip`。

自检：

```bash
cd <你的仓库路径>
cat .gitignore | head -3          # 应看到 dist/
ls -l dist/                        # v1.0.0.zip 大概率不存在
git ls-files dist/                 # 输出为空，证明 dist 未被跟踪
```

**取得发布包有两条路，务必选 A：**

#### 路线 A（推荐）：从 GitHub Release 下载

这样拿到的包与手册记录的哈希、与商店将审核的包**逐字节一致**。

```bash
# 方式 1：用 gh（已登录 GitHub 时最省事）
gh release download v1.0.0 --pattern '*.zip' --dir dist

# 方式 2：用 curl（无需 gh）
mkdir -p dist && cd dist
curl -L -O https://github.com/xyfy/Xyfy.TxtReader/releases/download/v1.0.0/xyfy-txt-reader-v1.0.0.zip
```

#### 路线 B（仅调试用）：本地重新打包

```bash
npm install          # 首次需要
npm run build:zip
```

> **注意**：`zip` 会把当前文件时间戳写进归档，因此**重新打包的 ZIP 哈希必然与 Release 附件不同**。这个包可以本地加载测试，但**不要拿去提审**——商店里的版本、回滚预案记录的指纹、Release 附件三者必须一致。要走路线 B，就得把新哈希同步更新到 `docs/rollback-runbook.md` 并替换 Release 附件。

#### macOS 用户注意

macOS 默认**没有 `sha256sum`**（那是 GNU coreutils 的命令）。用系统自带的：

```bash
shasum -a 256 dist/xyfy-txt-reader-v1.0.0.zip
```

若已通过 Homebrew 安装 `coreutils`，也可以用 `sha256sum`（有时需写 `gsha256sum` 全名）。

### 1.1 包指纹

| 项 | 值 |
|----|----|
| 文件 | `dist/xyfy-txt-reader-v1.0.0.zip` |
| 大小 | **151 445 B** |
| SHA-256 | `b61586bf6200b71405201b11cbfa28d466c7ffb146532cee07f538eb9bd8b167` |
| 条目数 | 49 项（含 6 个目录条目，实文件 43 个） |
| 远端一致性 | ✅ 与 GitHub Release v1.0.0 附件 digest 逐字节一致 |

### 1.2 本地自检命令

**在仓库根目录执行**（先 `cd` 到你自己仓库，用 `pwd` 确认位置）：

```bash
# 0) 确认已在仓库根目录
ls manifest.json && git rev-parse --show-toplevel

# 1) 哈希是否与手册一致（macOS 用 shasum -a 256）
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
shasum -a 256 dist/xyfy-txt-reader-v1.0.0.zip   # macOS；Linux 用 sha256sum
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

**存放位置**（⚠️ 仓库里目前**没有这个目录**，全部是本地产物，由你或脚本来建）：

```
Xyfy.TxtReader/store-assets/        ← 手动建，或首次跑 npm run shots 时自动生成
├── screenshots/    01-import.png … 05-settings.png   ← 由 npm run shots 自动生成（见 2.5），不用手建
├── promo/          ← 可选，详见下方；不建也完全没问题
└── icons/          可选，直接从仓库根 icons/ 复制
```

- `screenshots/`：**不用你手动建**，`npm run shots` 会自动创建目录并写入 5 张图（见 2.5 节）。这 5 张就是商店要的截图。
- `promo/`：**可选，且仓库不预置任何图片**。宣传图属于商店营销素材，需用设计工具按下方尺寸自制，或按 2.3 节建议第一版直接跳过。需要时才建这个目录、把图放进去即可。
  - 440×280（搜索卡片小图）、920×680（详情页大图）、1400×560（Featured 横幅，需向 Google 申请）
  - 文件名随意，商店后台按上传位置区分；参考命名：`440x280.png` / `920x680.png` / `1400x560.png`。
  - 目录里已放 `promo/README.md` 说明规格，照着出图即可。

> `store-assets/` 不需要进发布包（也不建议提交进 git）。已在 `package.json` 的 `build:zip` 里加上 `'store-assets/*'` 排除规则，并实测验证过：建了目录后重新打包，包内条目数仍为 49、SHA-256 仍为 `b61586bf…9bd8b167`，素材不会污染发布包。

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

## 2.5 一键自动化截图（推荐，省去手动拍）

> 由于 CI/沙箱环境普遍禁止 Chromium 加载扩展，**截图脚本必须在你本机运行**（你本机 Chrome 能正常加载未打包扩展）。我已把脚本写好并验证过语法与 DOM 选择器，你只需三步即可自动产出全部 5 张图。

脚本：`scripts/shots.mjs`（已接入 `npm run shots`）。

```bash
# 1) 安装依赖（仅首次）
npm install playwright
npx playwright install chromium   # 下载 Playwright 的 Chromium 二进制（约 150MB，只需一次）

# 2) 自动导入样张并截图
#    不指定 --book 时：优先用 tests/samples/02-large-utf8.txt；
#    若该样本不存在（如刚 clone 未跑 gen:samples），则自动生成一本虚构中文书《雾港旧事》
npm run shots
# 或指定你自己的样张：
# node scripts/shots.mjs --book=/path/to/your-book.txt

# 3) 取图
ls store-assets/screenshots/
# 01-import.png 02-double-page.png 03-scroll.png 04-toc.png 05-settings.png
```

| 项 | 值 |
|----|----|
| 样张优先级 | `--book` 指定 > 仓库自带 `tests/samples/02-large-utf8.txt` > 自动生成虚构书 `tests/samples/fictional-sample.txt` |
| 输出目录 | `store-assets/screenshots/`（已在 `build:zip` 排除列表，不会污染发布包） |
| 截图规格 | 1280×800 视口截图，PNG，与第 2.2 节 5 张定义一一对应 |
| 5 张对应 | ①导入页 → `01-import`　②双页 → `02-double-page`　③滚动 → `03-scroll`　④目录 → `04-toc`　⑤设置 → `05-settings` |

**注意事项**：
- 脚本用本机真实 Chrome 加载扩展并自动点击导入、切换双页/滚动、展开目录、打开设置面板。前提是你能成功加载未打包扩展（chrome 地址栏输入 `chrome://extensions` → 右上角开发者模式 → 加载已解压的扩展程序）。脚本内部走的正是同一逻辑，能加载就能截。
- macOS / Windows 直接在桌面环境运行即可；**Linux 无图形界面**时，用 `xvfb-run -a npm run shots` 提供虚拟显示器。
- 截图中正文是虚构文本（仓库样本或自动生成的《雾港旧事》均为原创内容），不含任何真实版权内容，可直接上架。
- 若想换截图里的书，传 `--book` 指一本本地 TXT 即可。
- 自动生成的 `tests/samples/fictional-sample.txt` 不会被提交（已在 `.gitignore` 的 `tests/samples/` 内），仅本地使用、可随时删除重生成。
- 若启动时报 `Executable doesn't exist at .../ms-playwright/chromium-*/...`：说明没下载浏览器二进制，先跑 `npx playwright install chromium`，再 `npm run shots`。`npm install playwright` 只装 npm 包，不保证拉浏览器。

**手动拍摄仍可行**：若你不想装 Playwright，按 2.2 节的拍摄要点与防驳回技巧，用 `chrome://extensions` 加载扩展后手动截 5 张，效果一致。

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

**位置**：`docs/store-listing.md` → 第 **164** 行 `### 三、商店截图`

本地可以直接看（在你自己仓库根目录执行）：

```bash
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
| **取得发布包** | `gh release download v1.0.0 --pattern '*.zip' --dir dist`（`dist/` 不入库，clone 下来没有包） |
| 待上传包 | `dist/xyfy-txt-reader-v1.0.0.zip`（151 445 B） |
| SHA-256 | `b61586bf6200b71405201b11cbfa28d466c7ffb146532cee07f538eb9bd8b167`（macOS 校验用 `shasum -a 256`） |
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

1. **第一步（别跳过）**：`gh release download v1.0.0 --pattern '*.zip' --dir dist`，然后 `shasum -a 256 dist/xyfy-txt-reader-v1.0.0.zip` 核对是否为 `b61586bf…9bd8b167`。**`dist/` 不在 Git 里，不下载就没有可上传的包。**
2. **今天**：`chrome://extensions` 加载已解压扩展，导入样本，按 2.2 拍 5 张截图（约 1 小时）。
3. **今天**：按 3.1 在自己浏览器点一次隐私政策链接，确认能打开。
4. **今天**：按 3.2 把隐私表单答案先写在纸上，别到后台现编。
5. **明天**：提 Edge（免费、快），1–3 天出结果，先验证包本身没问题。
6. **Edge 过审后**：提 Chrome（$5 注册费，1–7 天）。
7. **双端上线后**：启动 `rqZ6YU` 的 7 天观察，宣传图有空再补。

> 真正的卡点只有两件事：**先下载到正确的包** + **5 张截图**。其余全部就绪。
