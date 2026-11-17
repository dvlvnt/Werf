import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
const out = 'public/ocr';
fs.mkdirSync(out, { recursive: true });
const cp = (from, name) => fs.copyFileSync(from, path.join(out, name || path.basename(from)));
cp('node_modules/tesseract.js/dist/worker.min.js');
for (const f of fs.readdirSync('node_modules/tesseract.js-core')) {
  if (/^tesseract-core(-simd)?-lstm\.wasm\.js$/.test(f)) cp(path.join('node_modules/tesseract.js-core', f));
}
fs.writeFileSync(path.join(out, 'eng.traineddata'), zlib.gunzipSync(fs.readFileSync('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz')));
console.log('OCR dosyaları kopyalandı');
