#!/usr/bin/env node
// 生成 v0.6 测试样本集（真实文件），供手工 P0 用例导入验证。
//
//   node scripts/gen-test-samples.mjs              # 100 万字大文件
//   node scripts/gen-test-samples.mjs --scale 3.5  # 放大到约 10 MB
//
// 输出到 tests/samples/（已加入 .gitignore，不进仓库、不进打包 ZIP）。

import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSampleSet } from "../tests/sample-set.mjs";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(projectRoot, "tests", "samples");

function readScale(argv) {
  const index = argv.indexOf("--scale");
  if (index === -1) {
    return 1;
  }
  const value = Number(argv[index + 1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("--scale 需要一个正数");
  }
  return value;
}

function formatSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function main() {
  const scale = readScale(process.argv.slice(2));
  const samples = buildSampleSet({ scale });

  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  const rows = [];
  for (const sample of samples) {
    writeFileSync(join(outputDir, sample.name), sample.bytes);
    rows.push({
      文件: sample.name,
      类别: sample.category,
      大小: formatSize(sample.bytes.byteLength),
      用例: sample.useCase
    });
  }

  console.log(`样本已生成到 ${outputDir}\n`);
  console.table(rows);
  console.log("用途：");
  for (const sample of samples) {
    console.log(`  - ${sample.name}：${sample.purpose}`);
  }
}

main();
