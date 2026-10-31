// 商店截图自动生成脚本（Xyfy TXT Reader）
//
// 用途：用本地真实的 Chrome 加载扩展，自动导入一本书并截出商店需要的 5 张图。
//      沙箱/CI 环境通常禁止 Chromium 加载扩展，因此请在「本机」运行本脚本。
//
// 前置：
//   1. 已 `git clone` 本仓库并位于仓库根目录
//   2. 安装依赖：npm install playwright   （会一并下载 Playwright 的 Chromium）
//   3. 准备一本 TXT 作为样张（仓库自带 tests/samples/02-large-utf8.txt 也可）
//
// 用法：
//   node scripts/shots.mjs                                  # 用自带样本
//   node scripts/shots.mjs --book=/path/to/book.txt         # 指定样张
//   node scripts/shots.mjs --out=/path/to/screenshots       # 指定输出目录
//   xvfb-run -a node scripts/shots.mjs                      # Linux 无显示器时
//
// 输出：store-assets/screenshots/{01-import,02-double,03-scroll,04-toc,05-settings}.png
//       均为 1280×800 视口截图，符合商店要求。

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const EXT = process.cwd(); // 仓库根目录（含 manifest.json）

// --- 参数解析 ---
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};

const BOOK = getArg(
  'book',
  fs.existsSync(path.join(EXT, 'tests/samples/02-large-utf8.txt'))
    ? path.join(EXT, 'tests/samples/02-large-utf8.txt')
    : null
);
const OUT = getArg('out', path.join(EXT, 'store-assets/screenshots'));
const PROFILE = path.join(EXT, '.shot-profile'); // 临时用户目录，存放扩展 ID

if (!BOOK || !fs.existsSync(BOOK)) {
  console.error('✗ 找不到样张 TXT。请用 --book=/path/to/book.txt 指定一本本地 TXT。');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(PROFILE, { recursive: true, force: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 从磁盘读取扩展 ID（跨平台：Default/Extensions/<id>/<version>/manifest.json）
function readExtId() {
  const base = path.join(PROFILE, 'Default/Extensions');
  if (!fs.existsSync(base)) return null;
  for (const id of fs.readdirSync(base)) {
    const verDir = path.join(base, id);
    for (const ver of fs.readdirSync(verDir)) {
      if (fs.existsSync(path.join(verDir, ver, 'manifest.json'))) return id;
    }
  }
  return null;
}

(async () => {
  console.log('▶ 启动 Chromium（加载扩展）…');
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false, // 扩展必须在有头模式加载
    args: [
      `--load-extension=${EXT}`,
      `--disable-extensions-except=${EXT}`,
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
    viewport: { width: 1280, height: 800 },
  });

  // 等待扩展注册（ID 落盘）
  let extId = null;
  for (let i = 0; i < 20 && !extId; i++) {
    extId = readExtId();
    if (!extId) await sleep(500);
  }
  if (!extId) {
    console.error('✗ 扩展未加载。请确认 manifest.json 在仓库根目录，且本机 Chrome 能加载未打包扩展。');
    await context.close();
    process.exit(1);
  }
  console.log('  扩展 ID =', extId);
  const base = `chrome-extension://${extId}`;

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  // 1) 导入页（空态，含「导入 TXT」入口）
  console.log('▶ [1/5] 导入页');
  await page.goto(`${base}/reader/reader.html`);
  await page.waitForSelector('#state-empty-import', { timeout: 15000 });
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, '01-import.png') });

  // 导入样张
  console.log('▶ 导入样张：', path.basename(BOOK));
  await page.setInputFiles('#file-input', BOOK);
  await page.waitForSelector('#book-title', { timeout: 20000 });
  await sleep(2000); // 等分页生成

  // 2) 书本双页模式
  console.log('▶ [2/5] 双页模式');
  await page.selectOption('#reading-mode', 'book');
  await sleep(800);
  await page.waitForFunction(() => {
    const el = document.querySelector('#left-page');
    return el && el.textContent.trim().length > 0;
  }, { timeout: 10000 }).catch(() => {});
  await page.screenshot({ path: path.join(OUT, '02-double-page.png') });

  // 3) 滚动阅读模式
  console.log('▶ [3/5] 滚动模式');
  await page.selectOption('#reading-mode', 'scroll');
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, '03-scroll.png') });

  // 4) 章节目录 / 侧栏
  console.log('▶ [4/5] 章节目录');
  await page.click('#toggle-panel'); // ☰ 展开侧栏
  await page.waitForFunction(() => {
    const el = document.querySelector('#toc-list');
    return el && el.children.length > 0;
  }, { timeout: 10000 }).catch(() => {});
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, '04-toc.png') });
  await page.click('#toggle-panel'); // 收起侧栏

  // 5) 设置面板
  console.log('▶ [5/5] 设置面板');
  await page.click('#settings-toggle');
  await page.waitForSelector('#settings-overlay:not(.hidden)', { timeout: 10000 }).catch(() => {});
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, '05-settings.png') });

  await context.close();
  console.log(`\n✓ 完成！5 张截图已生成在：${OUT}`);
  for (const f of ['01-import', '02-double-page', '03-scroll', '04-toc', '05-settings']) {
    const p = path.join(OUT, `${f}.png`);
    console.log(`  - ${f}.png  (${fs.statSync(p).size} B)`);
  }
})().catch((e) => {
  console.error('✗ 运行失败：', e.message);
  process.exit(1);
});
