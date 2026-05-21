import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const srcDir = path.resolve(rootDir, 'node_modules/three/examples/jsm/libs/draco');
const destDir = path.resolve(rootDir, 'src/renderer/public/wasm/draco');

const filesToCopy = [
  'draco_wasm_wrapper.js',
  'draco_decoder.js',
  'draco_decoder.wasm',
];

if (!fs.existsSync(srcDir)) {
  console.warn('[copy-draco-wasm] three package not found, skipping');
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });

for (const file of filesToCopy) {
  const src = path.join(srcDir, file);
  const dest = path.join(destDir, file);
  fs.copyFileSync(src, dest);
  console.log(`[copy-draco-wasm] Copied ${file}`);
}
