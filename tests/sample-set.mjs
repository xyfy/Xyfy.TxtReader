// v0.6 测试样本集（第二节 9 类样本）的可复现构造器
//
// 两个用途：
//   1. `scripts/gen-test-samples.mjs` 调用它把样本写成真实文件，供手工 P0 用例导入；
//   2. `tests/samples.test.mjs` 调用它在内存里构造同样的字节，直接断言探测/解析结果。
//
// 刻意不引入 iconv 之类的依赖：GBK 编码表用 gb18030 解码器反查得到（见 buildGbkTable），
// 保证任何装了 Node 的机器都能生成一模一样的样本。

const BOM_UTF8 = [0xef, 0xbb, 0xbf];
const BOM_UTF16LE = [0xff, 0xfe];
const BOM_UTF16BE = [0xfe, 0xff];

/** 确定性随机源，保证每次生成的样本字节完全一致 */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHAPTER_TITLES = [
  "起点", "远行", "风声", "旧友", "归途", "暗流", "抉择",
  "长夜", "破晓", "雪落", "渡口", "回声"
];

const SENTENCE_POOL = [
  "城墙上的火把在风里摇晃，把他的影子拉得很长。",
  "远处传来更鼓的声音，三更了，城里却还有人没睡。",
  "他把信折好，塞进贴身的衣袋里，像藏起一件会烫手的东西。",
  "这条街他走过很多次，从没像今天这样觉得它长得走不完。",
  "雨停的时候，屋檐下的水珠还在滴，一滴一滴敲在青石板上。",
  "她没有回头，只是抬手把斗篷的兜帽往上拉了拉。",
  "老船夫坐在船尾抽烟，烟丝的味道被水汽压得很低。",
  "这些都是很多年前的事了，久到连他自己都开始怀疑记错了。",
  "如果这个夜晚能够重来一次，他大概还是会做出同样的选择。",
  "风从缺口灌进来，卷起地上的纸屑，像一群找不到家的蝴蝶。",
  "他想起临行前母亲说的话，那时候他只当是唠叨。",
  "城门在身后合上，发出一声沉闷的响，像是一段日子的结束。"
];

const CN_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 阿拉伯数字转中文数字（够用即可，覆盖到万位） */
function toChineseNumber(value) {
  if (value <= 10) {
    return value === 10 ? "十" : CN_DIGITS[value];
  }
  if (value < 20) {
    return `十${CN_DIGITS[value - 10]}`;
  }
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    return `${CN_DIGITS[tens]}十${ones ? CN_DIGITS[ones] : ""}`;
  }
  if (value < 1000) {
    const hundreds = Math.floor(value / 100);
    const rest = value % 100;
    return `${CN_DIGITS[hundreds]}百${rest ? toChineseNumber(rest) : ""}`;
  }
  const thousands = Math.floor(value / 1000);
  return `${toChineseNumber(thousands)}千${toChineseNumber(value % 1000)}`;
}

/** 生成一段正文：paragraphs 个段落，每段 sentences 句 */
function buildProse({ random, paragraphs, sentences }) {
  const chunks = [];
  for (let p = 0; p < paragraphs; p += 1) {
    const lines = [];
    for (let s = 0; s < sentences; s += 1) {
      lines.push(SENTENCE_POOL[Math.floor(random() * SENTENCE_POOL.length)]);
    }
    chunks.push(lines.join(""));
  }
  return chunks.join("\n\n");
}

/** 带「第X章」标记的正文 */
export function buildNovelText({ chapters = 20, paragraphsPerChapter = 6, sentencesPerParagraph = 8, seed = 20261030 } = {}) {
  const random = createRandom(seed);
  const blocks = [];
  for (let i = 1; i <= chapters; i += 1) {
    const title = `${toChineseNumber(i)}`;
    const name = CHAPTER_TITLES[(i - 1) % CHAPTER_TITLES.length];
    blocks.push(`第${title}章 ${name}`);
    blocks.push(buildProse({ random, paragraphs: paragraphsPerChapter, sentences: sentencesPerParagraph }));
  }
  return blocks.join("\n\n");
}

/** 完全没有章节标记的正文（用于 FR-M3 兜底平铺） */
export function buildFlatText({ paragraphs = 160, sentencesPerParagraph = 10, seed = 424242 } = {}) {
  const random = createRandom(seed);
  return buildProse({ random, paragraphs, sentences: sentencesPerParagraph });
}

/** 超长单段落：> 50 万字符且中间没有换行 */
export function buildLongParagraphText({ minChars = 520000, seed = 777 } = {}) {
  const random = createRandom(seed);
  const parts = [];
  let length = 0;
  // 只保留句号，不出现换行与空行，确保分页器必须自己切
  while (length < minChars) {
    const sentence = SENTENCE_POOL[Math.floor(random() * SENTENCE_POOL.length)];
    parts.push(sentence);
    length += sentence.length;
  }
  return parts.join("");
}

/**
 * 反查 GBK 编码表：扫描全部双字节码位，用 gb18030 解码器建立「字符 → 字节」映射。
 * 只依赖 Node 内置的 TextDecoder，不新增任何依赖。
 */
let gbkTable = null;
function buildGbkTable() {
  if (gbkTable) {
    return gbkTable;
  }
  const decoder = new TextDecoder("gb18030");
  const table = new Map();
  for (let lead = 0x81; lead <= 0xfe; lead += 1) {
    for (let trail = 0x40; trail <= 0xfe; trail += 1) {
      if (trail === 0x7f) {
        continue;
      }
      const bytes = new Uint8Array([lead, trail]);
      const char = decoder.decode(bytes);
      if (char.length === 1 && !table.has(char)) {
        table.set(char, bytes);
      }
    }
  }
  gbkTable = table;
  return table;
}

export function encodeGbk(text) {
  const table = buildGbkTable();
  const bytes = [];
  for (const char of text) {
    const mapped = table.get(char);
    if (mapped) {
      bytes.push(mapped[0], mapped[1]);
      continue;
    }
    const code = char.codePointAt(0);
    if (code < 0x80) {
      bytes.push(code);
      continue;
    }
    throw new Error(`字符无法编码为 GBK：${char}`);
  }
  return Uint8Array.from(bytes);
}

export function encodeUtf16(text, bigEndian = false) {
  const le = Buffer.from(text, "utf16le");
  if (!bigEndian) {
    return Uint8Array.from(le);
  }
  const swapped = Buffer.from(le);
  for (let i = 0; i < swapped.length; i += 2) {
    const tmp = swapped[i];
    swapped[i] = swapped[i + 1];
    swapped[i + 1] = tmp;
  }
  return Uint8Array.from(swapped);
}

function concat(...parts) {
  return Uint8Array.from(parts.flatMap((part) => [...part]));
}

/** 随机字节文件：模拟不可识别的编码 / 非 TXT 文件 */
function buildRandomBytes({ size = 8192, seed = 999 } = {}) {
  const random = createRandom(seed);
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    // 全部落在 0x80~0xFE，确保任何多字节编码都会解出大量替换字符
    bytes[i] = 0x80 + Math.floor(random() * 0x7f);
  }
  return bytes;
}

/**
 * 构造 9 类样本。每项包含：
 *   name        文件名
 *   category    所属类别（对应测试计划第二节）
 *   purpose     用途说明
 *   useCase     关联用例 ID
 *   bytes       样本字节
 *   expect      自动化断言使用的期望值
 *
 * @param {{ scale?: number }} options scale 用于放大「大文件」样本（1 = 100 万字）
 */
export function buildSampleSet({ scale = 1 } = {}) {
  const utf8Encoder = new TextEncoder();

  const smallText = buildNovelText({ chapters: 20 });
  const largeChars = Math.round(1000000 * scale);
  const largeText = buildNovelText({
    chapters: Math.max(20, Math.round(120 * scale)),
    paragraphsPerChapter: 40,
    sentencesPerParagraph: 12,
    seed: 5150
  }).slice(0, largeChars);
  const gbkText = buildNovelText({ chapters: 6, paragraphsPerChapter: 3, sentencesPerParagraph: 4, seed: 31337 });
  const utf16Text = buildNovelText({ chapters: 4, paragraphsPerChapter: 2, sentencesPerParagraph: 3, seed: 606 });
  const flatText = buildFlatText({ paragraphs: 160, sentencesPerParagraph: 10 });
  const longText = buildLongParagraphText();

  return [
    {
      name: "01-small-utf8-nobom.txt",
      category: "小文件",
      purpose: "正常主流程：UTF-8 无 BOM、标准「第X章」结构，< 1 MB",
      useCase: "TC-M3-01 / TC-M1-01 对照",
      bytes: utf8Encoder.encode(smallText),
      expect: { encoding: "utf-8", chapters: 20, isFallback: false, contains: "第一章" }
    },
    {
      name: "02-large-utf8.txt",
      category: "大文件",
      purpose: `大文件性能与稳定性：单文件 ${largeText.length} 字（UTF-8）`,
      useCase: "TC-M1-01 / TC-M1-02 / TC-M4-01",
      bytes: utf8Encoder.encode(largeText),
      expect: { encoding: "utf-8", minChapters: 20, isFallback: false, large: true }
    },
    {
      name: "03-gbk-with-utf8-bom.txt",
      category: "GBK + BOM",
      purpose: "UTF-8 BOM + GBK 正文：BOM 与真实编码不一致，必须回退到 GBK",
      useCase: "TC-M2-01",
      bytes: concat(BOM_UTF8, encodeGbk(gbkText)),
      expect: { encoding: "gb18030", contains: "第一章", noReplacement: true }
    },
    {
      name: "04-gbk-nobom.txt",
      category: "GBK 无 BOM",
      purpose: "GBK 无 BOM：最常见的乱码来源，需靠统计特征识别",
      useCase: "TC-M2-02",
      bytes: encodeGbk(gbkText),
      expect: { encoding: "gb18030", contains: "第一章", noReplacement: true }
    },
    {
      name: "05-utf16le-bom.txt",
      category: "UTF-16 LE + BOM",
      purpose: "UTF-16 小端 + BOM",
      useCase: "TC-M2-03",
      bytes: concat(BOM_UTF16LE, encodeUtf16(utf16Text, false)),
      expect: { encoding: "utf-16le", contains: "第一章", noReplacement: true }
    },
    {
      name: "06-utf16be-bom.txt",
      category: "UTF-16 BE + BOM",
      purpose: "UTF-16 大端 + BOM",
      useCase: "TC-M2-03",
      bytes: concat(BOM_UTF16BE, encodeUtf16(utf16Text, true)),
      expect: { encoding: "utf-16be", contains: "第一章", noReplacement: true }
    },
    {
      name: "07-utf8-bom.txt",
      category: "UTF-8 + BOM",
      purpose: "UTF-8 含 BOM：BOM 应被剥离，正文不出现 BOM 字符",
      useCase: "TC-M2-01 对照",
      bytes: concat(BOM_UTF8, utf8Encoder.encode(gbkText)),
      expect: { encoding: "utf-8", contains: "第一章", noBom: true }
    },
    {
      name: "08-no-chapters.txt",
      category: "无章节标记",
      purpose: "通篇没有章节标记：应走平铺兜底，且不切断段落",
      useCase: "TC-M3-02",
      bytes: utf8Encoder.encode(flatText),
      expect: { encoding: "utf-8", isFallback: true, minChapters: 2 }
    },
    {
      name: "09-long-paragraph.txt",
      category: "超长单段落",
      purpose: `单段落 ${longText.length} 字符、无换行无空行，用于验证分页不溢出`,
      useCase: "TC-M4-04",
      bytes: utf8Encoder.encode(longText),
      expect: { encoding: "utf-8", isFallback: true, longParagraph: true }
    },
    {
      name: "10-corrupt-bytes.bin",
      category: "损坏 / 非 TXT",
      purpose: "高熵随机字节：任何编码都无法还原，应提示手动选择编码",
      useCase: "TC-M2-04 / TC-M4-03",
      bytes: buildRandomBytes({ size: 8192 }),
      expect: { needsManual: true }
    },
    {
      name: "11-empty.txt",
      category: "空文件",
      purpose: "0 字节：应进入空文件错误态而非崩溃",
      useCase: "TC-M4-02 / TC-M4-03",
      bytes: new Uint8Array(0),
      expect: { empty: true }
    }
  ];
}
