const SENTENCE_BREAK = /[。！？!?；;，,、]\s*/g;

function sentenceAwareCut(text, maxChars) {
  if (text.length <= maxChars) {
    return text.length;
  }

  const searchStart = Math.max(80, maxChars - 140);
  const searchEnd = Math.min(text.length, maxChars + 120);
  const windowText = text.slice(searchStart, searchEnd);
  let best = -1;

  for (const match of windowText.matchAll(SENTENCE_BREAK)) {
    best = searchStart + (match.index ?? 0) + match[0].length;
  }

  if (best >= Math.floor(maxChars * 0.55)) {
    return best;
  }

  return maxChars;
}

function splitParagraph(paragraph, maxChars) {
  if (paragraph.length <= maxChars) {
    return [paragraph];
  }

  const chunks = [];
  let rest = paragraph.trim();

  while (rest.length > maxChars) {
    const cut = sentenceAwareCut(rest, maxChars);
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trimStart();
  }

  if (rest.length) {
    chunks.push(rest);
  }

  if (chunks.length > 1 && chunks[chunks.length - 1].length < Math.floor(maxChars * 0.35)) {
    const tail = chunks.pop();
    chunks[chunks.length - 1] = `${chunks[chunks.length - 1]}${tail ? ` ${tail}` : ""}`.trim();
  }

  return chunks;
}

/**
 * @param {string} content
 * @param {object} settings - { fontSize, lineHeight }
 * @param {{ width: number, height: number } | null} [pageDimensions]
 */
export function paginateChapter(content, settings, pageDimensions = null) {
  const normalized = content.replace(/\r\n/g, "\n").trim();

  let targetChars;
  if (pageDimensions && pageDimensions.width > 50 && pageDimensions.height > 50) {
    const lineHeightPx = settings.fontSize * (settings.lineHeight || 1.8);
    // CJK full-width chars ≈ fontSize px wide; use 0.9 safety factor
    const charsPerLine = Math.floor((pageDimensions.width / settings.fontSize) * 0.9);
    const linesPerPage = Math.floor(pageDimensions.height / lineHeightPx);
    targetChars = Math.max(200, charsPerLine * linesPerPage);
  } else {
    targetChars = Math.max(700, Math.round(2200 - settings.fontSize * 45));
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .flatMap((paragraph) => splitParagraph(paragraph.trim(), targetChars));

  const pages = [];
  let current = [];
  let charCount = 0;

  for (const paragraph of paragraphs) {
    const nextSize = charCount + paragraph.length;
    if (nextSize > targetChars && current.length) {
      pages.push(current.join("\n\n"));
      current = [paragraph];
      charCount = paragraph.length;
      continue;
    }

    current.push(paragraph);
    charCount = nextSize;
  }

  if (current.length) {
    pages.push(current.join("\n\n"));
  }

  return pages.length ? pages : [normalized];
}
