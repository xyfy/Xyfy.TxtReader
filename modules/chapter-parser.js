const CHAPTER_PATTERNS = [
  /^(第[零一二三四五六七八九十百千万亿两\d]{1,12}[章节回卷部节篇])\s*(.*)$/gm,
  /^(序章|楔子|尾声|番外|后记|终章)\s*(.*)$/gm,
  /^(chapter\s+\d+[\s.:：-]*.*)$/gim
];

function collectMatches(text) {
  for (const pattern of CHAPTER_PATTERNS) {
    const matches = [];
    for (const match of text.matchAll(pattern)) {
      matches.push({
        title: match[0].trim(),
        index: match.index ?? 0
      });
    }
    if (matches.length >= 2) {
      return matches;
    }
  }

  return [];
}

function fallbackChapters(text, chunkSize = 12000) {
  const chapters = [];

  for (let start = 0; start < text.length; start += chunkSize) {
    const end = Math.min(start + chunkSize, text.length);
    chapters.push({
      id: `fallback-${start}`,
      title: `第 ${chapters.length + 1} 部分`,
      start,
      end,
      content: text.slice(start, end).trim()
    });
  }

  return chapters;
}

export function parseChapters(text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const matches = collectMatches(normalized);

  if (!matches.length) {
    return fallbackChapters(normalized);
  }

  const chapters = matches.map((entry, index) => {
    const start = entry.index;
    const end = matches[index + 1]?.index ?? normalized.length;
    const content = normalized.slice(start, end).trim();

    return {
      id: `chapter-${index + 1}`,
      title: entry.title,
      start,
      end,
      content
    };
  });

  return chapters.filter((chapter) => chapter.content.length > 0);
}
