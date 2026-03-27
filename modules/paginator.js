function splitParagraph(paragraph, maxChars) {
  if (paragraph.length <= maxChars) {
    return [paragraph];
  }

  const parts = [];
  let start = 0;

  while (start < paragraph.length) {
    parts.push(paragraph.slice(start, start + maxChars));
    start += maxChars;
  }

  return parts;
}

export function paginateChapter(content, settings) {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  const targetChars = Math.max(700, Math.round(2200 - settings.fontSize * 45));
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
