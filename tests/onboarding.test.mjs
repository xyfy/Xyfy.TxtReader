// FR-S1 首次引导与默认值：TC-S1-01 / TC-S1-02
import assert from "node:assert/strict";
import { getDefaultSettings, normalizeStoredSettings } from "../modules/storage.js";
import {
  ONBOARDING_STEPS,
  ONBOARDING_VERSION,
  applyRecommendation,
  getStep,
  markOnboardingDone,
  nextStepIndex,
  recommendDefaults,
  shouldShowOnboarding
} from "../modules/onboarding.js";

// --- TC-S1-01 首次引导的展示与落盘 ---
{
  const defaults = getDefaultSettings();

  assert.equal(
    shouldShowOnboarding({ settings: defaults, bookCount: 0 }),
    true,
    "全新用户（无书、未完成引导）应看到引导"
  );
  assert.equal(
    shouldShowOnboarding({ settings: defaults, bookCount: 3 }),
    false,
    "已有书的用户不该再被引导挡住"
  );

  // 跳过 = 已看过，必须同样不再出现
  const skipped = markOnboardingDone(defaults, { skipped: true, now: 1700000000000 });
  assert.equal(skipped.onboardingDone, true, "跳过后应标记完成");
  assert.equal(skipped.onboardingSkipped, true, "跳过应被记录，便于后续分析引导是否形同虚设");
  assert.equal(skipped.onboardingVersion, ONBOARDING_VERSION, "应记录看过的引导版本");
  assert.equal(skipped.onboardingCompletedAt, 1700000000000, "应记录完成时间");
  assert.equal(shouldShowOnboarding({ settings: skipped, bookCount: 0 }), false, "跳过后的用户刷新不应再出现引导");

  // 旧设置（根本没有 onboarding 字段）也要能正确判定为「新用户」
  const legacy = normalizeStoredSettings({ theme: "night", fontSize: 22 }, 1);
  assert.equal(legacy.onboardingDone, false, "旧设置补全后 onboardingDone 应为 false");
  assert.equal(shouldShowOnboarding({ settings: legacy, bookCount: 0 }), true, "旧设置且无书应看到引导");

  // 已完成但引导版本更旧 → 允许再展示一次（为将来内容大改留口子）
  const outdated = { ...defaults, onboardingDone: true, onboardingVersion: ONBOARDING_VERSION - 1 };
  assert.equal(
    shouldShowOnboarding({ settings: outdated, bookCount: 0 }),
    false,
    "onboardingDone 为真时即使版本旧也不再打扰（版本升级需显式重置 onboardingDone）"
  );

  // 步骤导航：越界夹紧，不回绕
  assert.equal(ONBOARDING_STEPS.length, 3, "引导应为 3 步");
  assert.equal(getStep(0).isLast, false);
  assert.equal(getStep(2).isLast, true, "第 3 步应是最后一步");
  assert.equal(getStep(99).index, 2, "越界索引应夹紧到最后一步");
  assert.equal(getStep(-5).index, 0, "负索引应夹紧到第一步");
  assert.equal(nextStepIndex(2), 2, "最后一步再点下一步应停在原地");

  console.log("✓ TC-S1-01 引导展示条件、跳过落盘与步骤导航正确");
}

// --- TC-S1-02 默认值推荐 ---
{
  const compact = recommendDefaults({ viewportWidth: 480, viewportHeight: 800, coarsePointer: true });
  assert.equal(compact.pagesPerView, 1, "窄屏必须单页");
  assert.ok(compact.fontSize <= 18, `窄屏字号不应放大：${compact.fontSize}`);
  assert.ok(compact.lineHeight >= 1.9, `触屏窄屏行距应更松：${compact.lineHeight}`);

  const wide = recommendDefaults({ viewportWidth: 1600, viewportHeight: 900 });
  assert.equal(wide.pagesPerView, 2, "宽屏应双页");
  assert.ok(wide.fontSize >= 20, `宽屏字号应放大：${wide.fontSize}`);

  const medium = recommendDefaults({ viewportWidth: 900, viewportHeight: 700 });
  assert.equal(medium.pagesPerView, 1, "900px 宽不足以并排两页");

  const tablet = recommendDefaults({ viewportWidth: 1100, viewportHeight: 800 });
  assert.equal(tablet.pagesPerView, 2, "1100px 宽可以并排两页");

  // 横屏手机：矮视口回退字号，避免正文被压成两行
  const shortViewport = recommendDefaults({ viewportWidth: 900, viewportHeight: 400 });
  assert.ok(shortViewport.fontSize < 18, `矮视口字号应回退：${shortViewport.fontSize}`);

  // 推荐值应用：未调过版式才生效
  const defaults = getDefaultSettings();
  const applied = applyRecommendation(defaults, wide, { tuned: false });
  assert.equal(applied.fontSize, wide.fontSize, "未调过版式的用户应接受推荐字号");
  assert.equal(applied.lineHeight, wide.lineHeight, "应接受推荐行高");
  assert.equal(
    Object.hasOwn(applied, "pagesPerView"),
    false,
    "单页/双页由实时视口决定，不应落盘（否则窗口拉窄会卡住）"
  );
  assert.equal(defaults.fontSize, 18, "applyRecommendation 不应改动入参（不可变）");

  const tuned = applyRecommendation({ ...defaults, fontSize: 26 }, wide, { tuned: true });
  assert.equal(tuned.fontSize, 26, "用户手动调过版式后不得覆盖其字号");

  // 推荐值必须落在 UI 控件合法区间内，否则滑块会显示成边界值
  for (const width of [360, 480, 720, 1024, 1280, 1920, 3840]) {
    const rec = recommendDefaults({ viewportWidth: width });
    assert.ok(rec.fontSize >= 14 && rec.fontSize <= 28, `${width}px 推荐字号超出滑块区间：${rec.fontSize}`);
    assert.ok([1, 2].includes(rec.pagesPerView), `${width}px 推荐页数非法：${rec.pagesPerView}`);
  }

  console.log("✓ TC-S1-02 设备自适应推荐正确，且不覆盖用户已调好的版式");
}

console.log("onboarding tests passed (TC-S1-01~02)");
