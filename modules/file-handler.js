import { decodeBuffer } from "./encoding.js";

export function createBookId(file) {
  return [file.name, file.size, file.lastModified].join(":");
}

/**
 * 读取并解码 TXT 文件（FR-M2）。
 *
 * @param {File} file
 * @param {{ encoding?: string }} [options] 传入 encoding 表示用户手动选择，跳过自动探测
 * @returns {Promise<{ id: string, name: string, size: number, lastModified: number,
 *   encoding: string, bom: string|null, confidence: string, needsManual: boolean,
 *   candidates: string[], text: string }>}
 */
export async function readTxtFile(file, options = {}) {
  const buffer = await file.arrayBuffer();
  const decoded = decodeBuffer(buffer, options.encoding || null);

  return {
    id: createBookId(file),
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    encoding: decoded.encoding,
    bom: decoded.bom ?? null,
    confidence: decoded.confidence ?? "high",
    needsManual: Boolean(decoded.needsManual) && !options.encoding,
    candidates: decoded.candidates ?? [],
    text: decoded.text
  };
}
