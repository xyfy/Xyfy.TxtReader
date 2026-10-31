// FR-C3 可选错误上报开关
//
// 三条硬约束（对应 PRD 与隐私政策）：
//   1. 默认关闭：未开启时不上报，只在本地留日志兜底
//   2. 只上报匿名技术信息：版本、平台、错误类型、匿名栈、时间戳
//   3. 绝不包含正文、Gist Token 或任何 PII
//
// 上报端点是可选的（PRD：v0.6 可仅本地日志）。没有配置 transport 时，
// 即使开关打开了也只是本地记录，不会因为缺端点而抛错。

/** 白名单：payload 只允许出现这些字段（context 经清洗后附加） */
export const REPORT_FIELDS = ["version", "platform", "type", "name", "message", "stack", "timestamp"];

/**
 * context 采用「键名白名单」而非黑名单：只放行下面这些技术性字段。
 * 黑名单不可靠——正文、书名等随便换个键名就能漏出去。
 */
export const CONTEXT_FIELDS = [
  "phase",
  "stage",
  "action",
  "feature",
  "source",
  "surface",
  "encoding",
  "chapterIndex",
  "pageIndex"
];

/**
 * context 的字符串值也必须落在这个模式里：仅 ASCII 标识符字符。
 * 中文正文、书名、路径都会因为含非 ASCII 字符而被直接丢弃。
 */
const SAFE_CONTEXT_VALUE = /^[A-Za-z0-9_\-./]{1,64}$/;

const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 2000;
const MAX_STACK_LINES = 12;
const MAX_CONTEXT_ENTRIES = 20;
const MAX_CONTEXT_VALUE_LENGTH = 64;

// 中文（含中日韩统一表意文字、扩展 A、兼容区）与常见全角标点。
// 这些字符在「技术性错误信息」里几乎不会出现，一旦出现基本就是用户数据混进来了。
const CJK_TEXT = /[\u3000-\u303F\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/g;

// 常见凭证形态：ghp_ / github_pat_ / gho_ / gist / Bearer / AKIA 等
const SECRET_PATTERN = /\b(?:gh[pousr]_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,}|AKIA[0-9A-Z]{12,}|Bearer\s+[A-Za-z0-9._-]{8,})\b/g;

// 邮箱与「book=xxx」「gist=xxx」这类键值片段
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const KV_SECRET_PATTERN = /\b(?:book|title|text|content|gist|token|password|secret|email)\s*[=:]\s*[^\s,;]+/gi;

/**
 * 清理自由文本（错误 message / stack 首行）。
 *
 * 原生错误（`Cannot read properties of undefined`、`QuotaExceededError` 等）原样保留；
 * 一旦文本里混进中文明文、token、邮箱或 `book=书名` 这类片段，说明业务代码把用户数据
 * 拼进了错误信息——这时候整段抹掉比逐字打码可靠。
 */
export function redactFreeText(value = "") {
  return String(value || "")
    .replace(SECRET_PATTERN, "[redacted-token]")
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(KV_SECRET_PATTERN, "[redacted]")
    .replace(CJK_TEXT, "[redacted-text]")
    .replace(/\[redacted-text\](?:\s*\[redacted-text\])+/g, "[redacted-text]")
    .trim();
}

/** 只保留浏览器名与大版本号，不保留完整 UA（避免指纹化，也避免携带系统细节） */
export function detectPlatform(userAgent = "") {
  const match = /(Edg|Chrome|Firefox|Safari)\/(\d+)/.exec(userAgent || "");
  if (!match) {
    return "unknown";
  }
  const browser = match[1] === "Edg" ? "Edge" : match[1];
  return `${browser}/${match[2]}`;
}

/**
 * 匿名化调用栈：抹掉绝对路径里的用户名与站点域名，保留文件名与行列号
 * （行列号用于定位，不含个人信息）。
 */
export function anonymizeStack(stack = "") {
  return String(stack || "")
    .split("\n")
    .slice(0, MAX_STACK_LINES)
    .map((line) => {
      const cleaned = line
        // 先去掉协议头，剩下的按普通路径处理，才能抹掉 home 目录里的用户名
        .replace(/file:\/\/(?=\/)/g, "")
        .replace(/https?:\/\/[^\s/)]+/g, "")
        .replace(/[a-zA-Z]:\\[^\s)]*\\/g, "")
        .replace(/\/(?:Users|home)\/[^/\s:)]+/g, "/~");
      // 首行是 `Error: <message>`，和 message 字段一样可能夹带用户数据；
      // 其余行里的 URI 路径也可能含用户名或书名字符，同样走一遍脱敏。
      return redactFreeText(cleaned);
    })
    .join("\n")
    .slice(0, MAX_STACK_LENGTH);
}

const ALLOWED_CONTEXT_KEYS = new Set(CONTEXT_FIELDS);

/**
 * 清洗上下文：键名白名单 + 值形态校验双重过滤。
 *
 * - 不在 CONTEXT_FIELDS 里的键一律丢弃（含正文、书名、Token、邮箱等任意业务数据）；
 * - 放行键的值也必须是有限数字、布尔，或纯 ASCII 的短标识符；
 * - 对象与数组天然不满足上述条件，自动被排除。
 */
export function sanitizeContext(context = {}) {
  const safe = {};
  let count = 0;

  for (const [key, value] of Object.entries(context || {})) {
    if (count >= MAX_CONTEXT_ENTRIES) {
      break;
    }
    if (!ALLOWED_CONTEXT_KEYS.has(key)) {
      continue;
    }
    if (typeof value === "boolean") {
      safe[key] = value;
      count += 1;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      safe[key] = value;
      count += 1;
      continue;
    }
    if (
      typeof value === "string" &&
      value.length <= MAX_CONTEXT_VALUE_LENGTH &&
      SAFE_CONTEXT_VALUE.test(value)
    ) {
      safe[key] = value;
      count += 1;
    }
  }

  return safe;
}

/** 构造上报载荷。字段严格限定在白名单内，message 与 stack 都做了截断与匿名化。 */
export function buildReportPayload({
  error,
  version = "unknown",
  platform = "unknown",
  context = {},
  timestamp = Date.now()
} = {}) {
  // message 与 stack 是自由文本，业务代码把正文 / 书名拼进 Error 的情况真实存在
  // （例如 `throw new Error(\`解析失败：\${text.slice(0,50)}\`)`）。
  // 这两处必须和 context 一样做脱敏，否则「绝不含正文」的承诺就只是纸面上的。
  return {
    version: String(version),
    platform: String(platform),
    type: "uncaught_exception",
    name: redactFreeText(error?.name || "Error").slice(0, 64) || "Error",
    message: redactFreeText(error?.message || "").slice(0, MAX_MESSAGE_LENGTH),
    stack: anonymizeStack(error?.stack),
    timestamp,
    context: sanitizeContext(context)
  };
}

/** 校验载荷字段是否越出白名单（测试与运行时自检共用） */
export function assertWithinWhitelist(payload) {
  const allowed = new Set([...REPORT_FIELDS, "context"]);
  const violations = Object.keys(payload || {}).filter((key) => !allowed.has(key));
  return violations;
}

/**
 * 创建上报器。
 * @param {object} options
 * @param {string} options.version 应用版本
 * @param {string} options.platform 平台标识
 * @param {() => boolean} options.isEnabled 读取开关（默认关闭）
 * @param {((payload: object) => Promise<void>)|null} options.transport 上报通道，未配置则仅本地日志
 * @param {object} [options.logger] 本地日志兜底，默认 console
 */
export function createErrorReporter({
  version = "unknown",
  platform = "unknown",
  isEnabled = () => false,
  transport = null,
  logger = console
} = {}) {
  return {
    async report(error, context = {}) {
      const payload = buildReportPayload({ error, version, platform, context });

      // FR-C3 / TC-C3-01：开关关闭时不得上报，只留本地日志
      if (!isEnabled()) {
        logger?.error?.("[Xyfy.TxtReader] 异常已本地记录（错误上报已关闭）", payload);
        return { reported: false, reason: "disabled", payload };
      }

      // 未配置端点时不报错，退化为本地记录（PRD：v0.6 可仅本地日志）
      if (typeof transport !== "function") {
        logger?.error?.("[Xyfy.TxtReader] 未配置上报端点，异常仅本地记录", payload);
        return { reported: false, reason: "no-transport", payload };
      }

      const violations = assertWithinWhitelist(payload);
      if (violations.length) {
        logger?.warn?.("[Xyfy.TxtReader] 上报载荷含非白名单字段，已拒绝发送", violations);
        return { reported: false, reason: "whitelist-violation", payload };
      }

      try {
        await transport(payload);
        return { reported: true, reason: "sent", payload };
      } catch (transportError) {
        logger?.warn?.("[Xyfy.TxtReader] 上报失败，已回退本地记录", transportError);
        return { reported: false, reason: "transport-error", payload };
      }
    }
  };
}
