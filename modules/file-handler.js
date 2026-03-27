const DECODERS = ["utf-8", "gb18030", "big5"];

function scoreDecodedText(text) {
  const replacementChars = (text.match(/�/g) || []).length;
  const readableChars = (text.match(/[\u4e00-\u9fffA-Za-z0-9，。！？；：“”‘’、,.!?;:()《》【】\s]/g) || []).length;
  return readableChars - replacementChars * 20;
}

async function decodeBuffer(buffer) {
  let best = {
    encoding: "utf-8",
    text: new TextDecoder("utf-8").decode(buffer),
    score: Number.NEGATIVE_INFINITY
  };

  for (const encoding of DECODERS) {
    try {
      const text = new TextDecoder(encoding, { fatal: false }).decode(buffer);
      const score = scoreDecodedText(text);
      if (score > best.score) {
        best = { encoding, text, score };
      }
    } catch (error) {
      console.warn(`Skip decoder ${encoding}`, error);
    }
  }

  return best;
}

export function createBookId(file) {
  return [file.name, file.size, file.lastModified].join(":");
}

export async function readTxtFile(file) {
  const buffer = await file.arrayBuffer();
  const decoded = await decodeBuffer(buffer);

  return {
    id: createBookId(file),
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    encoding: decoded.encoding,
    text: decoded.text.replace(/\u0000/g, "")
  };
}
