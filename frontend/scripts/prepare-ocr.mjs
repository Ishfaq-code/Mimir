import { copyFile, mkdir, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const destination = resolve(import.meta.dirname, "../public/ocr");
const core = dirname(require.resolve("tesseract.js-core/package.json"));
await mkdir(`${destination}/core`, { recursive: true });
await mkdir(`${destination}/lang`, { recursive: true });
await copyFile(require.resolve("tesseract.js/dist/worker.min.js"), `${destination}/worker.min.js`);
await copyFile(require.resolve("tesseract.js/dist/worker.min.js.LICENSE.txt"), `${destination}/worker.min.js.LICENSE.txt`);
await copyFile(require.resolve("tesseract.js/LICENSE.md"), `${destination}/LICENSE.md`);
await copyFile(`${core}/LICENSE`, `${destination}/core/LICENSE`);
for (const file of await readdir(core)) {
  if (file.endsWith(".wasm.js")) await copyFile(`${core}/${file}`, `${destination}/core/${file}`);
}
await copyFile(require.resolve("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"), `${destination}/lang/eng.traineddata.gz`);
