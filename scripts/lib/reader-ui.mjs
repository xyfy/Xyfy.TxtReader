// reader 页面 UI 辅助：关闭首次引导浮层等，供 shots.mjs / diag-shots.mjs 共用。

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 首次运行（全新 profile）会弹出引导浮层（#onboarding-overlay）盖住正文，
// 若不关闭，截图会把这个浮层也拍进去，导致后续图片失真。
// 本函数最多等 5s 看浮层是否出现；出现则点 #onboarding-skip 真正关闭
// （也写回「已引导」状态，避免本会话内反复弹出），兜底则直接加 hidden 隐藏。
export async function ensureOnboardingDismissed(page) {
  const isVisible = () => page.evaluate(() => {
    const o = document.getElementById('onboarding-overlay');
    return !!o && !o.classList.contains('hidden');
  });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await isVisible()) break;
    await sleep(200);
  }
  if (!(await isVisible())) return;
  try {
    await page.click('#onboarding-skip', { timeout: 5000 });
  } catch {
    // 焦点陷阱或按钮不可点时，直接隐藏浮层，保证截图干净
    await page.evaluate(() => {
      document.getElementById('onboarding-overlay')?.classList.add('hidden');
    });
  }
  await sleep(400);
}
