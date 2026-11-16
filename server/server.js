// Kleiner Server für die Lifestyle-App: liefert die App aus und nimmt Backups an.
// Keine Abhängigkeiten, nur Node.js. Daten liegen in DATA_DIR (in Coolify als Volume einhängen).
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, mkdir, readdir, writeFile, rename, unlink, readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { timingSafeEqual, createHash } from 'node:crypto';
import { Store } from './store.js';
import { handleMcp } from './mcp.js';

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = process.env.PUBLIC_DIR || new URL('../public', import.meta.url).pathname;
const DATA_DIR = process.env.DATA_DIR || '/data';
const TOKEN = process.env.BACKUP_TOKEN || '';
const KEEP = Number(process.env.BACKUP_KEEP || 30);
const MAX_BODY = Number(process.env.BACKUP_MAX_MB || 300) * 1024 * 1024;
const BACKUP_DIR = join(DATA_DIR, 'backups');
const MCP_TOKEN = process.env.MCP_TOKEN || '';
const store = new Store(DATA_DIR);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.gz': 'application/gzip', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(), microphone=()',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });

function same(given, secret) {
  if (!secret) return false;
  const a = createHash('sha256').update(given || '').digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}
const bearer = (req) => { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : ''; };
const authorized = (req) => same(bearer(req), TOKEN);

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error('zu groß'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function listBackups() {
  await mkdir(BACKUP_DIR, { recursive: true });
  return (await readdir(BACKUP_DIR)).filter((f) => f.endsWith('.json')).sort();
}

async function handleApi(req, res, path) {
  if (!TOKEN) return json(res, 503, { error: 'BACKUP_TOKEN ist auf dem Server nicht gesetzt.' });
  if (!authorized(req)) return json(res, 401, { error: 'Nicht berechtigt.' });

  if (path === '/api/backup' && req.method === 'POST') {
    const body = await readBody(req);
    let parsed;
    try { parsed = JSON.parse(body); } catch { return json(res, 400, { error: 'Kein gültiges JSON.' }); }
    if (parsed.app !== 'lifestyle') return json(res, 400, { error: 'Keine Backup-Datei dieser App.' });
    await mkdir(BACKUP_DIR, { recursive: true });
    const name = new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    const tmp = join(BACKUP_DIR, '.' + name + '.tmp');
    await writeFile(tmp, body);
    await rename(tmp, join(BACKUP_DIR, name));
    const all = await listBackups();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP))) await unlink(join(BACKUP_DIR, old)).catch(() => {});
    return json(res, 201, { ok: true, name, bytes: body.length });
  }
  if (path === '/api/sync' && req.method === 'POST') {
    let parsed;
    try { parsed = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'Kein gültiges JSON.' }); }
    const since = Number(parsed.since) || 0;
    return json(res, 200, await store.sync(since, Array.isArray(parsed.changes) ? parsed.changes : []));
  }
  if (path === '/api/backup/latest' && req.method === 'GET') {
    const all = await listBackups();
    if (!all.length) return json(res, 404, { error: 'Noch kein Backup vorhanden.' });
    const data = await readFile(join(BACKUP_DIR, all[all.length - 1]));
    return send(res, 200, data, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  }
  if (path === '/api/backup' && req.method === 'GET') {
    const all = await listBackups();
    const items = await Promise.all(all.map(async (f) => ({ name: f, bytes: (await stat(join(BACKUP_DIR, f))).size })));
    return json(res, 200, { backups: items.reverse() });
  }
  return json(res, 404, { error: 'Unbekannt.' });
}

async function serveStatic(req, res, path) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');
  let rel = decodeURIComponent(path);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(PUBLIC_DIR, rel));
  if (!file.startsWith(normalize(PUBLIC_DIR))) return send(res, 403, 'Forbidden');
  let info;
  try { info = await stat(file); } catch { return send(res, 404, 'Not Found', { 'Content-Type': 'text/plain' }); }
  if (info.isDirectory()) return send(res, 301, '', { Location: path.replace(/\/?$/, '/') });

  const ext = extname(file);
  // App-Dateien immer frisch prüfen lassen, damit Updates sofort beim Service Worker ankommen.
  const cache = rel.includes('/vendor/') || rel.startsWith('/icons/') ? 'public, max-age=604800' : 'no-cache';
  const headers = {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': cache,
    'Last-Modified': info.mtime.toUTCString(),
  };
  if (rel === '/sw.js') headers['Service-Worker-Allowed'] = '/';
  if (req.headers['if-modified-since'] && new Date(req.headers['if-modified-since']) >= new Date(info.mtime.toUTCString())) {
    return send(res, 304, '', { 'Cache-Control': cache });
  }
  res.writeHead(200, { ...SECURITY_HEADERS, ...headers });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    if (pathname === '/mcp' || pathname.startsWith('/mcp/')) {
      // Geheimnis in der Adresse (/mcp/<MCP_TOKEN>) oder als Bearer-Header.
      const ok = same(pathname.slice(5), MCP_TOKEN) || same(bearer(req), MCP_TOKEN);
      if (!ok) return json(res, MCP_TOKEN ? 401 : 503, { error: MCP_TOKEN ? 'Nicht berechtigt.' : 'MCP_TOKEN ist nicht gesetzt.' });
      const body = req.method === 'POST' ? (await readBody(req)).toString('utf8') : '';
      return await handleMcp(store, req, res, body, send);
    }
    return await serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, err.status || 500, { error: err.status === 413 ? 'Backup ist zu groß.' : 'Serverfehler.' });
  }
});

server.listen(PORT, () => {
  console.log(`Lifestyle läuft auf Port ${PORT}${TOKEN ? '' : ' (ohne BACKUP_TOKEN: Backup und Abgleich aus)'}${MCP_TOKEN ? '' : ' (ohne MCP_TOKEN: Claude-Connector aus)'}`);
});
