const SENTENCE_BREAK = /[。！？!?；;，,、\n]\s*/g;

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

function sentenceAwareCutBefore(text, maxChars) {
  if (text.length <= maxChars) {
    return text.length;
  }

  const searchStart = Math.max(80, maxChars - 180);
  const searchEnd = maxChars;
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
 * @param {{ width: number, height: number, charWidth?: number } | null} [pageDimensions]
 * @param {(text: string) => boolean} [fitsPage]
 */
export function paginateChapter(content, settings, pageDimensions = null, fitsPage = null) {
  const normalized = content.replace(/\r\n/g, "\n").trim();

  if (typeof fitsPage === "function" && normalized.length) {
    return paginateByRenderedHeight(normalized, settings, pageDimensions, fitsPage);
  }

  let targetChars;
  if (pageDimensions && pageDimensions.width > 50 && pageDimensions.height > 50) {
    const lineHeightPx = settings.fontSize * (settings.lineHeight || 1.8);
    const avgCharWidth = Math.max(8, pageDimensions.charWidth || settings.fontSize);
    // Keep a small safety margin so browser line-wrap does not overflow page bottom.
    const charsPerLine = Math.floor((pageDimensions.width / avgCharWidth) * 0.93);
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

function paginateByRenderedHeight(normalized, settings, pageDimensions, fitsPage) {
  const fallbackTarget = Math.max(700, Math.round(2200 - settings.fontSize * 45));
  const estimatedTarget = pageDimensions
    ? Math.max(
        200,
        Math.floor((pageDimensions.width / Math.max(8, pageDimensions.charWidth || settings.fontSize)) * 0.93) *
          Math.floor(pageDimensions.height / (settings.fontSize * (settings.lineHeight || 1.8)))
      )
    : fallbackTarget;

  const pages = [];
  let rest = normalized;

  while (rest.length) {
    if (fitsPage(rest)) {
      pages.push(rest);
      break;
    }

    let low = 1;
    let high = Math.min(rest.length, Math.max(300, estimatedTarget));
    while (high < rest.length && fitsPage(rest.slice(0, high))) {
      const next = Math.min(rest.length, Math.floor(high * 1.35));
      if (next === high) {
        break;
      }
      high = next;
    }

    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (fitsPage(rest.slice(0, mid))) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    let cut = sentenceAwareCutBefore(rest, low);
    if (cut <= 0 || cut > rest.length) {
      cut = low;
    }

    const page = rest.slice(0, cut).trimEnd();
    if (!page.length) {
      const hard = Math.max(1, Math.min(rest.length, low));
      pages.push(rest.slice(0, hard));
      rest = rest.slice(hard).trimStart();
      continue;
    }

    pages.push(page);
    rest = rest.slice(cut).trimStart();
  }

  return pages.length ? pages : [normalized];
}
