// Backup auf den eigenen Server (VPS). Läuft nur, wenn Internet da ist; die App selbst braucht es nie.
import { exportAll, importAll } from './db.js';

const KEY = 'lifestyle.backup';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignorieren */ }
}

export const backupSettings = {
  get: () => ({ url: '', token: '', auto: true, lastAt: null, lastError: null, dirty: false, ...load() }),
  set: (patch) => { const s = { ...backupSettings.get(), ...patch }; save(s); return s; },
};

export function markDirty() {
  backupSettings.set({ dirty: true });
}

function endpoint(s) {
  const base = (s.url || location.origin).replace(/\/$/, '');
  return base + '/api/backup';
}

export async function uploadBackup() {
  const s = backupSettings.get();
  if (!s.token) throw new Error('Kein Backup-Schlüssel eingetragen.');
  const body = JSON.stringify(await exportAll());
  const res = await fetch(endpoint(s), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.token },
    body,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'Backup-Schlüssel ist falsch.' : `Server antwortet mit ${res.status}.`);
  backupSettings.set({ lastAt: new Date().toISOString(), lastError: null, dirty: false });
  return body.length;
}

export async function restoreBackup() {
  const s = backupSettings.get();
  if (!s.token) throw new Error('Kein Backup-Schlüssel eingetragen.');
  const res = await fetch(endpoint(s) + '/latest', {
    headers: { Authorization: 'Bearer ' + s.token },
    cache: 'no-store',
  });
  if (res.status === 404) throw new Error('Auf dem Server liegt noch kein Backup.');
  if (!res.ok) throw new Error(res.status === 401 ? 'Backup-Schlüssel ist falsch.' : `Server antwortet mit ${res.status}.`);
  return importAll(await res.json());
}

// Automatisch sichern: wenn etwas geändert wurde, Internet da ist und die letzte Sicherung > 2 Min her ist.
let running = false;
export async function autoBackup(force = false) {
  const s = backupSettings.get();
  if (running || !s.auto || !s.token || !navigator.onLine) return;
  if (!s.dirty && !force) return;
  if (!force && s.lastAt && Date.now() - new Date(s.lastAt).getTime() < 2 * 60 * 1000) return;
  running = true;
  try { await uploadBackup(); } catch (e) { backupSettings.set({ lastError: e.message }); } finally { running = false; }
}
