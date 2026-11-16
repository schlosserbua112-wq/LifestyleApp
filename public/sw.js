// Service Worker: legt die ganze App auf dem iPhone ab, damit sie ohne Internet läuft.
// Bei jeder neuen Version VERSION erhöhen, dann holt sich die App das Update beim nächsten Online-Start.
const VERSION = '2026.11.16-1';
const CACHE = 'lifestyle-' + VERSION;

const ASSETS = [
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
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'vendor/tesseract/tesseract.min.js',
  'vendor/tesseract/worker.min.js',
  'vendor/tesseract/lang/deu.traineddata.gz',
  'vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js',
  'vendor/tesseract/core/tesseract-core-lstm.wasm.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lifestyle-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(new URL('api/', self.registration.scope).pathname)) return; // Backup nie cachen

  // Offline zuerst: immer aus dem Cache, nur Unbekanntes aus dem Netz.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()));
    }),
  );
});
