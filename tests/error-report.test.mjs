// FR-C3 可选错误上报开关：TC-C3-01 / TC-C3-02 / TC-C3-03

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  REPORT_FIELDS,
  anonymizeStack,
  assertWithinWhitelist,
  buildReportPayload,
  createErrorReporter,
  detectPlatform,
  sanitizeContext
} from "../modules/error-report.js";

// 模拟"用户数据"：正文、Gist Token、邮箱。这些一律不得出现在上报载荷里。
const SECRET_TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";
const BOOK_TEXT = "第一章 主角站在城墙上，看着远处的烽火台，心里想着这件事终于要结束了。";
const USER_EMAIL = "reader@example.com";

function makeError() {
  const error = new Error("解析失败");
  error.name = "ParseError";
  error.stack = `ParseError: 解析失败
    at importFile (file:///Users/zhangsan/project/reader/reader.js:1700:11)
    at async HTMLInputElement.handleFileSelection (https://xyfy.github.io/reader/reader.js:12:3)`;
  return error;
}

function silenceLogger() {
  return { error() {}, warn() {} };
}

async function run() {
  // TC-C3-01：默认关闭时不得上报
  const sent = [];
  const disabled = createErrorReporter({
    version: "0.5.0",
    platform: "Chrome/141",
    isEnabled: () => false,
    transport: async (payload) => {
      sent.push(payload);
    },
    logger: silenceLogger()
  });

  const offResult = await disabled.report(makeError(), {
    phase: "import",
    token: SECRET_TOKEN,
    text: BOOK_TEXT,
    email: USER_EMAIL
  });

  assert.equal(sent.length, 0, "TC-C3-01 开关关闭时不得调用上报通道");
  assert.equal(offResult.reported, false, "TC-C3-01 关闭时不应标记已上报");
  assert.equal(offResult.reason, "disabled", "TC-C3-01 关闭时应返回 disabled");
  console.log("✓ TC-C3-01 默认关闭不上报");

  // TC-C3-02：开启后只上报匿名技术信息，且不含正文 / Token / PII
  const delivered = [];
  const enabled = createErrorReporter({
    version: "0.5.0",
    platform: "Chrome/141",
    isEnabled: () => true,
    transport: async (payload) => {
      delivered.push(payload);
    },
    logger: silenceLogger()
  });

  const onResult = await enabled.report(makeError(), {
    phase: "import",
    token: SECRET_TOKEN,
    gistToken: SECRET_TOKEN,
    text: BOOK_TEXT,
    email: USER_EMAIL,
    chapterIndex: 3,
    book: { name: "某小说.txt" } // 对象一律不得进入上下文
  });

  assert.equal(onResult.reported, true, "TC-C3-02 开启后应成功上报");
  assert.equal(delivered.length, 1, "TC-C3-02 应恰好上报一次");

  const payload = delivered[0];
  const serialized = JSON.stringify(payload);

  // 字段白名单
  const violations = assertWithinWhitelist(payload);
  assert.deepEqual(violations, [], `载荷出现非白名单字段：${violations.join(", ")}`);
  for (const field of REPORT_FIELDS) {
    assert.ok(field in payload, `载荷缺少必需字段 ${field}`);
  }

  // 严禁出现正文 / Token / PII
  assert.ok(!serialized.includes(SECRET_TOKEN), "TC-C3-02 上报内容含 Gist Token");
  assert.ok(!serialized.includes(USER_EMAIL), "TC-C3-02 上报内容含邮箱（PII）");
  assert.ok(!serialized.includes(BOOK_TEXT), "TC-C3-02 上报内容含正文");
  assert.ok(!serialized.includes("某小说.txt"), "TC-C3-02 上报内容含书名");

  // 上下文清洗：敏感键被丢弃，对象不进入，技术标量保留
  assert.equal(payload.context.phase, "import", "技术性标量应保留");
  assert.equal(payload.context.chapterIndex, 3, "技术性标量应保留");
  assert.equal(payload.context.token, undefined, "token 必须被丢弃");
  assert.equal(payload.context.gistToken, undefined, "gistToken 必须被丢弃");
  assert.equal(payload.context.email, undefined, "email 必须被丢弃");
  assert.equal(payload.context.text, undefined, "正文必须被丢弃");
  assert.equal(payload.context.book, undefined, "对象类型不得进入上下文");
  console.log("✓ TC-C3-02 开启后仅含匿名技术信息，无正文/Token/PII");

  // TC-C3-03：message 与 stack 本身夹带用户数据
  // 业务代码把正文拼进 Error 是真实存在的写法（`throw new Error(\`解析失败：\${text.slice(0,50)}\`)`），
  // 只清洗 context 挡不住这条路径。
  const leakedText = "雨停的时候屋檐下的水珠还在滴";
  const leakedBook = "某本秘密小说";
  const leakedToken = "ghp_SECRETLEAKTOKEN1234567890";
  const leaky = new Error(`解析失败：${leakedText} book=${leakedBook} ${leakedToken}`);
  leaky.stack = [
    `Error: 解析失败：${leakedText} book=${leakedBook} ${leakedToken}`,
    "    at reader.js:1:1",
    "    at https://example.com/u/某些用户名/reader.js:2:3"
  ].join("\n");
  const leakPayload = buildReportPayload({ error: leaky, version: "0.8.0", platform: "Chrome/141" });
  const leakSerialized = JSON.stringify(leakPayload);
  assert.ok(!leakSerialized.includes(leakedText), "TC-C3-03 message/stack 残留正文");
  assert.ok(!leakSerialized.includes(leakedBook), "TC-C3-03 message/stack 残留书名");
  assert.ok(!leakSerialized.includes(leakedToken), "TC-C3-03 message/stack 残留 Token");
  assert.ok(!leakSerialized.includes("某些用户名"), "TC-C3-03 stack 路径残留用户名");
  assert.ok(leakPayload.stack.includes("reader.js"), "TC-C3-03 脱敏后仍需保留可定位的文件名");

  // 原生技术错误必须原样保留，否则上报失去排查价值
  for (const message of [
    "Cannot read properties of undefined (reading 'length')",
    "QUOTA_BYTES_PER_ITEM quota exceeded",
    "Failed to fetch"
  ]) {
    const native = buildReportPayload({ error: new Error(message) });
    assert.equal(native.message, message, `原生技术错误信息不应被改写：${native.message}`);
  }
  console.log("✓ TC-C3-03 message/stack 里的正文、书名、Token 被脱敏，原生技术错误原样保留");

  // 匿名化：路径里的用户名与站点域名必须被抹掉
  const stack = payload.stack;
  assert.ok(!stack.includes("zhangsan"), "调用栈残留了系统用户名");
  assert.ok(!stack.includes("xyfy.github.io"), "调用栈残留了域名");
  assert.ok(stack.includes("reader.js"), "调用栈应保留可定位的文件名");

  // 平台只保留浏览器与大版本，不含完整 UA
  const ua =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
  assert.equal(detectPlatform(ua), "Chrome/141", "平台标识应只含浏览器与大版本");
  assert.equal(detectPlatform(""), "unknown", "空 UA 应回落 unknown");
  assert.ok(!detectPlatform(ua).includes("Macintosh"), "平台标识不得携带系统信息");
  console.log("✓ 平台标识与调用栈已完成匿名化");

  // 未配置端点：开启也不得抛错，退化为本地日志
  const noTransport = createErrorReporter({
    version: "0.5.0",
    platform: "Chrome/141",
    isEnabled: () => true,
    transport: null,
    logger: silenceLogger()
  });
  const noEndpoint = await noTransport.report(makeError(), { phase: "import" });
  assert.equal(noEndpoint.reported, false, "无端点时不应标记已上报");
  assert.equal(noEndpoint.reason, "no-transport", "无端点时应返回 no-transport");
  console.log("✓ 未配置上报端点时安全退化为本地日志");

  // 运输层抛错不得冒泡影响阅读
  const failing = createErrorReporter({
    version: "0.5.0",
    platform: "Chrome/141",
    isEnabled: () => true,
    transport: async () => {
      throw new Error("network down");
    },
    logger: silenceLogger()
  });
  const failed = await failing.report(makeError(), { phase: "import" });
  assert.equal(failed.reported, false, "上报失败不应标记为成功");
  assert.equal(failed.reason, "transport-error", "应返回 transport-error");
  console.log("✓ 上报失败不冒泡，回退本地记录");

  // 载荷构造与上下文清洗的边界
  const bare = buildReportPayload({ error: new Error("boom"), version: "0.5.0", platform: "Edge/141" });
  assert.deepEqual(assertWithinWhitelist(bare), [], "基础载荷应完全落在白名单内");
  assert.equal(bare.type, "uncaught_exception", "错误类型字段应固定");
  assert.equal(typeof bare.timestamp, "number", "时间戳应为数字");

  assert.deepEqual(sanitizeContext(null), {}, "null 上下文应返回空对象");
  assert.deepEqual(sanitizeContext({ a: { nested: true } }), {}, "对象值不得进入上下文");
  assert.equal(anonymizeStack(""), "", "空栈应返回空串");
  console.log("✓ 载荷构造与清洗的边界行为正确");

  // 验收项：隐私政策需说明「上报内容」与「默认关闭」
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const policy = readFileSync(join(projectRoot, "privacy-policy.html"), "utf8");

  for (const marker of ["错误上报", "默认关闭", "匿名错误上报"]) {
    assert.ok(policy.includes(marker), `隐私政策缺少说明：${marker}`);
  }
  // 中英文两版都要写清楚
  assert.ok(policy.includes("Error Reporting"), "隐私政策英文版缺少错误上报章节");
  assert.ok(/Off by default/i.test(policy), "隐私政策英文版未说明默认关闭");
  // 声明不上报的内容要覆盖正文与凭证
  for (const forbidden of ["正文", "Gist Token", "个人信息"]) {
    assert.ok(policy.includes(forbidden), `隐私政策未声明排除项：${forbidden}`);
  }
  console.log("✓ 隐私政策已说明上报内容与默认关闭");

  console.log("error report tests passed (TC-C3-01~03)");
}

run();
