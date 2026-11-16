// Texterkennung komplett auf dem Gerät (Tesseract, deutsches Sprachpaket).

const base = new URL('../vendor/tesseract/', import.meta.url).href;
let workerPromise = null;

function simdSupported() {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch { return false; }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Texterkennung konnte nicht geladen werden.'));
    document.head.appendChild(s);
  });
}

let progressCb = () => {};

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      await loadScript(base + 'tesseract.min.js');
      const core = simdSupported() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js';
      const worker = await window.Tesseract.createWorker('deu', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base + 'core/' + core,
        langPath: base + 'lang',
        logger: (m) => progressCb(m),
      });
      await worker.setParameters({ preserve_interword_spaces: '1' });
      return worker;
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

// Lädt das Foto, verkleinert es und macht es kontrastreicher, damit Tesseract besser liest.
export async function prepareImage(file, maxSide = 1800) {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const photo = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.72));

  // Graustufen und Kontrast für die Erkennung
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - min) / range) * 255 * 1.15 - 15));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return { photo, ocrCanvas: canvas };
}

async function loadBitmap(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* Fallback */ }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
    img.src = URL.createObjectURL(file);
  });
}

export async function recognize(canvas, onProgress) {
  progressCb = (m) => {
    if (!onProgress) return;
    if (m.status === 'recognizing text') onProgress('Lese Text …', 0.3 + m.progress * 0.7);
    else onProgress('Bereite Texterkennung vor …', Math.min(0.3, (m.progress || 0) * 0.3));
  };
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);
  return data.text || '';
}

// Lädt die Texterkennung im Hintergrund vor, damit sie später offline bereitsteht.
export function warmUp() {
  getWorker().catch(() => {});
}
