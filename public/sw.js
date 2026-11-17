// Service Worker: legt die ganze App auf dem iPhone ab, damit sie ohne Internet läuft.
// Bei jeder neuen Version VERSION erhöhen, dann holt sich die App das Update beim nächsten Online-Start.
const VERSION = '2026.11.17-14';
const CACHE = 'lifestyle-' + VERSION;

// Schritt 1: die App selbst (klein, wird sofort beim Installieren gespeichert)
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/db.js',
  'js/parse.js',
  'js/ocr.js',
  'js/charts.js',
  'js/util.js',
  'js/backup.js',
  'js/sync.js',
  'js/weg.js',
  'js/qty.js',
  'js/reward.js',
  'vendor/three/three.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/icon-512-maskable.png',
  'icons/favicon-32.png',
];

// Schritt 2: Texterkennung (ca. 10 MB), wird direkt danach im Hintergrund nachgeladen
const OCR = [
  'vendor/tesseract/tesseract.min.js',
  'vendor/tesseract/worker.min.js',
  'vendor/tesseract/lang/deu.traineddata.gz',
  'vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js',
  'vendor/tesseract/core/tesseract-core-lstm.wasm.js',
];

const MATCH = { ignoreSearch: true, ignoreVary: true };

async function addMissing(cache, urls, network = true) {
  for (const u of urls) {
    if (await cache.match(u, MATCH)) continue;
    // Aus dem alten Cache übernehmen, wenn möglich (spart bei Updates 10 MB Download)
    const old = await caches.match(u, MATCH);
    if (old && u.startsWith('vendor/tesseract/')) { await cache.put(u, old); continue; }
    if (!network) continue;
    const res = await fetch(new Request(u, { cache: 'reload' }));
    if (!res.ok) throw new Error(`${u}: ${res.status}`);
    await cache.put(u, res);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => addMissing(c, SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Texterkennung aus älteren Versionen übernehmen, bevor die alten Caches gelöscht werden
    const cache = await caches.open(CACHE);
    await addMissing(cache, OCR, false).catch(() => {});
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('lifestyle-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Die App fragt nach dem Stand: ist alles offline verfügbar? Fehlendes wird nachgeladen.
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'offline-status') return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let ocr = true;
    try { await addMissing(cache, OCR); } catch { ocr = false; }
    const shell = (await Promise.all(SHELL.map((u) => cache.match(u, MATCH)))).every(Boolean);
    event.source && event.source.postMessage({ type: 'offline-status', version: VERSION, shell, ocr });
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scopePath = new URL(self.registration.scope).pathname;
  if (url.pathname.startsWith(scopePath + 'api/') || url.pathname.startsWith(scopePath + 'mcp')) return;

  // Offline zuerst: immer aus dem Cache, nur Unbekanntes aus dem Netz.
  event.respondWith((async () => {
    const hit = await caches.match(req.mode === 'navigate' ? 'index.html' : req, MATCH);
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (e) {
      if (req.mode === 'navigate') {
        const shell = await caches.match('index.html', MATCH);
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
