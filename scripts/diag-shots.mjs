// 诊断脚本：端到端验证「扩展加载 + 阅读器打开 + 导入 + 视图切换」能否走通。
// 与 shots.mjs 共用同一套启动参数与选择器，但每一步都打印 ✅/❌ 与耗时，
// 失败时保存 diag-*.png 供事后查看。不生成正式 5 张图，专为排查问题用。
//
// 用法：
//   npm run diag
//   node scripts/diag-shots.mjs --book=/path/to/book.txt
//   DEBUG=pw:browser node scripts/diag-shots.mjs 2>&1 | head -120

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { findExtensionId } from './lib/find-ext-id.mjs';

const EXT = process.cwd();
const PROFILE = path.join(EXT, '.shot-profile-diag');
const OUT = path.join(EXT, 'store-assets/screenshots');
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const getArg = (n, d) => {
  const h = args.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=')[1] : d;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const now = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`;
const log = (...a) => console.log(...a);

// 虚构书（与 shots.mjs 同格式，便于章节识别器命中「第一章 起点」）
const FICTION = path.join(EXT, 'tests/samples/fictional-sample.txt');
function ensureFiction() {
  if (fs.existsSync(FICTION)) return FICTION;
  const lines = ['雾港旧事', ''];
  const ch = [
    ['第一章 起点', ['雨停了，屋檐下的水珠还在滴。', '他把信折好，塞进贴身的衣袋里。', '城门在身后合上，发出一声沉闷的响。']],
    ['第二章 旧城', ['风从缺口灌进来，卷起地上的纸屑。', '茶馆里坐着几个熟客，见他进来只是点点头。', '街角的灯笼被雨打湿了一半。']],
    ['第三章 渡口', ['船靠岸时，雾还没散。', '对岸的轮廓在雾里时隐时现。', '他在船头站了很久，看水把天和地连成一片灰白。']],
    ['第四章 灯下', ['客栈的灯是桐油点的，昏黄里带着一点暖。', '窗外的雨又落下来，打在瓦片上。', '那一夜他没怎么睡。']],
    ['第五章 归途', ['返程的船比来时慢。', '他终于明白，有些地方之所以让人惦记，是因为那里住着还肯等他的人。', '上岸时已是黄昏。']],
    ['第六章 尾声', ['很多年后，他偶尔还会想起那个雨停的午后。', '信早已不在了，可有些句子他记了一辈子。']],
  ];
  for (const [t, ps] of ch) { lines.push(t, ''); for (const p of ps) lines.push(p, ''); }
  fs.mkdirSync(path.dirname(FICTION), { recursive: true });
  fs.writeFileSync(FICTION, lines.join('\n'), 'utf8');
  return FICTION;
}

async function snap(page, name) {
  try {
    await page.screenshot({ path: path.join(OUT, `diag-${name}.png`) });
    log(`  📸 diag-${name}.png`);
  } catch (e) {
    log(`  📸 截图失败：${e.message}`);
  }
}

async function finish(context) {
  try {
    await context.close();
  } catch {
    /* 关闭失败忽略 */
  }
  fs.rmSync(PROFILE, { recursive: true, force: true });
}

(async () => {
  log('=== 基础信息 ===');
  log('EXT =', EXT);
  log('manifest.json 存在 =', fs.existsSync(path.join(EXT, 'manifest.json')));

  log('\n=== 启动 Chromium（ignoreDefaultArgs 去 --disable-extensions）===');
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false, // 扩展必须在有头模式加载
    ignoreDefaultArgs: ['--disable-extensions'], // 与 shots.mjs 一致，否则扩展子系统不初始化
    args: [
      `--load-extension=${EXT}`,
      `--disable-extensions-except=${EXT}`,
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    viewport: { width: 1280, height: 800 },
  });
  log('  已启动', now());

  let extId = null;
  for (let i = 0; i < 40 && !extId; i++) {
    extId = await findExtensionId(context, PROFILE, EXT);
    if (!extId) await sleep(500);
  }
  log('\n=== 扩展加载 ===');
  log('  Default/Extensions 存在 =', fs.existsSync(path.join(PROFILE, 'Default/Extensions')));
  log('  Default/Preferences 存在 =', fs.existsSync(path.join(PROFILE, 'Default', 'Preferences')));
  log('  扩展 ID =', extId || '(未找到)');
  if (!extId) {
    log('❌ 扩展未加载，停止。请确认 manifest.json 在仓库根目录，且本机 chrome://extensions 开发者模式能手动加载未打包扩展。');
    await finish(context);
    return;
  }
  const base = `chrome-extension://${extId}`;

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  log('\n=== 打开阅读器 ===');
  try {
    await page.goto(`${base}/reader/reader.html`, { timeout: 20000 });
    log('  goto ok', now());
  } catch (e) {
    log('❌ goto 失败：', e.message);
    await snap(page, 'goto-fail');
    await finish(context);
    return;
  }

  const sel = await page.evaluate(() => {
    const has = (s) => !!document.querySelector(s);
    const lp = document.querySelector('#left-page');
    return {
      readerMain: has('#reader-main'),
      fileInput: has('#file-input'),
      readingMode: has('#reading-mode'),
      togglePanel: has('#toggle-panel'),
      settingsToggle: has('#settings-toggle'),
      tocList: has('#toc-list'),
      settingsOverlay: has('#settings-overlay'),
      leftEmpty: lp ? lp.classList.contains('empty') : null,
      leftText: lp ? (lp.textContent || '').slice(0, 50) : null,
    };
  });
  log('  选择器：', JSON.stringify(sel, null, 2));
  await snap(page, 'reader-loaded');

  log('\n=== 导入 ===');
  const sample = path.join(EXT, 'tests/samples/02-large-utf8.txt');
  const book = getArg('book', null) || (fs.existsSync(sample) ? sample : ensureFiction());
  log('  样张 =', book);
  try {
    // #file-input 是隐藏控件；用 state:'attached' 等待，setInputFiles 会派发 change 触发导入
    await page.waitForSelector('#file-input', { state: 'attached', timeout: 10000 });
    await page.setInputFiles('#file-input', book);
    log('  setInputFiles ok', now());
  } catch (e) {
    log('❌ 导入设置文件失败：', e.message);
    await snap(page, 'import-fail');
    await finish(context);
    return;
  }
  try {
    await page.waitForFunction(() => {
      const el = document.querySelector('#left-page');
      return el && !el.classList.contains('empty') && (el.textContent || '').trim().length > 0;
    }, { timeout: 25000 });
    log('✅ 导入完成（#left-page 去 empty 且有正文）', now());
  } catch (e) {
    log('❌ 导入后未渲染正文：', e.message);
  }
  await snap(page, 'after-import');

  log('\n=== 视图切换 ===');
  for (const [name, val] of [['双页', 'book'], ['滚动', 'scroll']]) {
    try {
      await page.selectOption('#reading-mode', val);
      await sleep(800);
      await snap(page, `mode-${val}`);
      log(`✅ ${name}`);
    } catch (e) {
      log(`❌ ${name}：`, e.message);
    }
  }
  try {
    await page.click('#toggle-panel');
    await sleep(500);
    await snap(page, 'toc');
    log('✅ 目录');
    await page.click('#toggle-panel').catch(() => {});
  } catch (e) {
    log('❌ 目录：', e.message);
  }
  try {
    await page.click('#settings-toggle');
    await sleep(500);
    await snap(page, 'settings');
    log('✅ 设置面板');
  } catch (e) {
    log('❌ 设置面板：', e.message);
  }

  log('\n=== 诊断结束，截图见 store-assets/screenshots/diag-*.png ===');
  await finish(context);
})().catch((e) => {
  // 绝不 process.exit(1)，避免浏览器被强制关掉造成「闪退」观感
  console.error('诊断异常：', e.message, e.stack);
  process.exit(0);
});
