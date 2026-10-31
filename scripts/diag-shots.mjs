// 诊断脚本：只检查「扩展能否被 Playwright 的 Chromium 加载」，不截图。
// 用法：DEBUG=pw:browser node scripts/diag-shots.mjs 2>&1 | head -80
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const EXT = process.cwd();
const PROFILE = path.join(EXT, '.shot-profile-diag');
fs.rmSync(PROFILE, { recursive: true, force: true });

console.log('=== 基础信息 ===');
console.log('EXT(cwd) =', EXT);
console.log('manifest.json 存在 =', fs.existsSync(path.join(EXT, 'manifest.json')));
console.log('PROFILE =', PROFILE);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listExtDir() {
  const base = path.join(PROFILE, 'Default/Extensions');
  if (!fs.existsSync(base)) return '  [Default/Extensions 不存在]';
  const out = [];
  for (const id of fs.readdirSync(base)) {
    const verDir = path.join(base, id);
    for (const ver of fs.readdirSync(verDir)) {
      const m = path.join(verDir, ver, 'manifest.json');
      out.push(`  ${id} / ${ver} / manifest=${fs.existsSync(m)}`);
    }
  }
  return out.join('\n') || '  [空]';
}

(async () => {
  console.log('\n=== 启动 Chromium（headless:false, 加载扩展）===');
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
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
  console.log('  已启动, 等待扩展落盘…');

  let extId = null;
  for (let i = 0; i < 24; i++) {
    const base = path.join(PROFILE, 'Default/Extensions');
    if (fs.existsSync(base)) {
      for (const id of fs.readdirSync(base)) {
        const verDir = path.join(base, id);
        for (const ver of fs.readdirSync(verDir)) {
          if (fs.existsSync(path.join(verDir, ver, 'manifest.json'))) extId = id;
        }
      }
    }
    if (extId) break;
    await sleep(500);
  }

  console.log('\n=== Default/Extensions 目录内容 ===');
  console.log(listExtDir());
  console.log('\n=== 扩展 ID =', extId || '(未找到) ===');

  const page = await context.newPage();
  console.log('\n=== chrome://extensions 页面文本（前 1500 字）===');
  try {
    await page.goto('chrome://extensions', { timeout: 10000 });
    await sleep(2500);
    const txt = await page.evaluate(() => document.body.innerText);
    console.log(txt.slice(0, 1500) || '(空)');
  } catch (e) {
    console.log('  读取失败：', e.message);
  }

  console.log('\n=== chrome://version 关键字段 ===');
  try {
    await page.goto('chrome://version', { timeout: 10000 });
    await sleep(1500);
    const txt = await page.evaluate(() => document.body.innerText);
    for (const line of txt.split('\n')) {
      if (/Executable|Profile|User.?agent|OS |Platform|Revision/i.test(line)) console.log('  ' + line);
    }
  } catch (e) {
    console.log('  读取失败：', e.message);
  }

  await context.close();
  fs.rmSync(PROFILE, { recursive: true, force: true });
  console.log('\n=== 诊断结束 ===');
})().catch((e) => {
  console.error('诊断异常：', e.message);
  process.exit(1);
});
