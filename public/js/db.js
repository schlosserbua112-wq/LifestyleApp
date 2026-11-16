// Kleiner Wrapper um IndexedDB. Alle Daten bleiben auf dem Gerät.

const DB_NAME = 'lifestyle';
const DB_VERSION = 2;
let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('todos')) db.createObjectStore('todos', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('ideas')) db.createObjectStore('ideas', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('receipts')) {
        const s = db.createObjectStore('receipts', { keyPath: 'id' });
        s.createIndex('date', 'date');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const result = fn(s);
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const db = {
  all: (store) => tx(store, 'readonly', (s) => s.getAll()),
  get: (store, id) => tx(store, 'readonly', (s) => s.get(id)),
  // updatedAt hilft später beim Abgleich mit dem Server
  put: (store, value) => tx(store, 'readwrite', (s) => { s.put({ ...value, updatedAt: Date.now() }); }),
  delete: (store, id) => tx(store, 'readwrite', (s) => { s.delete(id); }),
  clear: (store) => tx(store, 'readwrite', (s) => { s.clear(); }),
};

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch { /* nicht unterstützt */ }
  return false;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataURLToBlob(url) {
  const res = await fetch(url);
  return res.blob();
}

export async function exportAll() {
  const todos = await db.all('todos');
  const receipts = await db.all('receipts');
  const ideas = await db.all('ideas');
  const out = [];
  for (const r of receipts) out.push({ ...r, image: r.image ? await blobToDataURL(r.image) : null });
  return { app: 'lifestyle', version: 1, exportedAt: new Date().toISOString(), todos, ideas, receipts: out };
}

export async function importAll(data) {
  if (!data || data.app !== 'lifestyle') throw new Error('Das ist keine Backup-Datei dieser App.');
  let count = 0;
  for (const t of data.todos || []) { await db.put('todos', t); count++; }
  for (const i of data.ideas || []) { await db.put('ideas', i); count++; }
  for (const r of data.receipts || []) {
    await db.put('receipts', { ...r, image: r.image ? await dataURLToBlob(r.image) : null });
    count++;
  }
  return count;
}
