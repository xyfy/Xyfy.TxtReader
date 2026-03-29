import { mkdir, readFile, rm, writeFile, cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "dist", "webapp");

async function buildWebApp() {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const indexHtml = await readFile(path.join(rootDir, "web", "index.html"), "utf8");
  const normalizedIndexHtml = indexHtml
    .replace(/\.\.\/reader\//g, "./reader/")
    .replace(/\.\.\/modules\//g, "./modules/")
    .replace(/\.\.\/icons\//g, "./icons/");

  await writeFile(path.join(outputDir, "index.html"), normalizedIndexHtml, "utf8");
  await cp(path.join(rootDir, "reader"), path.join(outputDir, "reader"), { recursive: true });
  await cp(path.join(rootDir, "modules"), path.join(outputDir, "modules"), { recursive: true });
  await cp(path.join(rootDir, "icons"), path.join(outputDir, "icons"), { recursive: true });
}

buildWebApp().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});