// Abgleich von To-Dos und Ideen mit dem eigenen Server. So kann Claude über den Connector
// Ideen pflegen und Aufgaben anlegen. Läuft nur mit Internet, die App braucht es nie.
import { db, SYNCED, pendingIds, setPending } from './db.js';
import { backupSettings } from './backup.js';

const REV_KEY = 'lifestyle.sync.rev';
const getRev = () => { try { return Number(localStorage.getItem(REV_KEY)) || 0; } catch { return 0; } };
const setRev = (r) => { try { localStorage.setItem(REV_KEY, String(r)); } catch { /* egal */ } };

// Verlauf zweier Stände einer Idee zusammenführen (nichts geht verloren).
// 401: Schlüssel passt nicht; der Server sagt, wie viele Zeichen er erwartet
async function keyError(res) { let j = null; try { j = await res.json(); } catch { /* keine Antwort von Bummel */ } if (j && j.hint) return 'Server-Schlüssel passt nicht. ' + j.hint; return 'Zugriff abgelehnt (401), aber nicht vom Bummel-Server. Prüf die Server-Adresse unter Mehr oder einen Passwortschutz in Coolify.'; }

export function mergeLog(a = [], b = []) {
  const seen = new Map();
  for (const e of [...a, ...b]) seen.set(`${e.at}|${e.by}|${e.text}`, e);
  return [...seen.values()].sort((x, y) => x.at - y.at);
}

let running = null;
export function sync() {
  if (!running) running = doSync().finally(() => { running = null; });
  return running;
}

async function doSync() {
  const s = backupSettings.get();
  if (!s.token || !navigator.onLine) return { skipped: true };
  const base = (s.url || location.origin).replace(/\/$/, '');

  const pending = pendingIds();
  const keys = Object.keys(pending);
  const changes = [];
  for (const k of keys) {
    const [store, id] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
    if (!SYNCED.includes(store)) continue;
    const rec = await db.raw.get(store, id);
    if (rec) changes.push({ store, record: rec });
  }

  const res = await fetch(base + '/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.token },
    body: JSON.stringify({ since: getRev(), changes }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(res.status === 401 ? await keyError(res) : `Abgleich: Server antwortet mit ${res.status}.`);
  const data = await res.json();

  // Gesendete Änderungen sind angekommen (außer sie wurden inzwischen erneut geändert).
  const now = pendingIds();
  for (const c of changes) {
    const k = c.store + ':' + c.record.id;
    const cur = await db.raw.get(c.store, c.record.id);
    if (cur && cur.updatedAt === c.record.updatedAt) delete now[k];
  }
  setPending(now);

  let incoming = 0;
  for (const { store, record } of data.changes || []) {
    if (!SYNCED.includes(store)) continue;
    const local = await db.raw.get(store, record.id);
    const isPending = !!pendingIds()[store + ':' + record.id];
    if (local && isPending && (local.updatedAt || 0) > (record.updatedAt || 0)) {
      if (store === 'ideas' && !local.deleted && !record.deleted) await db.raw.put(store, { ...local, log: mergeLog(local.log, record.log) });
      continue;
    }
    const same = local && local.updatedAt === record.updatedAt;
    if (!same) {
      const merged = store === 'ideas' && local && !local.deleted && !record.deleted
        ? { ...record, log: mergeLog(local.log, record.log) } : record;
      await db.raw.put(store, merged);
      incoming++;
    }
  }
  setRev(data.rev || getRev());
  return { sent: changes.length, received: incoming };
}
