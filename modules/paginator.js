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

/**
 * 受上限约束地收集分页结果（FR-M1）。
 *
 * 分页器本身是惰性的，但调用方如果直接「要多少就生成多少」，遇到
 * 恢复阅读进度到大文件深处（例如第 5000 页）时会一次性生成数千页，
 * 主线程直接卡死。这里强制单次生成量有上限，剩下的交给空闲预热补。
 *
 * @param {{ done: boolean, next: () => string|null }} pager
 * @param {{ requiredCount: number, maxPages?: number }} options
 * @returns {{ pages: string[], done: boolean, generated: number }}
 */
export function collectPages(pager, { requiredCount, maxPages = Number.POSITIVE_INFINITY }) {
  const pages = [];
  const limit = Math.max(1, Math.min(requiredCount, maxPages));

  while (!pager.done && pages.length < limit) {
    const page = pager.next();
    if (!page) {
      break;
    }
    pages.push(page);
  }

  return { pages, done: pager.done, generated: pages.length };
}

/**
 * 把页码钳制到「已生成页面」范围内并对齐到整幅（spread）起点（FR-M1）。
 * 渐近分页下总页数在分页完成前是未知的，跳转目标必须按已生成页数收敛，
 * 否则会渲染出空白页。
 */
export function clampSpreadStart(pageIndex, pagesLength, pagesPerView) {
  const view = Math.max(1, pagesPerView);
  if (pagesLength <= 0) {
    return 0;
  }

  const lastSpreadStart = Math.floor((pagesLength - 1) / view) * view;
  const clamped = Math.max(0, Math.min(pageIndex, lastSpreadStart));
  return clamped - (clamped % view);
}

export function createRenderedChapterPager(content, settings, pageDimensions, fitsPage) {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  return buildRenderedPager(normalized, settings, pageDimensions, fitsPage);
}

function paginateByRenderedHeight(normalized, settings, pageDimensions, fitsPage) {
  const pager = buildRenderedPager(normalized, settings, pageDimensions, fitsPage);
  const pages = [];

  while (!pager.done) {
    const page = pager.next();
    if (!page) {
      break;
    }
    pages.push(page);
  }

  return pages.length ? pages : [normalized];
}

function buildRenderedPager(normalized, settings, pageDimensions, fitsPage) {
  const fallbackTarget = Math.max(700, Math.round(2200 - settings.fontSize * 45));
  const estimatedTarget = pageDimensions
    ? Math.max(
        200,
        Math.floor((pageDimensions.width / Math.max(8, pageDimensions.charWidth || settings.fontSize)) * 0.93) *
          Math.floor(pageDimensions.height / (settings.fontSize * (settings.lineHeight || 1.8)))
      )
    : fallbackTarget;

  // 性能（P-01）：原实现每翻一页都从头二分，且每轮都用 rest.slice(0, len) 交给浏览器排版；
  // 由于 rest 是「整章剩余文本」，长度判定与实际排版高度不一致，单页要为整章付排版成本，
  // 单章分页因此是 O(n²)：实测 10 万字单章 8 秒、30 万字单章 196 秒。
  //
  // 改为「上界单调收敛」：
  //   1. 上一页的切割长度是很好的先验，以此为起点做倍增/折半，探测次数从 ~log2(整章) 降到 O(1)；
  //   2. 探测前先用 estimatedTarget 把文本裁到「一页可能容纳的上限」，避免整章参与排版；
  //   3. fitsPage 的入参语义保持不变：被测文本仍从当前页起点开始，因此句读回退与空白裁剪行为一致。
  const total = normalized.length;
  let pos = 0;
  let lastCut = 0;
  // 单页可能容纳的字符上限。estimatedTarget 是按「平均字宽 × 行高」的粗估，
  // 但真实排版受标点挤压、空行、英文混排影响，实测可超出估算值 2 倍以上；
  // 取 6 倍余量既保证覆盖，又把单次排版输入长度限制为常数（上限 6000 字）。
  const maxProbe = Math.min(6000, Math.max(1500, estimatedTarget * 6));

  // 关键：只把「当前页起点开始的 maxProbe 字」交给排版引擎，
  // 长度判定与真实排版高度重新对齐；与原实现的 rest.slice(0, len) 语义等价（因为 len <= maxProbe 时前缀相同）。
  const pageSource = () => normalized.substr(pos, Math.min(total - pos, maxProbe));
  const skipWhitespace = () => {
    while (pos < total && /\s/.test(normalized[pos])) {
      pos += 1;
    }
  };

  return {
    get done() {
      return pos >= total;
    },
    next() {
      if (pos >= total) {
        return null;
      }

      const remain = total - pos;
      const source = pageSource();
      const maxLen = source.length;
      // 上界：不超过本次探测源长度（即 maxProbe 与剩余量取小）
      const ceiling = maxLen;
      const fitsPrefixIn = (length) => fitsPage(source.slice(0, Math.min(length, maxLen)));

      // 求「能放下的最长前缀」的上界区间 [loFit, hiFail]。
      // 起始猜测取「上一页切割长度」，这是最可靠的先验（相邻页容量几乎相同）；
      // 猜错时先向上倍增（首探失败说明估小了），再向下折半（首探成功说明估大了），
      // 最后在区间内二分。总探测次数 O(log(真实容量/误差))，且与章节总长无关。
      // 相邻页容量高度相关：以上一页切割长度的 1.2 倍作为起点，
      // 既避免「猜得刚好等于真实容量、下一步直接翻倍越过」的浪费，也避免从 1 重新开始。
      const guess = lastCut
        ? Math.min(ceiling, Math.max(1, Math.ceil(lastCut * 1.2)))
        : Math.min(ceiling, Math.max(300, estimatedTarget));

      let loFit = 0;      // 已知能放下
      let hiFail = ceiling + 1; // 已知放不下
      let cur = guess;

      if (fitsPrefixIn(cur)) {
        loFit = cur;
        // 向上倍增，直到放不下
        while (loFit < ceiling) {
          const probe = Math.min(ceiling, loFit * 2);
          if (!fitsPrefixIn(probe)) {
            hiFail = probe;
            break;
          }
          loFit = probe;
        }
        if (loFit >= ceiling) {
          hiFail = ceiling;
        }
        // 整个探测源都能塞进一页，且剩余文本不超过探测源：直接收尾
        if (loFit >= maxLen && maxLen >= remain) {
          const finalPage = normalized.slice(pos);
          pos = total;
          return finalPage;
        }
      } else {
        hiFail = cur;
        // 向下折半，直到能放下
        while (loFit === 0) {
          const probe = Math.max(1, Math.floor(cur / 2));
          if (probe === cur) {
            loFit = 1;
            break;
          }
          if (fitsPrefixIn(probe)) {
            loFit = probe;
          } else {
            hiFail = probe;
            cur = probe;
          }
        }
      }

      // 二分收敛到「能放下的最长前缀」。
      // 下界必须取「已知能放下」的值：倍增阶段停在 high 说明 high 可放下、2*high 不可放下，
      // 若从 1 重新起二分，就会丢掉 high..2*high 这段仍然可放下的区间（实测导致每页切短一半）。
      let low = loFit;
      let high = hiFail - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (fitsPrefixIn(mid)) {
          low = mid;
        } else {
          high = mid - 1;
        }
      }

      // 句读回退只看切割点前 180 字，不再拷贝整段剩余文本
      const windowText = source.slice(0, Math.min(maxLen, low + 200));
      let cut = sentenceAwareCutBefore(windowText, low);
      if (cut <= 0 || cut > remain) {
        cut = low;
      }

      const page = normalized.substr(pos, cut).trimEnd();
      if (!page.length) {
        // 极端输入：整段前缀都是空白，硬切保证推进
        const hard = Math.max(1, Math.min(remain, low));
        const hardPage = normalized.substr(pos, hard);
        pos += hard;
        skipWhitespace();
        lastCut = hard;
        return hardPage;
      }

      pos += cut;
      skipWhitespace();
      lastCut = cut;
      return page;
    }
  };
}
