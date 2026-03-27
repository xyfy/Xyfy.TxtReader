import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg  = readFileSync(join(root, 'icons/icon.svg'));
const sizes = [16, 32, 48, 128];

mkdirSync(join(root, 'icons'), { recursive: true });

for (const size of sizes) {
  const out = join(root, `icons/icon${size}.png`);
  await sharp(svg).resize(size, size).png().toFile(out);
  console.log(`✓ icon${size}.png`);
}
console.log('Done — icons/ ready.');
