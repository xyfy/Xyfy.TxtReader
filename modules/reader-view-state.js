// FR-M4 边界四态（加载中 / 空 / 错误 / 超长）的状态判定与错误归因
//
// 之所以抽成纯函数：四态的优先级和错误分类以前散落在事件回调里，
// 只能靠手点验证。抽出来之后可以在 Node 里直接断言，也能保证
// 「错误态永远优先于空态」这类规则不会被后续改动带偏。

export const READER_STATES = {
  LOADING: "loading",
  EMPTY: "empty",
  ERROR: "error",
  READING: "reading"
};

export const ERROR_KINDS = {
  ENCODING: "encoding",
  EMPTY_FILE: "emptyFile",
  READ_FAILED: "readFailed",
  PARSE_FAILED: "parseFailed",
  UNKNOWN: "unknown"
};

/**
 * 四态判定。优先级：错误 > 加载中 > 空 > 阅读中。
 *
 * 错误优先于空：导入一本失败的书时，界面必须告诉用户「为什么失败」，
 * 而不是退回空态让用户以为没导入过。
 */
export function resolveReaderViewState({
  isLoading = false,
  error = null,
  hasBook = false,
  needsEncodingChoice = false
} = {}) {
  if (error || needsEncodingChoice) {
    return READER_STATES.ERROR;
  }
  if (isLoading) {
    return READER_STATES.LOADING;
  }
  if (!hasBook) {
    return READER_STATES.EMPTY;
  }
  return READER_STATES.READING;
}

/**
 * 把导入异常归类成用户能看懂的原因，界面据此给出恢复动作。
 * @returns {{ kind: string, detail: string }}
 */
export function describeImportError({ error = null, needsEncodingChoice = false } = {}) {
  if (needsEncodingChoice) {
    return { kind: ERROR_KINDS.ENCODING, detail: "" };
  }

  if (!error) {
    return { kind: ERROR_KINDS.UNKNOWN, detail: "" };
  }

  const name = error.name || "";
  const message = error.message || String(error);

  if (name === "EncodingUnrecognized" || /encoding/i.test(name)) {
    return { kind: ERROR_KINDS.ENCODING, detail: message };
  }
  if (name === "EmptyFileError" || /为空|empty/i.test(message)) {
    return { kind: ERROR_KINDS.EMPTY_FILE, detail: message };
  }
  if (name === "NotReadableError" || /read|读取/i.test(message)) {
    return { kind: ERROR_KINDS.READ_FAILED, detail: message };
  }
  if (name === "ParseError" || /解析|parse/i.test(message)) {
    return { kind: ERROR_KINDS.PARSE_FAILED, detail: message };
  }

  return { kind: ERROR_KINDS.UNKNOWN, detail: message };
}
