// Gemeinsamer Datenstand für To-Dos und Ideen (iPhone und Claude-Connector).
// Eine JSON-Datei reicht für eine persönliche App völlig.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const STORES = ['todos', 'ideas'];

export function mergeLog(a = [], b = []) {
  const seen = new Map();
  for (const e of [...a, ...b]) seen.set(`${e.at}|${e.by}|${e.text}`, e);
  return [...seen.values()].sort((x, y) => x.at - y.at);
}

export class Store {
  constructor(dataDir) {
    this.file = join(dataDir, 'sync.json');
    this.dir = dataDir;
    this.data = null;
    this.queue = Promise.resolve();
  }

  async load() {
    if (this.data) return this.data;
    try {
      this.data = JSON.parse(await readFile(this.file, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      this.data = { rev: 0, todos: {}, ideas: {} };
    }
    return this.data;
  }

  async save() {
    await mkdir(this.dir, { recursive: true });
    const tmp = this.file + '.tmp';
    await writeFile(tmp, JSON.stringify(this.data));
    await rename(tmp, this.file);
  }

  // Alle Schreibvorgänge nacheinander ausführen.
  write(fn) {
    const run = this.queue.then(async () => {
      await this.load();
      const out = await fn(this.data);
      await this.save();
      return out;
    });
    this.queue = run.catch(() => {});
    return run;
  }

  // Einen Eintrag übernehmen: der neuere Stand gewinnt, der Ideen-Verlauf wird zusammengeführt.
  applyRecord(d, store, rec) {
    const cur = d[store][rec.id];
    let next = rec;
    if (cur) {
      const newer = (rec.updatedAt || 0) >= (cur.updatedAt || 0);
      next = newer ? rec : cur;
      if (store === 'ideas' && !cur.deleted && !rec.deleted) {
        const log = mergeLog(cur.log, rec.log);
        // Verlauf von beiden Seiten zusammengeführt: neuen Zeitstempel setzen, damit das iPhone ihn übernimmt.
        if (log.length !== (next.log || []).length) next = { ...next, log, updatedAt: Math.max(cur.updatedAt || 0, rec.updatedAt || 0) + 1 };
      }
      if (!newer && JSON.stringify(next) === JSON.stringify(cur)) return false;
    }
    d.rev += 1;
    d[store][rec.id] = { ...next, _rev: d.rev };
    return true;
  }

  async sync(since, changes) {
    return this.write((d) => {
      for (const c of changes || []) {
        if (!STORES.includes(c.store) || !c.record || typeof c.record.id !== 'string') continue;
        const { _rev, ...rec } = c.record;
        this.applyRecord(d, c.store, rec);
      }
      const out = [];
      for (const store of STORES) {
        for (const rec of Object.values(d[store])) {
          if (rec._rev > since) { const { _rev, ...r } = rec; out.push({ store, record: r }); }
        }
      }
      return { rev: d.rev, changes: out };
    });
  }

  async list(store) {
    const d = await this.load();
    return Object.values(d[store]).filter((r) => !r.deleted).map(({ _rev, ...r }) => r);
  }

  async get(store, id) {
    const d = await this.load();
    const r = d[store][id];
    if (!r || r.deleted) return null;
    const { _rev, ...rest } = r;
    return rest;
  }

  async upsert(store, rec) {
    return this.write((d) => {
      const full = { id: rec.id || randomUUID(), createdAt: Date.now(), ...rec, updatedAt: Date.now() };
      this.applyRecord(d, store, full);
      const { _rev, ...r } = d[store][full.id];
      return r;
    });
  }
}
