// FR-M2 编码兼容与防乱码
//
// TXT 来源杂乱：网络下载的小说可能是 UTF-8 / UTF-16 / GBK / GB2312 / Big5，
// 有些还带 BOM，有些 BOM 与真实编码不一致（例如 UTF-8 BOM + GBK 正文）。
// 这里做三件事：
//   1. BOM 优先探测，但 BOM 解码失败时剥离 BOM 并回退启发式（避免「带 BOM 的 GBK」乱码）
//   2. UTF-16 LE/BE 支持（有 BOM 与无 BOM 两种）
//   3. 无法可靠识别时明确返回 needsManual，由界面提示并允许手动选编码

/** 界面「手动选择编码」下拉可列出的候选编码 */
export const SUPPORTED_ENCODINGS = [
  "utf-8",
  "utf-16le",
  "utf-16be",
  "gb18030",
  "gbk",
  "gb2312",
  "big5"
];

/** 参与自动探测的候选（gb18030 覆盖 gbk/gb2312，探测阶段不必重复） */
const PROBE_ENCODINGS = ["utf-8", "utf-16le", "utf-16be", "gb18030", "big5"];

const BOM_SIGNATURES = [
  { encoding: "utf-8", bom: "utf-8", bytes: [0xef, 0xbb, 0xbf] },
  // FF FE 是 UTF-16LE；FE FF 是 UTF-16BE。顺序不可颠倒。
  { encoding: "utf-16le", bom: "utf-16le", bytes: [0xff, 0xfe] },
  { encoding: "utf-16be", bom: "utf-16be", bytes: [0xfe, 0xff] }
];

// 计分用的可读字符集合：CJK、常用中英标点、字母数字
const READABLE_PATTERN =
  /[\u4e00-\u9fff\u3040-\u30ffA-Za-z0-9，。！？；：“”‘’、,.!?;:()《》【】\s'-]/g;
const REPLACEMENT_PATTERN = /�/g;
const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

/** 低于该归一化分数视为「不可靠」，需要提示用户手动选择 */
const RELIABLE_SCORE_THRESHOLD = 0.3;
/** 替换字符占比超过该值视为解码失败 */
const MAX_REPLACEMENT_RATIO = 0.02;

// GB18030 几乎能把任意字节解成汉字，所以「看起来是汉字」不等于「解码正确」。
// 真实中文的高频字占比约 0.2~0.4，而随机字节解出的是一片生僻字（实测 0.00），
// 用这个差距可以把「乱码汉字串」识别出来。
const COMMON_CHINESE = new Set(
  "的一是不了人我在有他这为之大来以个中上们到说国和地也子时道出而要于就下得可你年生自会那后能对着事其里所去行过家十用发天如然作方成者多日都三小军二无同么经法当起与好看学进种将还分此心前面又定见只主没公从她它很最太给开间因些点位被把但两做接场信关知走".split("")
);
/** CJK 占比低于该值视为西文文本，不套用常用字判据（英文小说不能被误判） */
const CJK_TEXT_THRESHOLD = 0.1;
/** 中文文本常用字占比低于该值视为乱码 */
const MIN_COMMON_RATIO = 0.06;
const CJK_PATTERN = /[\u4e00-\u9fff]/g;

function toBytes(buffer) {
  if (buffer instanceof Uint8Array) {
    return buffer;
  }
  if (ArrayBuffer.isView(buffer)) {
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  return new Uint8Array(buffer);
}

function startsWith(bytes, signature) {
  if (bytes.length < signature.length) {
    return false;
  }
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[i] !== signature[i]) {
      return false;
    }
  }
  return true;
}

export function detectBom(buffer) {
  const bytes = toBytes(buffer);
  for (const signature of BOM_SIGNATURES) {
    if (startsWith(bytes, signature.bytes)) {
      return { encoding: signature.encoding, bom: signature.bom, length: signature.bytes.length };
    }
  }
  return null;
}

function stripBom(bytes, bomLength) {
  return bomLength ? bytes.subarray(bomLength) : bytes;
}

/**
 * 无 BOM 的 UTF-16 启发式：
 * UTF-16LE 的 ASCII/常用汉字在奇数下标出现 0x00；UTF-16BE 则在偶数下标。
 */
function detectUtf16WithoutBom(bytes) {
  if (bytes.length < 2 || bytes.length % 2 === 1) {
    return null;
  }

  let evenNull = 0;
  let oddNull = 0;
  const pairs = Math.floor(bytes.length / 2);
  for (let i = 0; i < pairs; i += 1) {
    if (bytes[i * 2] === 0) {
      evenNull += 1;
    }
    if (bytes[i * 2 + 1] === 0) {
      oddNull += 1;
    }
  }

  const evenRatio = evenNull / pairs;
  const oddRatio = oddNull / pairs;

  if (evenRatio > 0.6 && evenRatio > oddRatio) {
    return { encoding: "utf-16be", confidence: "medium" };
  }
  if (oddRatio > 0.6 && oddRatio > evenRatio) {
    return { encoding: "utf-16le", confidence: "medium" };
  }
  return null;
}

function scoreDecodedText(text) {
  if (!text.length) {
    return { score: 0, replacementRatio: 0, commonRatio: 0, cjkRatio: 0 };
  }

  const readable = (text.match(READABLE_PATTERN) || []).length;
  const replacement = (text.match(REPLACEMENT_PATTERN) || []).length;
  const control = (text.match(CONTROL_PATTERN) || []).length;
  const cjk = (text.match(CJK_PATTERN) || []).length;

  let common = 0;
  for (const char of text) {
    if (COMMON_CHINESE.has(char)) {
      common += 1;
    }
  }

  const score = (readable - replacement * 20 - control * 10) / text.length;
  return {
    score,
    replacementRatio: replacement / text.length,
    commonRatio: common / text.length,
    cjkRatio: cjk / text.length
  };
}

/**
 * 判断一次解码结果是否可靠。
 * 只有「像中文」的文本（CJK 占比够高）才套用常用字判据，避免英文小说被误判。
 */
function isDecodingReliable({ score, replacementRatio, commonRatio, cjkRatio }) {
  if (score < RELIABLE_SCORE_THRESHOLD || replacementRatio > MAX_REPLACEMENT_RATIO) {
    return false;
  }

  const looksChinese = cjkRatio >= CJK_TEXT_THRESHOLD;
  if (looksChinese && commonRatio < MIN_COMMON_RATIO) {
    return false;
  }

  return true;
}

function tryDecode(bytes, encoding) {
  try {
    // fatal:false 保证不抛异常，再由评分体系挑最优解
    return new TextDecoder(encoding, { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

function isStrictlyValidUtf8(bytes) {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * 探测字节流编码。
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {{ encoding: string, bom: string|null, confidence: string, needsManual: boolean,
 *             score: number, replacementRatio: number, candidates: string[] }}
 */
export function detectEncoding(buffer) {
  const bytes = toBytes(buffer);
  const candidates = [...SUPPORTED_ENCODINGS];

  if (!bytes.length) {
    return {
      encoding: "utf-8",
      bom: null,
      confidence: "high",
      needsManual: false,
      score: 0,
      replacementRatio: 0,
      candidates
    };
  }

  const bom = detectBom(bytes);
  const payload = stripBom(bytes, bom ? bom.length : 0);

  // 1) BOM 命中且能干净解码 → 直接采信
  if (bom) {
    const text = tryDecode(payload, bom.encoding);
    if (text !== null) {
      const measured = scoreDecodedText(text);
      if (isDecodingReliable(measured)) {
        return {
          encoding: bom.encoding,
          bom: bom.bom,
          confidence: "high",
          needsManual: false,
          score: measured.score,
          replacementRatio: measured.replacementRatio,
          candidates
        };
      }
    }
    // BOM 与实际内容不符（典型：UTF-8 BOM + GBK 正文）→ 继续走启发式
  }

  // 2) 无 BOM 的 UTF-16
  if (!bom) {
    const utf16 = detectUtf16WithoutBom(bytes);
    if (utf16) {
      const text = tryDecode(bytes, utf16.encoding) || "";
      const measured = scoreDecodedText(text);
      const reliable = isDecodingReliable(measured);
      return {
        encoding: utf16.encoding,
        bom: null,
        confidence: reliable ? utf16.confidence : "low",
        needsManual: !reliable,
        score: measured.score,
        replacementRatio: measured.replacementRatio,
        candidates
      };
    }
  }

  // 3) 严格 UTF-8 校验通过 → 高置信度采信（纯 ASCII 与中文 UTF-8 都走这里）
  if (isStrictlyValidUtf8(payload)) {
    const text = tryDecode(payload, "utf-8") || "";
    const { score, replacementRatio } = scoreDecodedText(text);
    return {
      encoding: "utf-8",
      bom: bom ? bom.bom : null,
      confidence: "high",
      needsManual: false,
      score,
      replacementRatio,
      candidates
    };
  }

  // 4) 多编码评分，取最优（GBK/GB2312 由 gb18030 覆盖）
  let best = null;
  for (const encoding of PROBE_ENCODINGS) {
    const text = tryDecode(payload, encoding);
    if (text === null) {
      continue;
    }
    const measured = scoreDecodedText(text);
    if (!best || measured.score > best.score) {
      best = { encoding, text, ...measured };
    }
  }

  if (!best) {
    return {
      encoding: "utf-8",
      bom: bom ? bom.bom : null,
      confidence: "low",
      needsManual: true,
      score: 0,
      replacementRatio: 1,
      candidates
    };
  }

  const needsManual = !isDecodingReliable(best);

  return {
    encoding: best.encoding,
    bom: bom ? bom.bom : null,
    confidence: needsManual ? "low" : "medium",
    needsManual,
    score: best.score,
    replacementRatio: best.replacementRatio,
    candidates
  };
}

/**
 * 按指定编码解码（手动选择入口）。未知编码回退到 gb18030 而非抛错，
 * 保证界面永远拿得到可读文本或空串。
 */
export function decodeWithEncoding(buffer, encoding) {
  const bytes = toBytes(buffer);
  const bom = detectBom(bytes);
  const payload = stripBom(bytes, bom ? bom.length : 0);
  const text = tryDecode(payload, encoding) ?? tryDecode(payload, "gb18030") ?? "";
  return text.replace(/\u0000/g, "");
}

/**
 * 一次性探测 + 解码。
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {string} [preferredEncoding] 手动指定的编码，指定时跳过探测
 */
export function decodeBuffer(buffer, preferredEncoding = null) {
  if (preferredEncoding) {
    return {
      text: decodeWithEncoding(buffer, preferredEncoding),
      encoding: preferredEncoding,
      bom: detectBom(toBytes(buffer))?.bom ?? null,
      confidence: "manual",
      needsManual: false,
      candidates: [...SUPPORTED_ENCODINGS]
    };
  }

  const detection = detectEncoding(buffer);
  return {
    ...detection,
    text: decodeWithEncoding(buffer, detection.encoding)
  };
}
