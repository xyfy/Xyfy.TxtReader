// FR-M3 章节识别与无目录书兜底
//
// 两类输入：
//   1. 有章节标记的小说（"第X章"、"Chapter 1"）→ 按标题行精确切分
//   2. 完全没有章节标记的小说 → 整本按段落边界平铺，并标记 isFallback 供界面提示
//
// 标题行识别的三条硬约束（都是踩过的坑）：
//   - 必须是独占一行：^...$ 配合 m 标志，避免正文长句被误判成标题
//   - 必须够短：超长"标题"基本都是误命中
//   - 章节号后必须紧跟分隔（空格 / 标点 / 行尾）：真人小说常把正文粘在章节号后面，
//     例如「第3章 他走了很久，直到天亮」，若只按行尾长度卡，这种行会整行变成目录项，
//     几十万字的书能切出两万多"章"，目录渲染直接卡死。

const MAX_TITLE_LENGTH = 60;
const LEADING_SPACE = "[ \\t\\u3000]*";
const FALLBACK_CHUNK_SIZE = 12000;
// 章节号之后的合法延续：直接结束、空白或常见分隔符。
// 用前瞻而非消费，章节号本身仍是匹配的一部分。
const TITLE_TAIL = "(?=$|[ \\t\\u3000:：、.·—\\-|｜_（(【\\[「])";

const CHAPTER_PATTERNS = [
  // 第X章 / 第X节 / 第X回 / 第X卷 / 第X部 / 第X篇（中文数字或阿拉伯数字）
  new RegExp(
    `^${LEADING_SPACE}(第[零一二三四五六七八九十百千万亿两\\d]{1,12}[章节回卷部节篇])${TITLE_TAIL}[^\\n]{0,${MAX_TITLE_LENGTH}}$`,
    "gm"
  ),
  // 序章 / 楔子 / 尾声 等常见非编号标题
  new RegExp(
    `^${LEADING_SPACE}(序章|序言|楔子|引子|尾声|终章|番外|后记|自序|简介)${TITLE_TAIL}[^\\n]{0,${MAX_TITLE_LENGTH}}$`,
    "gm"
  ),
  // Chapter 1 / Part II / Section 3（英文与罗马数字）
  new RegExp(
    `^${LEADING_SPACE}(chapter|part|section)\\s+([0-9]+|[ivxlcIVXLC]+)${TITLE_TAIL}[^\\n]{0,${MAX_TITLE_LENGTH}}$`,
    "gim"
  )
];

// 这些正则带 g 标志且是模块级共享实例，lastIndex 会跨调用残留。
// 每次用前复制一份新的 RegExp，避免 matchAll 从上次位置续扫导致正常章节被漏掉。
function freshPattern(pattern) {
  return new RegExp(pattern.source, pattern.flags);
}

function collectMatches(text) {
  for (const pattern of CHAPTER_PATTERNS) {
    const matches = [];
    for (const match of text.matchAll(freshPattern(pattern))) {
      const title = match[0].trim();
      if (title.length > MAX_TITLE_LENGTH) {
        continue;
      }
      matches.push({ title, index: match.index ?? 0 });
    }
    if (matches.length >= 2) {
      return matches;
    }
  }

  return [];
}

/** 在 [from, limit) 内找最近的段落边界，优先空行（\n\n），其次换行（\n） */
function findParagraphBreak(text, from, limit) {
  const window = text.slice(from, limit);
  const doubleBreak = window.indexOf("\n\n");
  if (doubleBreak !== -1) {
    return from + doubleBreak + 2;
  }
  const singleBreak = window.indexOf("\n");
  if (singleBreak !== -1) {
    return from + singleBreak + 1;
  }
  return -1;
}

/**
 * 无目录书的兜底：按段落边界平铺，保证不把段落切成两半。
 * 切点优先落在 [chunkSize*0.8, chunkSize*1.3] 窗口内的第一个段落边界上，
 * 窗口内找不到边界时（例如整段超长无换行）才退化为硬切。
 */
function fallbackChapters(text, chunkSize = FALLBACK_CHUNK_SIZE) {
  const chapters = [];
  const push = (start, end) => {
    const content = text.slice(start, end).trim();
    if (!content.length) {
      return;
    }
    chapters.push({
      id: `fallback-${start}`,
      title: `第 ${chapters.length + 1} 部分`,
      start,
      end,
      content
    });
  };

  let start = 0;
  while (start < text.length) {
    if (text.length - start <= chunkSize) {
      push(start, text.length);
      break;
    }

    const searchFrom = start + Math.floor(chunkSize * 0.8);
    const searchLimit = Math.min(text.length, start + Math.floor(chunkSize * 1.3));
    const breakAt = findParagraphBreak(text, searchFrom, searchLimit);
    const end = breakAt > start ? breakAt : start + chunkSize;

    push(start, end);
    start = end;
  }

  return chapters;
}

/**
 * 解析章节并返回是否走了兜底。
 * @returns {{ chapters: Array<{id:string,title:string,start:number,end:number,content:string}>,
 *             isFallback: boolean }}
 */
export function parseChaptersWithMeta(text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const matches = collectMatches(normalized);

  if (!matches.length) {
    return { chapters: fallbackChapters(normalized), isFallback: true };
  }

  const chapters = matches
    .map((entry, index) => {
      const start = entry.index;
      const end = matches[index + 1]?.index ?? normalized.length;
      return {
        id: `chapter-${index + 1}`,
        title: entry.title,
        start,
        end,
        content: normalized.slice(start, end).trim()
      };
    })
    .filter((chapter) => chapter.content.length > 0);

  if (!chapters.length) {
    return { chapters: fallbackChapters(normalized), isFallback: true };
  }

  return { chapters, isFallback: false };
}

export function parseChapters(text) {
  return parseChaptersWithMeta(text).chapters;
}

