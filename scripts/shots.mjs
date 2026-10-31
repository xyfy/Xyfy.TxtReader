// 商店截图自动生成脚本（Xyfy TXT Reader）
//
// 用途：用本地真实的 Chrome 加载扩展，自动导入一本书并截出商店需要的 5 张图。
//      沙箱/CI 环境通常禁止 Chromium 加载扩展，因此请在「本机」运行本脚本。
//
// 前置：
//   1. 已 `git clone` 本仓库并位于仓库根目录
//   2. 安装依赖：npm install playwright   （会一并下载 Playwright 的 Chromium）
//
// 用法：
//   node scripts/shots.mjs                                  # 不指定 → 自动用 / 生成「虚构样本」
//   node scripts/shots.mjs --book=/path/to/book.txt         # 指定样张（优先）
//   node scripts/shots.mjs --out=/path/to/screenshots       # 指定输出目录
//   xvfb-run -a node scripts/shots.mjs                      # Linux 无显示器时
//
// 样张优先级：
//   1. --book 指定的文件（必须存在，否则报错）
//   2. 仓库自带 tests/samples/02-large-utf8.txt（若存在）
//   3. 以上都没有 → 自动生成一本虚构中文书到 tests/samples/fictional-sample.txt
//      （多章节、原创内容，仅用于截图，不进发布包）
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

const SAMPLE = path.join(EXT, 'tests/samples/02-large-utf8.txt');
const FICTION = path.join(EXT, 'tests/samples/fictional-sample.txt');

// 不指定 --book 时，自动生成一本虚构中文书（多章节、原创内容，仅用于截图）。
const FICTION_TITLE = '雾港旧事';
const FICTION_CHAPTERS = [
  ['第一章 起点', [
    '雨停的时候，屋檐下的水珠还在滴，一滴一滴敲在青石板上。这些都是很多年前的事了，久到连他自己都开始怀疑是否记错。他把信折好，塞进贴身的衣袋里，像藏起一件会烫手的东西。',
    '老船夫坐在船尾抽烟，烟丝的味道被水汽压得很低。城门在身后合上，发出一声沉闷的响，像是一段日子的结束。这条街他走过很多次，从没像今天这样觉得它长得走不完。',
    '她没有回头，只是抬手把斗篷的兜帽往上拉了拉。远处传来更鼓的声音，三更了，城里却还有人没睡。城墙上的火把在风里摇晃，把他的影子拉得很长。',
  ]],
  ['第二章 旧城', [
    '风从缺口灌进来，卷起地上的纸屑，像一群找不到家的蝴蝶。如果这个夜晚能够重来一次，他大概还是会做出同样的选择。',
    '茶馆里坐着几个熟客，见他进来只是点点头。伙计端来一碗温茶，茶面上浮着两片枯了的桂花。他想起临行前母亲说的话，那时候他只当是唠叨。',
    '街角的灯笼被雨打湿了一半，光晕晕开在水洼里。他数着脚步，从桥头走到巷口，又从巷口走回桥头，仿佛这样就能把走丢的年月走回来。',
  ]],
  ['第三章 渡口', [
    '船靠岸时，雾还没散。码头上的缆绳湿漉漉地缠在木桩上，像谁随手系下的结。他把包袱往肩上一搭，踩着晃悠悠的跳板走了上去。',
    '对岸的轮廓在雾里时隐时现，像一幅没干透的画。老船夫说，这趟水路他走了四十年，从没见过今天这样静的早晨。',
    '他在船头站了很久，看水把天和地连成一片灰白。有些话来不及说，有些路来不及走，到最后都成了渡口边被浪拍碎的回响。',
  ]],
  ['第四章 灯下', [
    '客栈的灯是桐油点的，昏黄里带着一点暖。他摊开那封信，字迹已经被雨水洇开，只剩几个模糊的笔画还能辨认。',
    '窗外的雨又落下来，打在瓦片上，密密地像是有人在低声说话。他吹了吹灯芯，火苗跳了一下，把影子投到墙上，晃了晃，又稳了。',
    '那一夜他没怎么睡。半梦半醒之间，他仿佛又看见母亲站在院门口，手里攥着那句没说完的叮嘱，风把她的白发吹得乱蓬蓬的。',
  ]],
  ['第五章 归途', [
    '返程的船比来时慢。雾散了，江面亮得晃眼，远山一层层退到身后，像被谁慢慢卷起的画卷。',
    '他终于明白，有些地方之所以让人惦记，不是因为风景好，而是因为那里住着还肯等他的人。',
    '上岸时已是黄昏。炊烟从错落的屋顶升起，混着饭香，软软地裹住了整座小城。他深吸一口气，朝着最亮的那扇窗走去。',
  ]],
  ['第六章 尾声', [
    '很多年后，他偶尔还会想起那个雨停的午后。水珠落在青石板上，一声一声，像是谁在替他把没说出口的话，轻轻念了一遍。',
    '信早已不在了，可有些句子他记了一辈子。他说不出那算不算遗憾，只知道每当雾起，胸口总会微微地，暖一下。',
  ]],
];

function ensureFictionalBook() {
  if (fs.existsSync(FICTION)) return FICTION;
  const lines = [FICTION_TITLE, ''];
  for (const [title, paras] of FICTION_CHAPTERS) {
    lines.push(title, '');
    for (const p of paras) lines.push(p, '');
  }
  fs.mkdirSync(path.dirname(FICTION), { recursive: true });
  fs.writeFileSync(FICTION, lines.join('\n'), 'utf8');
  return FICTION;
}

// 样张解析：--book > 自带样张 > 自动生成虚构书
const userBook = getArg('book', null);
let BOOK;
if (userBook) {
  if (!fs.existsSync(userBook)) {
    console.error(`✗ 指定样张不存在：${userBook}`);
    process.exit(1);
  }
  BOOK = userBook;
} else if (fs.existsSync(SAMPLE)) {
  BOOK = SAMPLE;
} else {
  BOOK = ensureFictionalBook();
  console.log('· 未指定样张且仓库无自带样本，已自动生成虚构书：', path.basename(BOOK));
}

const OUT = getArg('out', path.join(EXT, 'store-assets/screenshots'));
const PROFILE = path.join(EXT, '.shot-profile'); // 临时用户目录，存放扩展 ID

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
