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
        workerBlobURL: false, // Worker direkt laden, damit er offline aus dem Service Worker kommt
        corePath: base + 'core/' + core,
        langPath: base + 'lang',
        logger: (m) => progressCb(m),
      });
      await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '6' });
      return worker;
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

// Foto vorbereiten. Lange Bons sind auf dem Handyfoto schmal und klein: deshalb erst den hellen Bon auf dem
// dunklen Untergrund finden und ausschneiden, dann so hochrechnen, dass die Schrift groß genug für Tesseract ist,
// und in Streifen teilen, die jeweils in einer Zeilenlücke enden (ein riesiges Bild wäre fürs iPhone zu viel Speicher).
const OCR_W = 1400, STRIP_H = 1800, CUT_ZONE = 320, MAX_H = 16000;

export async function prepareImage(file) {
  const bitmap = await loadBitmap(file);
  const bw = bitmap.width, bh = bitmap.height;
  const box = findPaper(bitmap);
  // Foto zum Ablegen: nur der Bon, gut lesbar, aber nicht riesig
  const ps = Math.min(1, 1100 / box.w, 3600 / box.h);
  const pc = document.createElement('canvas'); pc.width = Math.round(box.w * ps); pc.height = Math.round(box.h * ps);
  pc.getContext('2d').drawImage(bitmap, box.x, box.y, box.w, box.h, 0, 0, pc.width, pc.height);
  // Erkennung: Bonbreite auf ca. 1400 px bringen (höchstens 3-fach vergrößern)
  let s = Math.min(3, OCR_W / box.w); if (box.h * s > MAX_H) s = MAX_H / box.h;
  const W = Math.round(box.w * s), H = Math.round(box.h * s);
  const strips = [];
  for (let y = 0; y < H - 30;) {
    let h = Math.min(STRIP_H, H - y);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = h;
    let ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, box.x, box.y + y / s, box.w, h / s, 0, 0, W, h);
    flatten(ctx, W, h);
    if (y + h < H) {
      // Streifen in einer Lücke zwischen zwei Zeilen enden lassen, damit keine Zeile zerschnitten wird
      const cut = whitestRow(ctx, W, h, h - CUT_ZONE, h - 8);
      const keep = document.createElement('canvas'); keep.width = W; keep.height = cut;
      keep.getContext('2d').drawImage(cv, 0, 0); strips.push(keep); y += cut;
    } else { strips.push(cv); break; }
  }
  if (bitmap.close) bitmap.close();
  const photo = await new Promise((r) => pc.toBlob(r, 'image/jpeg', 0.78));
  return { photo, strips };
}

// Hellen Bon im Bild suchen: auf einem kleinen Vorschaubild Spalten und Zeilen mit viel hellem Papier zählen.
function findPaper(bitmap) {
  const bw = bitmap.width, bh = bitmap.height, k = Math.min(1, 360 / Math.max(bw, bh));
  const w = Math.max(1, Math.round(bw * k)), h = Math.max(1, Math.round(bh * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bitmap, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h), hist = new Uint32Array(256);
  for (let i = 0; i < w * h; i++) { const v = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8; g[i] = v; hist[v]++; }
  const t = otsu(hist, w * h);
  const full = { x: 0, y: 0, w: bw, h: bh };
  const cols = new Float32Array(w);
  for (let x = 0; x < w; x++) { let n = 0; for (let y = 0; y < h; y++) if (g[y * w + x] > t) n++; cols[x] = n / h; }
  const [x0, x1] = longestRun(cols, 0.25);
  if (x1 - x0 < w * 0.08) return full;
  const rows = new Float32Array(h);
  for (let y = 0; y < h; y++) { let n = 0; for (let x = x0; x <= x1; x++) if (g[y * w + x] > t) n++; rows[y] = n / (x1 - x0 + 1); }
  const [y0, y1] = longestRun(rows, 0.45);
  if (y1 - y0 < h * 0.1) return full;
  const area = ((x1 - x0) * (y1 - y0)) / (w * h);
  if (area > 0.9) return full; // Papier füllt das ganze Bild (heller Untergrund): nichts abschneiden
  const mx = (x1 - x0) * 0.04, my = (y1 - y0) * 0.015;
  const X0 = Math.max(0, (x0 - mx) / k), X1 = Math.min(bw, (x1 + 1 + mx) / k), Y0 = Math.max(0, (y0 - my) / k), Y1 = Math.min(bh, (y1 + 1 + my) / k);
  return { x: X0, y: Y0, w: X1 - X0, h: Y1 - Y0 };
}
function otsu(hist, total) {
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue; const wF = total - wB; if (!wF) break;
    sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; t = i; }
  }
  return t;
}
// Längster zusammenhängender Bereich über der Schwelle (kleine Lücken bis 3 % werden überbrückt)
function longestRun(a, th) {
  const gap = Math.max(2, Math.round(a.length * 0.03));
  let best = [0, -1], s = -1, last = -1;
  for (let i = 0; i <= a.length; i++) {
    if (i < a.length && a[i] >= th) { if (s < 0 || i - last > gap) s = i; last = i; if (last - s > best[1] - best[0]) best = [s, last]; }
  }
  return best;
}

function whitestRow(ctx, w, h, a, b) {
  const d = ctx.getImageData(0, a, w, b - a).data;
  let best = b, bestInk = Infinity;
  for (let y = b - a - 1; y >= 0; y--) {
    let ink = 0; for (let x = 0; x < w; x += 2) ink += 255 - d[(y * w + x) * 4];
    if (ink < bestInk) { bestInk = ink; best = a + y; }
  }
  return best;
}

// Graustufen und Licht ausgleichen: jedes Pixel durch die Helligkeit seiner Umgebung teilen. So verschwinden
// Schatten und Farbverläufe, und blasse Thermodruck-Schrift wird dunkel.
function flatten(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data, n = w * h;
  const g = new Uint8Array(n);
  for (let i = 0; i < n; i++) g[i] = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8;
  const W1 = w + 1, I = new Uint32Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + row; } }
  const r = Math.max(12, Math.round(w / 28));
  // Helligkeit des Papiers (90. Perzentil): Bereiche, deren Umgebung deutlich dunkler ist, sind Untergrund und werden
  // weiß, sonst entstehen am Bonrand schwarze Balken, die Tesseract aus dem Tritt bringen.
  const hist = new Uint32Array(256); for (let i = 0; i < n; i++) hist[g[i]]++;
  let acc = 0, paper = 255; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.1) { paper = v; break; } }
  const bgMax = paper * 0.6;
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r), yb = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r), xb = Math.min(w, x + r + 1);
      const mean = (I[yb * W1 + xb] - I[ya * W1 + xb] - I[yb * W1 + xa] + I[ya * W1 + xa]) / ((yb - ya) * (xb - xa));
      if (mean < bgMax) { const o = (y * w + x) * 4; d[o] = d[o + 1] = d[o + 2] = 255; continue; }
      const ratio = g[y * w + x] / Math.max(24, mean);
      // Papier wird weiß, Schrift dunkel, mit weicher Kante statt harter Schwelle
      const v = ratio >= 0.92 ? 255 : Math.max(0, Math.round(255 - (0.92 - ratio) * 255 * 3.2));
      const o = (y * w + x) * 4; d[o] = d[o + 1] = d[o + 2] = v;
    }
  }
  ctx.putImageData(img, 0, 0);
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

// Erkennt den Text aller Streifen (und mehrerer Fotos) nacheinander und setzt ihn zusammen.
export async function recognize(strips, onProgress) {
  const list = [].concat(strips);
  let idx = 0;
  progressCb = (m) => {
    if (!onProgress) return;
    if (m.status === 'recognizing text') onProgress(list.length > 1 ? `Lese Text … (${idx + 1}/${list.length})` : 'Lese Text …', 0.3 + ((idx + (m.progress || 0)) / list.length) * 0.7);
    else onProgress('Bereite Texterkennung vor …', Math.min(0.3, (m.progress || 0) * 0.3));
  };
  const worker = await getWorker();
  const out = [];
  for (idx = 0; idx < list.length; idx++) {
    const { data } = await worker.recognize(list[idx]);
    const lines = (data.text || '').split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim());
    out.push(...lines);
  }
  return out.join('\n');
}
// Lädt die Texterkennung im Hintergrund vor, damit sie später offline bereitsteht.
export function warmUp() {
  getWorker().catch(() => {});
}
