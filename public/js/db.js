// Kleiner Wrapper um IndexedDB. Alle Daten bleiben auf dem Gerät.

const DB_NAME = 'lifestyle';
const DB_VERSION = 3;
let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('todos')) db.createObjectStore('todos', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('ideas')) db.createObjectStore('ideas', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('shopping')) db.createObjectStore('shopping', { keyPath: 'id' });
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

// Aufgaben, Ideen/Projekte und der Einkauf werden mit dem Server abgeglichen. Gelöschte Einträge bleiben dafür als
// "Grabstein" (deleted: true) liegen und werden in der App ausgeblendet.
export const SYNCED = ['todos', 'ideas', 'shopping'];
const PENDING_KEY = 'lifestyle.sync.pending';

export function pendingIds() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || {}; } catch { return {}; }
}
export function setPending(map) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(map)); } catch { /* egal */ }
}
function markPending(store, id) {
  if (!SYNCED.includes(store)) return;
  const p = pendingIds();
  p[store + ':' + id] = true;
  setPending(p);
}

const raw = {
  all: (store) => tx(store, 'readonly', (s) => s.getAll()),
  get: (store, id) => tx(store, 'readonly', (s) => s.get(id)),
  put: (store, value) => tx(store, 'readwrite', (s) => { s.put(value); }),
};

export const db = {
  raw,
  all: async (store) => (await raw.all(store)).filter((x) => !x.deleted),
  get: async (store, id) => { const x = await raw.get(store, id); return x && !x.deleted ? x : undefined; },
  put: async (store, value) => {
    await raw.put(store, { ...value, updatedAt: Date.now() });
    markPending(store, value.id);
  },
  delete: async (store, id) => {
    if (SYNCED.includes(store)) {
      await raw.put(store, { id, deleted: true, updatedAt: Date.now() });
      markPending(store, id);
    } else {
      await tx(store, 'readwrite', (s) => { s.delete(id); });
    }
  },
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
  const shopping = await db.all('shopping');
  const out = [];
  for (const r of receipts) out.push({ ...r, image: r.image ? await blobToDataURL(r.image) : null });
  return { app: 'lifestyle', version: 1, exportedAt: new Date().toISOString(), todos, ideas, shopping, receipts: out };
}

export async function importAll(data) {
  if (!data || data.app !== 'lifestyle') throw new Error('Das ist keine Backup-Datei dieser App.');
  let count = 0;
  const keep = async (store, rec) => {
    const cur = await raw.get(store, rec.id);
    if (cur && (cur.updatedAt || 0) > (rec.updatedAt || 0)) return;
    await raw.put(store, { ...rec, updatedAt: rec.updatedAt || Date.now() });
    markPending(store, rec.id);
  };
  for (const t of data.todos || []) { await keep('todos', t); count++; }
  for (const i of data.ideas || []) { await keep('ideas', i); count++; }
  for (const x of data.shopping || []) { await keep('shopping', x); count++; }
  for (const r of data.receipts || []) {
    await db.put('receipts', { ...r, image: r.image ? await dataURLToBlob(r.image) : null });
    count++;
  }
  return count;
}
