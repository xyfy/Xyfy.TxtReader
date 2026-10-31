// 可靠地找出 --load-extension 加载的扩展 ID。
//
// 之前脚本靠「扫描 Default/Extensions/<id>/<ver>/manifest.json」判断扩展是否加载，
// 但卸载包扩展的文件复制到该目录可能延迟、或在部分 Chrome/macOS 构建下不落盘，
// 导致扩展其实已加载却被误报「未加载」而退出。
//
// 现改为三层探测，任一命中即返回：
//   1) CDP Target.getTargets —— 扩展有 service_worker/background 时出现
//      `chrome-extension://<id>/...` target，最稳、不依赖磁盘落盘。
//   2) Default/Preferences —— extensions.settings 里 path 等于 EXT 的条目。
//   3) Default/Extensions 目录扫描 manifest.json（最后回退）。

import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function norm(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

// 1) CDP：轮询浏览器所有 target，找 chrome-extension:// URL 提取 id
async function fromCDP(context) {
  let page;
  try {
    page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    for (let i = 0; i < 40; i++) {
      const { targetInfos } = await cdp.send('Target.getTargets');
      for (const t of targetInfos || []) {
        const u = t.url || '';
        const m = u.match(/^chrome-extension:\/\/([a-z0-9]+)\//i);
        if (m) return m[1].toLowerCase();
      }
      await sleep(500);
    }
  } catch {
    /* CDP 不可用则忽略，走回退 */
  } finally {
    if (page) await page.close().catch(() => {});
  }
  return null;
}

// 2) Default/Preferences：extensions.settings[].path 匹配 EXT 目录
function fromPreferences(profile, extDir) {
  const p = path.join(profile, 'Default', 'Preferences');
  if (!fs.existsSync(p)) return null;
  try {
    const json = JSON.parse(fs.readFileSync(p, 'utf8'));
    const settings = json?.extensions?.settings || {};
    const want = norm(extDir);
    for (const [id, v] of Object.entries(settings)) {
      if (v && v.path && norm(v.path) === want) return id.toLowerCase();
    }
  } catch {
    /* JSON 解析失败忽略 */
  }
  return null;
}

// 3) 磁盘扫描 Default/Extensions 目录（最后回退）
function fromDisk(profile) {
  const base = path.join(profile, 'Default', 'Extensions');
  if (!fs.existsSync(base)) return null;
  try {
    for (const id of fs.readdirSync(base)) {
      const verDir = path.join(base, id);
      if (!fs.statSync(verDir).isDirectory()) continue;
      for (const ver of fs.readdirSync(verDir)) {
        if (fs.existsSync(path.join(verDir, ver, 'manifest.json'))) return id.toLowerCase();
      }
    }
  } catch {
    /* 忽略 */
  }
  return null;
}

export async function findExtensionId(context, profile, extDir) {
  // CDP 一次性轮询（同时给磁盘/Preferences 留出写入时间）
  const a = await fromCDP(context);
  if (a) return a;
  for (let i = 0; i < 40; i++) {
    const b = fromPreferences(profile, extDir);
    if (b) return b;
    const c = fromDisk(profile);
    if (c) return c;
    await sleep(500);
  }
  return null;
}
