// FR-M4 边界四态：TC-M4-01（加载态）/ TC-M4-02（空态）/ TC-M4-03（错误态）/ TC-M4-04（超长段落）

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paginateChapter, createRenderedChapterPager, collectPages } from "../modules/paginator.js";
import {
  ERROR_KINDS,
  READER_STATES,
  describeImportError,
  resolveReaderViewState
} from "../modules/reader-view-state.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run() {
  // TC-M4-01：导入中显示加载态
  assert.equal(
    resolveReaderViewState({ isLoading: true, hasBook: false }),
    READER_STATES.LOADING,
    "TC-M4-01 导入中应为加载态"
  );
  console.log("✓ TC-M4-01 导入中 → 加载态");

  // TC-M4-02：无书（关闭书籍后）显示空态
  assert.equal(
    resolveReaderViewState({ isLoading: false, hasBook: false }),
    READER_STATES.EMPTY,
    "TC-M4-02 无书时应为空态"
  );
  assert.equal(
    resolveReaderViewState({ hasBook: true }),
    READER_STATES.READING,
    "有书且无异常时应为阅读态"
  );
  console.log("✓ TC-M4-02 无书 → 空态（有书 → 阅读态）");

  // TC-M4-03：损坏文件 → 错误态，且必须带出原因
  assert.equal(
    resolveReaderViewState({ hasBook: false, error: new Error("解析失败") }),
    READER_STATES.ERROR,
    "TC-M4-03 解析失败时应为错误态"
  );
  // 错误优先于空与加载，避免界面退回空态让用户以为没导入过
  assert.equal(
    resolveReaderViewState({ isLoading: true, hasBook: true, error: new Error("boom") }),
    READER_STATES.ERROR,
    "错误态优先级应高于加载态与阅读态"
  );

  const parseFailure = describeImportError({ error: Object.assign(new Error("解析失败"), { name: "ParseError" }) });
  assert.equal(parseFailure.kind, ERROR_KINDS.PARSE_FAILED, "TC-M4-03 应识别出解析失败");
  assert.ok(parseFailure.detail.length > 0, "TC-M4-03 错误态必须携带可读原因");

  const readFailure = describeImportError({ error: Object.assign(new Error("读取文件失败"), { name: "NotReadableError" }) });
  assert.equal(readFailure.kind, ERROR_KINDS.READ_FAILED, "读取失败应单独归类");

  // 编码不可识别（FR-M2）也走错误态，并提示可手动选编码
  assert.equal(
    resolveReaderViewState({ needsEncodingChoice: true }),
    READER_STATES.ERROR,
    "编码不可识别应进入错误态以便提示手动选择"
  );
  assert.equal(
    describeImportError({ needsEncodingChoice: true }).kind,
    ERROR_KINDS.ENCODING,
    "编码不可识别应归类为 encoding"
  );
  console.log("✓ TC-M4-03 错误态带原因，编码不可识别可提示手动选择");

  // TC-M4-04：50 万字符超长单段落必须正常分页且不溢出
  const longParagraph = "字".repeat(500_000);
  const settings = { fontSize: 16, lineHeight: 1.8 };
  const pageDimensions = { width: 800, height: 600, charWidth: 16 };
  const charsPerPage = Math.floor((800 / 16) * 0.93) * Math.floor(600 / (16 * 1.8));

  const pages = paginateChapter(longParagraph, settings, pageDimensions);
  assert.ok(pages.length > 1, "TC-M4-04 超长段落必须被切成多页");
  const longest = pages.reduce((max, page) => Math.max(max, page.length), 0);
  assert.ok(
    longest <= charsPerPage,
    `TC-M4-04 任何一页都不应超过页面容量（最长 ${longest} > ${charsPerPage}）`
  );
  assert.equal(
    pages.join("").replace(/\s/g, "").length,
    500_000,
    "TC-M4-04 分页不应丢失或重复内容"
  );

  // 真实渲染路径（DOM 实测）同样不能溢出
  const pager = createRenderedChapterPager(longParagraph, settings, pageDimensions, (text) => text.length <= charsPerPage);
  const batch = collectPages(pager, { requiredCount: 5, maxPages: 5 });
  assert.equal(batch.generated, 5, "超长段落应能连续产出页面");
  for (const page of batch.pages) {
    assert.ok(page.length <= charsPerPage, "TC-M4-04 渲染分页出现溢出页");
  }
  console.log(`✓ TC-M4-04 50 万字符段落切成 ${pages.length} 页，无溢出`);

  // 四态 UI 必须真实存在，且扩展端与站点端元素一致（双端漂移是历史坑）
  const requiredIds = [
    "reader-state-overlay",
    "state-loading",
    "state-empty",
    "state-empty-import",
    "state-error",
    "state-error-reason",
    "state-error-retry",
    // FR-M2 手动选编码入口必须可达，否则「提示手动选择」就是一句空话
    "state-error-encoding",
    "state-error-encoding-apply"
  ];
  for (const file of ["reader/reader.html", "web/index.html"]) {
    const html = readFileSync(path.join(rootDir, file), "utf8");
    for (const id of requiredIds) {
      assert.ok(html.includes(`id="${id}"`), `${file} 缺少四态控件 #${id}`);
    }
  }
  console.log("✓ 四态控件在扩展端与站点端均已就位（含导入入口与重试按钮）");

  console.log("boundary state tests passed (TC-M4-01~04)");
}

run();
