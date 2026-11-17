// Bummel: Aufgaben, Einkauf, Finanzen und Projekte als Stationen auf einem Weg durch die Stadt.
// Alle Daten liegen auf dem iPhone (IndexedDB). Aufgaben, Einkauf und Projekte werden mit dem eigenen
// Server abgeglichen, damit Claude über den Connector mitarbeiten kann.
import { db, uid, requestPersistence, exportAll, importAll } from './db.js';
import { parseReceipt, CATEGORIES, guessCategory, toISODate } from './parse.js';
import { prepareImage, recognize } from './ocr.js';
import { backupSettings, markDirty, uploadBackup, restoreBackup, autoBackup } from './backup.js';
import { esc, euro, euroShort, parseEuroInput, centsToInput, monthKey, monthLabel, shiftMonth, formatDate, relativeDue } from './util.js';
import { sync } from './sync.js';
import { createWeg } from './weg.js';

const $ = (sel, root = document) => root.querySelector(sel);
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
const B = document.body;
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* egal */ } },
};

// ---------- Bereiche (Stationen am Weg) ----------
const TODO = 0, SHOP = 1, MONEY = 2, PROJ = 3, MORE = 4;
const SECT = [
  { id: 'todos', title: 'Aufgaben', views: [0], free: [-1, 0, 1], cap: 6 },
  { id: 'shop', title: 'Einkauf', views: [-1, 0], free: [0, 1], cap: 6 },
  { id: 'money', title: 'Finanzen', views: [-1, 0, 1], drag: false },
  { id: 'proj', title: 'Projekte', views: [-1, 0], free: [-1, 0, 1], cap: 6 },
  { id: 'more', title: 'Mehr', views: [0], drag: false },
];
const VNAME = [
  { '-1': 'Links', 0: 'Mitte', 1: 'Rechts' },
  { '-1': 'Oft gekauft', 0: 'Liste', 1: 'Liste' },
  { '-1': 'Kategorien', 0: '', 1: '' },
  { '-1': 'Gedankenblitze', 0: 'Projekte', 1: 'Ältere Projekte' },
  { 0: 'Am Ende des Wegs' },
];

const data = { todos: [], ideas: [], shopping: [], receipts: [] };
const state = { month: monthKey(new Date()) };
let weg = null;

// ---------- Kleinkram ----------
const today = () => toISODate(new Date());
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const CK = '<span class="ck"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
const isBlitz = (i) => i.kind === 'blitz';
const isProject = (i) => !isBlitz(i) && i.status !== 'erledigt' && i.status !== 'verworfen';
const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Reihenfolge: von Hand sortierte Karten behalten ihren Platz, neue kommen nach vorne.
function ordered(list, cmp) {
  const free = list.filter((x) => typeof x.order !== 'number').sort(cmp);
  const fixed = list.filter((x) => typeof x.order === 'number').sort((a, b) => a.order - b.order);
  return [...free, ...fixed];
}

// ---------- Hinweis unten (mit Rückgängig) ----------
const toastEl = $('#toast');
let toastT = null;
function toast(msg, o = {}) {
  toastEl.innerHTML = `<span>${esc(msg)}</span>${o.action ? `<button type="button">${esc(o.action)}</button>` : ''}`;
  toastEl.classList.add('show');
  const btn = toastEl.querySelector('button');
  if (btn) btn.addEventListener('pointerup', (e) => { e.stopPropagation(); toastEl.classList.remove('show'); o.onAction && o.onAction(); }, { once: true });
  toastEl.onpointerup = !btn && o.onTap ? () => { toastEl.classList.remove('show'); o.onTap(); } : null;
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), o.ms || (o.action ? 5000 : 2600));
}

// ---------- Daten laden und Karten setzen ----------
async function load() {
  for (const k of Object.keys(data)) data[k] = await db.all(k);
}
async function changed(sections, fly) {
  markDirty();
  await load();
  refresh(sections, fly);
  scheduleSync();
}
function refresh(sections = [TODO, SHOP, MONEY, PROJ, MORE], fly, initial) {
  if (!weg) return;
  for (const si of [].concat(sections)) {
    const r = [todoItems, shopItems, moneyItems, projItems, moreItems][si]();
    weg.setItems(si, r.items, { empty: r.empty, views: r.views, fly, initial });
  }
  weg.refreshHead();
}

// --- Aufgaben ---
// Keine Sortierung: jede neue Aufgabe bekommt einen zufälligen freien Platz (erst Mitte, dann rechts, dann links,
// höchstens 6 je Seite). Der Platz bleibt gespeichert (pos: Seite + x/y) und ändert sich nur durch Halten und Ziehen.
const addDays = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return toISODate(d); };
const openTodos = () => data.todos.filter((t) => !t.done).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
function dueFlag(due) {
  if (!due) return '';
  const td = today();
  if (due === td) return 'Bis heute';
  if (due === addDays(1)) return 'Bis morgen';
  const d = new Date(due + 'T12:00');
  if (due > td && due <= addDays(6)) return 'Bis ' + d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
  return 'Bis ' + d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}
const dueText = (t) => (t.due ? dueFlag(t.due) : t.note ? t.note.split('\n')[0] : '');
const todoCard = (t) => `<div class="row">${CK}<div><div class="t">${esc(t.title)}</div>${dueText(t) ? `<div class="s${t.due && t.due < today() ? ' over' : ''}">${t.due ? '⚑ ' : ''}${esc(dueText(t))}</div>` : ''}</div></div>`;
function todoItems() {
  const items = openTodos().map((t) => ({ key: t.id, v: t.pos ? t.pos.v : 0, free: true, pos: t.pos || null, html: todoCard(t), cls: pendingDone.has(t.id) ? 'done' : '' }));
  return { items, empty: { 0: 'Alles erledigt. Tipp auf eine freie Stelle für eine neue Aufgabe.' } };
}

// --- Einkauf ---
const EMO = [[/hafermilch|milch/, '🥛'], [/brot|brötchen|toast/, '🍞'], [/käse|feta|mozzarella|parmesan/, '🧀'], [/äpfel|apfel/, '🍎'], [/banane/, '🍌'], [/\beier?\b/, '🥚'], [/tomate/, '🍅'], [/zitrone/, '🍋'], [/nudel|pasta|spaghetti/, '🍝'], [/reis/, '🍚'], [/kaffee/, '☕'], [/\btee\b/, '🍵'], [/butter/, '🧈'], [/avocado/, '🥑'], [/gurke/, '🥒'], [/karotte|möhre/, '🥕'], [/salat|spinat/, '🥬'], [/kartoffel/, '🥔'], [/zwiebel/, '🧅'], [/knoblauch/, '🧄'], [/wein/, '🍷'], [/bier/, '🍺'], [/wasser|sprudel/, '💧'], [/joghurt|müsli|haferflocken/, '🥣'], [/fisch|lachs/, '🐟'], [/hähnchen|huhn|fleisch|hack/, '🍗'], [/schoko/, '🍫'], [/zahnpasta|zahnbürste/, '🪥'], [/shampoo|duschgel|creme/, '🧴'], [/seife/, '🧼'], [/klopapier|toilettenpapier|küchenrolle/, '🧻'], [/erdbeer/, '🍓'], [/traube/, '🍇'], [/orange|mandarine/, '🍊'], [/pizza/, '🍕'], [/mehl/, '🌾'], [/honig/, '🍯'], [/basilikum|kräuter|petersilie/, '🌿'], [/blume/, '💐'], [/paprika/, '🫑'], [/pilz|champignon/, '🍄'], [/oliven/, '🫒'], [/kuchen|torte/, '🍰'], [/chips|brezel/, '🥨']];
const emoOf = (t) => { const l = String(t).toLowerCase(); for (const [r, e] of EMO) if (r.test(l)) return e; return '🛒'; };
const onList = () => data.shopping.filter((x) => !x.bought);
function frequent() {
  const listed = new Set(onList().map((x) => norm(x.title)));
  const m = new Map();
  for (const x of data.shopping) {
    if (!x.bought) continue;
    const k = norm(x.title); if (!k || listed.has(k)) continue;
    const e = m.get(k) || { title: x.title, emoji: x.emoji, qty: x.qty, n: 0, last: 0 };
    e.n++; if ((x.boughtAt || 0) > e.last) { e.last = x.boughtAt || 0; e.title = x.title; e.emoji = x.emoji; e.qty = x.qty; }
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || b.last - a.last).slice(0, 10);
}
const shopCard = (x) => `<div class="row">${CK}<div><div class="t">${esc(x.emoji || emoOf(x.title))} ${esc(x.title)}</div>${x.qty || x.note ? `<div class="s">${esc([x.qty, x.note].filter(Boolean).join(' · '))}</div>` : ''}</div></div>`;
function shopItems() {
  // Wie bei Aufgaben: jedes Ding bekommt einen freien Platz (Mitte, dann rechts) und bleibt dort, bis man es verschiebt.
  const items = onList().slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .map((x) => ({ key: x.id, v: x.pos ? x.pos.v : 0, free: true, pos: x.pos || null, views: [0, 1], html: shopCard(x), cls: pendingDone.has(x.id) ? 'done' : '' }));
  for (const f of frequent()) items.push({ key: 'oft:' + norm(f.title), v: -1, html: `<div class="row"><span class="em">${esc(f.emoji || emoOf(f.title))}</span><div><div class="t">${esc(f.title)}</div><div class="s">${f.n}× gekauft</div><span class="add">+ Auf die Liste</span></div></div>` });
  return { items, empty: { '-1': 'Hier landet, was du oft kaufst.', 0: 'Die Liste ist leer. Tipp auf eine freie Stelle.' } };
}

// --- Finanzen ---
function monthData(key) {
  const rs = data.receipts.filter((r) => r.date && r.date.startsWith(key));
  return { rs, total: rs.reduce((s, r) => s + (r.total || 0), 0) };
}
function moneyItems() {
  const m = state.month, cur = monthData(m), prev = monthData(shiftMonth(m, -1));
  const mName = monthLabel(m).split(' ')[0];
  const items = [];
  // Links: Kategorien mit Monatssumme
  const cats = CATEGORIES.map((c) => { const rs = cur.rs.filter((r) => (r.category || 'sonstiges') === c.id); return { ...c, rs, sum: rs.reduce((s, r) => s + r.total, 0) }; })
    .filter((c) => c.sum > 0).sort((a, b) => b.sum - a.sum);
  const top = cats[0] ? cats[0].sum : 1;
  for (const c of cats) items.push({ key: 'cat:' + c.id, v: -1, html: `<div class="row"><span class="em">${c.icon}</span><div><div class="t">${esc(c.name)}</div><div class="s">${esc(euro(c.sum))} · ${c.rs.length} ${c.rs.length === 1 ? 'Beleg' : 'Belege'}</div></div></div><div class="bar"><i style="width:${Math.max(4, Math.round(c.sum / top * 100))}%"></i></div>` });
  // Mitte: der Monat
  let delta = `${cur.rs.length} ${cur.rs.length === 1 ? 'Beleg' : 'Belege'}`;
  if (prev.total > 0 && cur.total > 0) { const p = Math.round((cur.total - prev.total) / prev.total * 100); delta = `${Math.abs(p)} % ${p > 0 ? 'mehr' : 'weniger'} als ${monthLabel(shiftMonth(m, -1)).split(' ')[0]}`; }
  items.push({ key: 'total', v: 0, html: `<div class="k">Ausgegeben im ${esc(mName)}</div><div class="big">${esc(euro(cur.total))}</div><div class="s">${esc(delta)}</div>` });
  const last = [...cur.rs].sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1)).slice(0, 3);
  if (last.length) items.push({ key: 'last', v: 0, html: `<div class="k">Zuletzt</div>${last.map((r) => `<div class="s" style="margin-top:6px;color:var(--ink)">${esc(r.merchant || CAT[r.category]?.name || 'Ausgabe')} · <b>${esc(euro(r.total))}</b></div>`).join('')}` });
  if (data.receipts.length) items.push({ key: 'search', v: 0, html: `<div class="t">🔍 Belege durchsuchen</div><div class="s">${data.receipts.length} insgesamt</div>` });
  // Rechts: das Jahr
  const y = m.slice(0, 4), months = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
  const sums = months.map((k) => monthData(k).total), ytotal = sums.reduce((a, b) => a + b, 0);
  const used = sums.filter((x) => x > 0).length || 1, mx = Math.max(1, ...sums);
  items.push({ key: 'year', v: 1, html: `<div class="k">${y} bisher</div><div class="big">${esc(euroShort(ytotal))}</div><div class="s">Ø ${esc(euroShort(ytotal / used))} im Monat · Monat antippen</div>
    <div class="yr">${sums.map((x, i) => `<i class="${months[i] === m ? 'sel' : ''}" style="height:${Math.max(4, Math.round(x / mx * 100))}%"></i>`).join('')}</div>
    <div class="yrl">${'JFMAMJJASOND'.split('').map((c) => `<span>${c}</span>`).join('')}</div>` });
  if (ytotal > 0) {
    const iMax = sums.indexOf(Math.max(...sums));
    items.push({ key: 'ymax', v: 1, html: `<div class="k">Teuerster Monat</div><div class="t" style="margin-top:6px">${esc(monthLabel(months[iMax]).split(' ')[0])}</div><div class="s">${esc(euro(sums[iMax]))}</div>` });
  }
  return { items, empty: { '-1': `Im ${mName} noch keine Ausgaben.` } };
}

// --- Projekte ---
const IDEA_FIELDS = [
  { key: 'short', label: 'Kurzbeschreibung' }, { key: 'idea', label: 'Idee' }, { key: 'goal', label: 'Ziel' },
  { key: 'implementation', label: 'Umsetzung' }, { key: 'effort', label: 'Aufwand und Kosten' },
  { key: 'summary', label: 'Aktueller Stand' }, { key: 'questions', label: 'Offene Fragen' },
];
const shortDate = (ts) => new Date(ts).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
function projItems() {
  const items = [];
  const blitze = data.ideas.filter(isBlitz).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  for (const b of blitze) items.push({ key: b.id, v: -1, free: true, views: [-1], pos: b.pos && b.pos.v === -1 ? b.pos : null, html: `<div class="blitz"><b>⚡</b>${esc(b.idea || b.title || '')}</div><div class="s">${esc(shortDate(b.createdAt || b.updatedAt || Date.now()))}</div>` });
  const projs = data.ideas.filter(isProject).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  projs.forEach((p) => items.push({ key: p.id, v: p.pos && p.pos.v >= 0 ? p.pos.v : 0, free: true, views: [0, 1], pos: p.pos && p.pos.v >= 0 ? p.pos : null, html: `<div class="t">${p.seenAt ? '' : '<span class="dot"></span>'}${esc(p.title || 'Ohne Titel')}</div>${p.short || p.summary ? `<div class="s">${esc(p.short || p.summary)}</div>` : ''}` }));
  return { items, empty: { '-1': 'Tipp auf eine freie Stelle und halte einen Gedanken fest.', 0: 'Noch keine Projekte. Sag Claude: „Hol meine Gedankenblitze“.' } };
}

// --- Mehr ---
function moreItems() {
  const s = backupSettings.get();
  const when = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'noch nie');
  return { items: [
    { key: 'sync', v: 0, cls: 'mehr', html: `<div class="t"><span class="status-dot ${s.syncError ? 'err' : s.syncAt ? 'ok' : ''}"></span>Abgleich</div><div class="s">${esc(s.syncError ? 'Fehler' : when(s.syncAt))}</div>` },
    { key: 'backup', v: 0, cls: 'mehr', html: `<div class="t"><span class="status-dot ${s.lastError ? 'err' : s.lastAt ? 'ok' : ''}"></span>Sicherung</div><div class="s">${esc(when(s.lastAt))}</div>` },
    { key: 'offline', v: 0, cls: 'mehr', html: `<div class="t"><span class="status-dot ${offline.shell ? 'ok' : ''}"></span>Offline</div><div class="s">${offline.shell ? (offline.ocr ? 'Alles bereit' : 'Texterkennung lädt') : 'Wird vorbereitet'}</div>` },
    { key: 'files', v: 0, cls: 'mehr', html: '<div class="t">Backup als Datei</div><div class="s">Export und Import</div>' },
  ] };
}

// ---------- Kopfzeile ----------
function head(si, v) {
  const n = (x) => x.length;
  if (si === TODO) {
    const list = openTodos();
    const over = list.filter((t) => t.due && t.due < today()).length;
    return { k: '', t: 'Aufgaben', l: `${n(list)} offen${over ? ` · ${over} überfällig` : ''}` };
  }
  if (si === SHOP) return { k: VNAME[si][v], t: 'Einkauf', l: v === -1 ? 'Antippen setzt es auf die Liste' : `${n(onList())} ${n(onList()) === 1 ? 'Ding' : 'Dinge'} auf der Liste` };
  if (si === MONEY) {
    const mName = monthLabel(state.month);
    return { k: v === 1 ? `Das Jahr ${state.month.slice(0, 4)}` : v === -1 ? 'Kategorien' : mName, t: 'Finanzen', l: v === 1 ? 'Alle Monate auf einen Blick' : `${euro(monthData(state.month).total)} im ${mName.split(' ')[0]}` };
  }
  if (si === PROJ) {
    if (v === -1) { const b = data.ideas.filter(isBlitz).length; return { k: 'Gedankenblitze', t: 'Projekte', l: `${b} ${b === 1 ? 'Gedanke' : 'Gedanken'} · Claude macht Projekte daraus` }; }
    const p = data.ideas.filter(isProject).length;
    return { k: VNAME[si][v], t: 'Projekte', l: `${p} ${p === 1 ? 'Projekt' : 'Projekte'}` };
  }
  return { k: 'Am Ende des Wegs', t: 'Mehr', l: 'Abgleich, Sicherung und Einstellungen' };
}
const tip = (si) => (si === MORE ? '' : si === PROJ ? 'Auf eine freie Stelle tippen, um einen Gedanken festzuhalten' : 'Auf eine freie Stelle tippen, um etwas anzulegen');

// ---------- Antippen von Karten ----------
const pendingDone = new Set();
async function onCardTap(h) {
  const { si, key, lx } = h;
  if (si === TODO) {
    const t = data.todos.find((x) => x.id === key); if (!t) return;
    if (lx < 42) return completeTodo(t);
    return todoSheet(t);
  }
  if (si === SHOP) {
    if (key.startsWith('oft:')) {
      const f = frequent().find((x) => 'oft:' + norm(x.title) === key); if (!f) return;
      const rect = weg.cardRect(SHOP, key);
      return addShop({ title: f.title, qty: f.qty || '', emoji: f.emoji }, rect, 'Wieder auf der Liste');
    }
    const x = data.shopping.find((y) => y.id === key); if (!x) return;
    if (lx < 42) return buyShop(x);
    return shopSheet(x);
  }
  if (si === MONEY) {
    if (key.startsWith('cat:')) return categorySheet(key.slice(4));
    if (key === 'year') {
      const i = Math.max(0, Math.min(11, Math.floor((lx - 12) / Math.max(1, h.w - 24) * 12)));
      state.month = `${state.month.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`;
      refresh(MONEY); toast(`${monthLabel(state.month)} gewählt`, { action: 'Zeigen', onAction: () => weg.setView(0) });
      return;
    }
    if (key === 'search' || key === 'last' || key === 'total') return receiptsSheet();
    if (key === 'ymax') return;
  }
  if (si === PROJ) {
    const i = data.ideas.find((x) => x.id === key); if (!i) return;
    return isBlitz(i) ? blitzSheet(i) : projectSheet(i);
  }
  if (si === MORE) return settingsSheet();
}
function onMore(si, v) {
  if (si === PROJ) return projectList();
  if (si === TODO) return listSheet('Alle Aufgaben', openTodos().map((t) => ({ title: t.title, sub: dueText(t), open: () => todoSheet(t) })));
  if (si === SHOP) return listSheet('Einkaufsliste', onList().map((x) => ({ title: `${x.emoji || emoOf(x.title)} ${x.title}`, sub: x.qty, open: () => shopSheet(x) })));
  if (si === MONEY && v === -1) return receiptsSheet();
}

async function completeTodo(t) {
  pendingDone.add(t.id); refresh(TODO);
  setTimeout(async () => {
    pendingDone.delete(t.id);
    const cur = await db.get('todos', t.id); if (!cur) return;
    await db.put('todos', { ...cur, done: true, doneAt: Date.now() });
    await changed(TODO);
    toast('Erledigt', { action: 'Rückgängig', onAction: async () => { const c = await db.get('todos', t.id); if (c) { await db.put('todos', { ...c, done: false, doneAt: null }); await changed(TODO); } } });
  }, 420);
}
async function buyShop(x) {
  pendingDone.add(x.id); refresh(SHOP);
  setTimeout(async () => {
    pendingDone.delete(x.id);
    const cur = await db.get('shopping', x.id); if (!cur) return;
    await db.put('shopping', { ...cur, bought: true, boughtAt: Date.now() });
    await changed(SHOP);
    toast(`${cur.title} abgehakt`, { action: 'Rückgängig', onAction: async () => { const c = await db.get('shopping', x.id); if (c) { await db.put('shopping', { ...c, bought: false, boughtAt: null }); await changed(SHOP); } } });
  }, 380);
}
async function addShop({ title, qty = '', emoji, note = '' }, rect, msg) {
  const same = onList().find((x) => norm(x.title) === norm(title));
  if (same) {
    const n = parseInt(same.qty, 10);
    const add = parseInt(qty, 10) || 1;
    const next = /^\d+$/.test(String(same.qty || '').trim()) || !same.qty ? String((Number.isFinite(n) ? n : 1) + add) : same.qty;
    await db.put('shopping', { ...same, qty: next });
    await changed(SHOP);
    toast(`${same.title} steht schon drauf, Menge erhöht`);
    return;
  }
  const id = uid();
  await db.put('shopping', { id, title, qty, emoji: emoji || emoOf(title), note, bought: false, createdAt: Date.now() });
  await changed(SHOP, rect ? { [id]: rect } : null);
  if (msg) toast(msg);
}

// Halten und Ziehen: Aufgaben, Einkauf und Projekte merken sich ihren Platz (Seite + x/y).
async function onReorder() {}
async function onPlace(si, list) {
  const store = si === TODO ? 'todos' : si === SHOP ? 'shopping' : si === PROJ ? 'ideas' : null;
  if (!store) return;
  for (const { key, pos } of list) {
    const rec = await db.get(store, key);
    if (rec) await db.put(store, { ...rec, pos });
  }
  markDirty(); await load(); scheduleSync();
}

// ---------- Blätter ----------
const sheet = $('#sheet'), veil = $('#veil');
let sheetClose = null;
function openSheet(html, onClose) {
  if (cmpCtx) closeCmp();
  sheet.innerHTML = `<button class="grab" type="button" aria-label="Schließen"><i></i></button>${html}`;
  sheet.classList.add('on'); veil.classList.add('on');
  sheetClose = onClose || null;
  weg && weg.pause(true);
  const body = sheet.querySelector('.sbody'); if (body) body.scrollTop = 0;
  sheet.querySelector('.grab').addEventListener('click', () => closeSheet());
  bindSheetDrag();
}
async function closeSheet(skipHandler) {
  if (!sheet.classList.contains('on')) return;
  const h = sheetClose; sheetClose = null;
  const a = document.activeElement; if (a && a.blur) a.blur();
  sheet.classList.remove('on'); veil.classList.remove('on');
  weg && weg.pause(false);
  if (h && !skipHandler) await h();
  setTimeout(() => { if (!sheet.classList.contains('on')) sheet.innerHTML = ''; }, 400);
}
veil.addEventListener('pointerup', () => closeSheet());
// Blatt am Griff nach unten ziehen schließt es
function bindSheetDrag() {
  const grab = sheet.querySelector('.grab'), headEl = sheet.querySelector('.shead');
  let y0 = null, dy = 0;
  const start = (e) => { y0 = e.clientY; dy = 0; sheet.style.transition = 'none'; };
  const move = (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = `translateY(${dy}px)`; };
  const end = () => { if (y0 == null) return; y0 = null; sheet.style.transition = ''; sheet.style.transform = ''; if (dy > 90) closeSheet(); };
  for (const el of [grab, headEl].filter(Boolean)) {
    el.addEventListener('pointerdown', (e) => { if (e.target.closest('button:not(.grab),input,textarea')) return; start(e); el.setPointerCapture && el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }
}
const sheetHead = (title, right = '<button class="link" data-act="close">Fertig</button>') => `<div class="shead"><div class="grow">${title ? `<h2>${esc(title)}</h2>` : ''}</div>${right}</div>`;
function bindClose() { const b = sheet.querySelector('[data-act="close"]'); if (b) b.onclick = () => closeSheet(); }
function listSheet(title, rows) {
  openSheet(`${sheetHead(title)}<div class="sbody"><div class="list">${rows.map((r, i) => `<div class="lrow" data-i="${i}"><div class="grow"><div class="title">${esc(r.title)}</div>${r.sub ? `<div class="sub">${esc(r.sub)}</div>` : ''}</div></div>`).join('')}</div></div>`);
  bindClose();
  sheet.querySelectorAll('[data-i]').forEach((el) => el.addEventListener('click', () => { const r = rows[+el.dataset.i]; closeSheet().then(() => setTimeout(r.open, 80)); }));
}

// --- Aufgabe ---
// Deadline (optional): Schnellwahl und Erkennung im Text („bis morgen“, „Samstag“ …)
const WHEN = [['Heute', /\b(bis )?heute\b/i], ['Morgen', /\b(bis )?morgen\b/i], ['Wochenende', /\b(bis )?(zum |am )?(wochenende|samstag|sonntag)\b/i], ['Nächste Woche', /\b(bis )?nächste[n]? woche\b/i]];
function whenDue(w) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (w === 'Heute') return toISODate(d);
  if (w === 'Morgen') { d.setDate(d.getDate() + 1); return toISODate(d); }
  if (w === 'Wochenende') { const wd = d.getDay(); d.setDate(d.getDate() + (wd === 6 || wd === 0 ? 0 : 6 - wd)); return toISODate(d); }
  if (w === 'Nächste Woche') { const wd = d.getDay(); d.setDate(d.getDate() + (((8 - wd) % 7) || 7)); return toISODate(d); }
  return null;
}
function todoSheet(t) {
  let due = t.due || null;
  openSheet(`${sheetHead('')}<div class="sbody">
      <textarea class="ttl" id="t-title" rows="2">${esc(t.title)}</textarea>
      <div class="field"><span>Deadline</span><div class="datef${due ? ' set' : ''}" id="t-df"><input id="t-due" type="date" value="${esc(due || '')}"><button type="button" class="clr" id="t-clr" aria-label="Deadline entfernen">×</button></div></div>
      <label class="field"><span>Notiz</span><textarea id="t-note" rows="3" placeholder="Optional">${esc(t.note || '')}</textarea></label>
      <div class="btn-row"><button class="btn primary" data-act="done">Erledigt</button><button class="btn danger" data-act="delete">Löschen</button></div>
    </div>`, async () => {
    const title = $('#t-title').value.trim() || t.title, note = $('#t-note').value.trim();
    const cur = await db.get('todos', t.id); if (!cur) return;
    if (title !== cur.title || note !== (cur.note || '') || due !== (cur.due || null)) {
      await db.put('todos', { ...cur, title, note, due });
      await changed(TODO);
    }
  });
  bindClose();
  const setDue = (d) => { due = d; $('#t-due').value = due || ''; $('#t-df').classList.toggle('set', !!due); };
  $('#t-clr').addEventListener('click', () => setDue(null));
  $('#t-due').addEventListener('change', (e) => setDue(e.target.value || null));
  sheet.querySelector('[data-act="done"]').onclick = async () => { await closeSheet(); completeTodo(t); };
  sheet.querySelector('[data-act="delete"]').onclick = async () => {
    await closeSheet(true);
    const orig = await db.get('todos', t.id); await db.delete('todos', t.id); await changed(TODO);
    toast('Aufgabe gelöscht', { action: 'Rückgängig', onAction: async () => { await db.put('todos', orig); await changed(TODO); } });
  };
}

// --- Einkauf ---
function shopSheet(x) {
  let qty = x.qty || '';
  openSheet(`${sheetHead('')}<div class="sbody">
      <textarea class="ttl" id="s-title" rows="1">${esc(x.title)}</textarea>
      <div class="lab">Menge</div>
      <div class="stepper"><button type="button" data-q="-1">−</button><input class="inp" id="s-qty" value="${esc(qty)}" placeholder="1"><button type="button" data-q="1">+</button></div>
      <label class="field"><span>Notiz</span><input id="s-note" value="${esc(x.note || '')}" placeholder="z. B. die Barista-Sorte"></label>
      <div class="btn-row"><button class="btn primary" data-act="buy">Abhaken</button><button class="btn danger" data-act="delete">Löschen</button></div>
    </div>`, async () => {
    const cur = await db.get('shopping', x.id); if (!cur) return;
    const title = $('#s-title').value.trim() || cur.title, q = $('#s-qty').value.trim(), note = $('#s-note').value.trim();
    if (title !== cur.title || q !== (cur.qty || '') || note !== (cur.note || '')) { await db.put('shopping', { ...cur, title, qty: q, note, emoji: title !== cur.title ? emoOf(title) : cur.emoji }); await changed(SHOP); }
  });
  bindClose();
  sheet.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
    const el = $('#s-qty'); const m = el.value.match(/^(\d+)(.*)$/);
    const n = m ? +m[1] : (el.value ? NaN : 1);
    if (!Number.isFinite(n)) return;
    const next = Math.max(1, n + +b.dataset.q); el.value = String(next) + (m ? m[2] : '');
  }));
  sheet.querySelector('[data-act="buy"]').onclick = async () => { await closeSheet(); buyShop(x); };
  sheet.querySelector('[data-act="delete"]').onclick = async () => {
    await closeSheet(true);
    const orig = await db.get('shopping', x.id); await db.delete('shopping', x.id); await changed(SHOP);
    toast('Gelöscht', { action: 'Rückgängig', onAction: async () => { await db.put('shopping', orig); await changed(SHOP); } });
  };
}

// --- Projekte ---
function blitzSheet(b) {
  openSheet(`${sheetHead('Gedankenblitz')}<div class="sbody">
      <p class="muted small" style="margin:0 0 10px">${esc(new Date(b.createdAt || Date.now()).toLocaleString('de-DE', { dateStyle: 'long', timeStyle: 'short' }))}</p>
      <textarea class="inp" id="b-text" rows="6" style="font-size:17px;line-height:1.4">${esc(b.idea || b.title || '')}</textarea>
      <p class="hint" style="margin-top:12px">Sag Claude zum Beispiel: „Hol meine Gedankenblitze und lass uns einen ausarbeiten.“ Daraus wird dann ein Projekt in der Mitte.</p>
      <button class="btn danger block" data-act="delete">Löschen</button>
    </div>`, async () => {
    const cur = await db.get('ideas', b.id); if (!cur) return;
    const text = $('#b-text').value.trim();
    if (text && text !== (cur.idea || '')) { await db.put('ideas', { ...cur, idea: text }); await changed(PROJ); }
  });
  bindClose();
  sheet.querySelector('[data-act="delete"]').onclick = async () => {
    await closeSheet(true);
    const orig = await db.get('ideas', b.id); await db.delete('ideas', b.id); await changed(PROJ);
    toast('Gedanke gelöscht', { action: 'Rückgängig', onAction: async () => { await db.put('ideas', orig); await changed(PROJ); } });
  };
}
function projectSheet(p) {
  const secs = IDEA_FIELDS.filter((f) => (p[f.key] || '').trim()).map((f) => `<div class="sec"><h4>${esc(f.label)}</h4><p class="txt">${esc(p[f.key])}</p></div>`).join('');
  const log = (p.log || []).slice().reverse();
  openSheet(`${sheetHead(p.title || 'Projekt')}<div class="sbody">
      ${p.blitzAt ? `<p class="muted small" style="margin:0 0 6px">Aus deinem Gedankenblitz vom ${esc(new Date(p.blitzAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }))}</p>` : ''}
      ${secs || '<p class="muted">Noch keine Details. Claude füllt das Projekt, wenn ihr darüber sprecht.</p>'}
      ${log.length ? `<details class="raw" style="margin-top:18px"><summary>Verlauf (${log.length})</summary>${log.map((e) => `<p class="small" style="margin:0 0 8px"><span class="muted">${esc(new Date(e.at).toLocaleDateString('de-DE'))} · ${e.by === 'claude' ? 'Claude' : 'Du'}</span><br>${esc(e.text)}</p>`).join('')}</details>` : ''}
      <button class="btn primary block" data-act="end" style="margin-top:18px">Beenden</button>
    </div>`);
  bindClose();
  if (!p.seenAt) db.put('ideas', { ...p, seenAt: Date.now() }).then(() => changed(PROJ));
  sheet.querySelector('[data-act="end"]').onclick = async () => {
    await closeSheet(true);
    const orig = await db.get('ideas', p.id); await db.delete('ideas', p.id); await changed(PROJ);
    toast('Projekt beendet', { action: 'Rückgängig', onAction: async () => { await db.put('ideas', orig); await changed(PROJ); } });
  };
}
function projectList() {
  const all = ordered(data.ideas.filter(isProject), (a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  openSheet(`${sheetHead('Alle Projekte')}<div class="sbody"><input class="search" id="p-q" type="search" placeholder="Suchen"><div class="list" id="p-list"></div></div>`);
  bindClose();
  const draw = () => {
    const q = norm($('#p-q').value);
    const rows = all.filter((p) => !q || norm([p.title, ...IDEA_FIELDS.map((f) => p[f.key])].join(' ')).includes(q));
    $('#p-list').innerHTML = rows.map((p) => `<div class="lrow" data-id="${p.id}"><div class="grow"><div class="title">${esc(p.title)}</div>${p.short ? `<div class="sub">${esc(p.short)}</div>` : ''}</div></div>`).join('') || '<p class="muted" style="padding:14px">Nichts gefunden.</p>';
    sheet.querySelectorAll('[data-id]').forEach((el) => el.addEventListener('click', () => { const p = all.find((x) => x.id === el.dataset.id); closeSheet().then(() => setTimeout(() => projectSheet(p), 80)); }));
  };
  $('#p-q').addEventListener('input', draw); draw();
}

// --- Finanzen ---
const imageUrls = new Map();
function imageUrl(r) { if (!r.image) return null; if (!imageUrls.has(r.id)) imageUrls.set(r.id, URL.createObjectURL(r.image)); return imageUrls.get(r.id); }
function dropImageUrl(id) { const u = imageUrls.get(id); if (u) { URL.revokeObjectURL(u); imageUrls.delete(id); } }
function receiptRow(r) {
  const c = CAT[r.category] || CAT.sonstiges; const img = imageUrl(r);
  return `<div class="lrow" data-rid="${r.id}">${img ? `<img class="thumb" src="${img}" alt="">` : `<div class="thumb">${c.icon}</div>`}
    <div class="grow"><div class="title">${esc(r.merchant || c.name)}</div><div class="sub">${esc(formatDate(r.date))} · ${esc(c.name)}</div></div><div class="amount">${esc(euro(r.total))}</div></div>`;
}
function bindReceiptRows(root) {
  root.querySelectorAll('[data-rid]').forEach((row) => row.addEventListener('click', async () => {
    const r = await db.get('receipts', row.dataset.rid);
    if (r) closeSheet(true).then(() => setTimeout(() => editReceipt(r), 80));
  }));
}
function weekLabel(iso) {
  const d = new Date(iso); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd);
  const e = new Date(d); e.setDate(e.getDate() + 6);
  const f = (x) => x.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  return `${f(d)} – ${f(e)}`;
}
function categorySheet(cat) {
  const c = CAT[cat] || CAT.sonstiges;
  const rs = monthData(state.month).rs.filter((r) => (r.category || 'sonstiges') === cat).sort((a, b) => (a.date < b.date ? 1 : -1));
  const groups = new Map(); for (const r of rs) { const k = weekLabel(r.date); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  openSheet(`${sheetHead(`${c.icon} ${c.name}`)}<div class="sbody"><p class="muted" style="margin:0 0 4px">${esc(monthLabel(state.month))} · ${esc(euro(rs.reduce((s, r) => s + r.total, 0)))}</p>
    ${[...groups].map(([k, list]) => `<div class="gh"><span>${esc(k)}</span><span>${esc(euro(list.reduce((s, r) => s + r.total, 0)))}</span></div><div class="list">${list.map(receiptRow).join('')}</div>`).join('')}</div>`);
  bindClose(); bindReceiptRows(sheet);
}
function receiptsSheet() {
  const all = data.receipts.slice().sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1));
  openSheet(`${sheetHead('Belege')}<div class="sbody"><input class="search" id="r-q" type="search" placeholder="Suchen, z. B. IKEA"><div id="r-sum" class="muted small" style="margin:-4px 4px 10px"></div><div id="r-list"></div></div>`);
  bindClose();
  const draw = () => {
    const q = norm($('#r-q').value);
    const rows = q ? all.filter((r) => norm(`${r.merchant} ${r.note} ${CAT[r.category]?.name}`).includes(q)) : all.filter((r) => r.date.startsWith(state.month));
    $('#r-sum').textContent = q ? `${rows.length} Treffer · ${euro(rows.reduce((s, r) => s + r.total, 0))}` : `${monthLabel(state.month)} · Suche geht über alle Monate`;
    const groups = new Map(); for (const r of rows) { const k = r.date.slice(0, 7); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    $('#r-list').innerHTML = [...groups].map(([k, list]) => `<div class="gh"><span>${esc(monthLabel(k))}</span><span>${esc(euro(list.reduce((s, r) => s + r.total, 0)))}</span></div><div class="list">${list.slice(0, 200).map(receiptRow).join('')}</div>`).join('') || '<p class="muted" style="padding:10px 4px">Nichts gefunden.</p>';
    bindReceiptRows(sheet);
  };
  $('#r-q').addEventListener('input', draw); draw();
}
function editReceipt(r, hint) {
  const photoUrl = r.image ? URL.createObjectURL(r.image) : null;
  let category = r.category || 'sonstiges';
  openSheet(`${sheetHead(r.isNew ? 'Neuer Beleg' : 'Beleg', '<button class="link" data-act="save">Sichern</button>')}<div class="sbody">
    ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
    ${photoUrl ? `<img class="receipt-photo" src="${photoUrl}" alt="Foto des Belegs">` : ''}
    <label class="field"><span>Betrag (€)</span><input id="r-total" class="big" inputmode="decimal" placeholder="0,00" value="${esc(centsToInput(r.total))}"></label>
    <label class="field"><span>Händler</span><input id="r-merchant" value="${esc(r.merchant || '')}" placeholder="z. B. Rewe"></label>
    <label class="field"><span>Datum</span><input id="r-date" type="date" value="${esc(r.date || '')}"></label>
    <div class="lab">Kategorie</div><div class="chips">${CATEGORIES.map((c) => `<button type="button" class="chip${c.id === category ? ' on' : ''}" data-cat="${c.id}">${c.icon} ${esc(c.name)}</button>`).join('')}</div>
    <label class="field"><span>Notiz</span><input id="r-note" value="${esc(r.note || '')}" placeholder="optional"></label>
    ${r.ocrText ? `<details class="raw"><summary>Erkannter Text</summary><pre>${esc(r.ocrText)}</pre></details>` : ''}
    ${r.isNew ? '' : '<button class="btn danger block" data-act="delete" style="margin-top:10px">Beleg löschen</button>'}
  </div>`, () => { if (photoUrl) URL.revokeObjectURL(photoUrl); });
  sheet.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { category = b.dataset.cat; sheet.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === b)); }));
  sheet.querySelector('[data-act="save"]').onclick = async () => {
    const total = parseEuroInput($('#r-total').value);
    if (total == null || total <= 0) { toast('Bitte einen Betrag eintragen'); $('#r-total').focus(); return; }
    const rec = { id: r.id, merchant: $('#r-merchant').value.trim(), date: $('#r-date').value || toISODate(new Date()), total, category, note: $('#r-note').value.trim(), image: r.image || null, ocrText: r.ocrText || '', createdAt: r.createdAt || Date.now() };
    await db.put('receipts', rec); dropImageUrl(rec.id);
    state.month = rec.date.slice(0, 7);
    await closeSheet(); await changed(MONEY);
    toast(r.isNew ? `${euro(total)} eingetragen` : 'Gespeichert');
  };
  const del = sheet.querySelector('[data-act="delete"]');
  if (del) del.onclick = async () => {
    await closeSheet(true);
    const orig = await db.get('receipts', r.id); await db.delete('receipts', r.id); dropImageUrl(r.id); await changed(MONEY);
    toast('Beleg gelöscht', { action: 'Rückgängig', onAction: async () => { await db.put('receipts', orig); await changed(MONEY); } });
  };
}
function chooseSource() {
  openSheet(`${sheetHead('Beleg scannen', '<button class="link" data-act="close">Abbrechen</button>')}<div class="sbody"><div style="display:grid;gap:10px">
    <button class="btn primary block" data-act="camera">📷 Foto aufnehmen</button><button class="btn block" data-act="gallery">🖼️ Aus Fotos wählen</button></div>
    <p class="hint" style="margin-top:14px">Bon flach auf einen dunklen Untergrund legen und gerade von oben fotografieren. Die Texterkennung läuft auf deinem iPhone.</p></div>`);
  bindClose();
  sheet.querySelector('[data-act="camera"]').onclick = () => { closeSheet(true); $('#camera').click(); };
  sheet.querySelector('[data-act="gallery"]').onclick = () => { closeSheet(true); $('#gallery').click(); };
}
for (const id of ['camera', 'gallery']) {
  $('#' + id).addEventListener('change', async (e) => { const file = e.target.files && e.target.files[0]; e.target.value = ''; if (file) await scanFile(file); });
}
async function scanFile(file) {
  openSheet(`<div class="sbody"><div class="progress"><div class="spinner"></div><p id="scan-status" style="margin:14px 0 0;font-weight:600">Bereite Foto vor …</p><div class="bar"><div id="scan-bar"></div></div><p class="small muted">Die Texterkennung läuft komplett auf deinem iPhone.</p></div></div>`);
  const setProgress = (msg, p) => { const s = $('#scan-status'); const b = $('#scan-bar'); if (s) s.textContent = msg; if (b) b.style.width = Math.round(p * 100) + '%'; };
  let photo = null, parsed = { merchant: '', date: null, total: null, category: 'sonstiges' }, text = '', failed = false;
  try { const prep = await prepareImage(file); photo = prep.photo; text = await recognize(prep.ocrCanvas, setProgress); parsed = parseReceipt(text); } catch (err) { console.error(err); failed = true; }
  await closeSheet(true);
  editReceipt({ id: uid(), merchant: parsed.merchant, date: parsed.date || toISODate(new Date()), total: parsed.total, category: parsed.category, note: '', image: photo, ocrText: text, createdAt: Date.now(), isNew: true },
    failed ? 'Die Texterkennung hat nicht geklappt. Trag die Werte bitte von Hand ein.' : 'Automatisch erkannt. Bitte kurz prüfen, vor allem den Betrag.');
}

// --- Mehr: Abgleich, Sicherung, Datei ---
function settingsSheet() {
  const s = backupSettings.get();
  const when = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'noch nie');
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  openSheet(`${sheetHead('Einstellungen')}<div class="sbody">
    <p class="small" style="margin:0 0 6px"><span class="status-dot ${s.syncError ? 'err' : s.syncAt ? 'ok' : ''}"></span>Abgleich mit Claude: <b>${esc(when(s.syncAt))}</b>${s.syncError ? `<br><span style="color:var(--warn)">${esc(s.syncError)}</span>` : ''}</p>
    <p class="small" style="margin:0"><span class="status-dot ${s.lastError ? 'err' : s.lastAt ? 'ok' : ''}"></span>Letzte Sicherung: <b>${esc(when(s.lastAt))}</b>${s.lastError ? `<br><span style="color:var(--warn)">${esc(s.lastError)}</span>` : ''}</p>
    <label class="field"><span>Server-Schlüssel</span><input id="b-token" type="password" autocomplete="off" value="${esc(s.token)}" placeholder="vom Server (BACKUP_TOKEN)"></label>
    <label class="field"><span>Server-Adresse (leer = diese Seite)</span><input id="b-url" inputmode="url" autocomplete="off" value="${esc(s.url)}" placeholder="${esc(location.origin)}"></label>
    <label class="check-row"><input id="b-auto" type="checkbox" ${s.auto ? 'checked' : ''}><span>Automatisch sichern, wenn Internet da ist</span></label>
    <div class="btn-row"><button class="btn primary" id="b-now">Jetzt sichern</button><button class="btn" id="b-sync">Abgleichen</button><button class="btn" id="b-restore">Wiederherstellen</button></div>
    <div class="lab">Backup als Datei</div>
    <div class="btn-row"><button class="btn" id="f-export">Exportieren</button><button class="btn" id="f-import">Importieren</button></div>
    <div class="lab">Über die App</div>
    <p class="small" style="margin:0 0 6px">Alle Daten liegen auf diesem iPhone, die App läuft auch ohne Internet.</p>
    <p class="small" style="margin:0"><span class="status-dot ${offline.shell ? 'ok' : ''}"></span>App offline verfügbar: <b>${offline.shell ? 'ja' : 'noch nicht'}</b><br><span class="status-dot ${offline.ocr ? 'ok' : ''}"></span>Texterkennung offline: <b>${offline.ocr ? 'ja' : 'wird geladen …'}</b></p>
    ${standalone ? '' : '<p class="hint" style="margin-top:12px">Zum Installieren: in Safari auf <b>Teilen</b> tippen und <b>Zum Home-Bildschirm</b> wählen.</p>'}
    <p class="muted small">Version <span id="app-version">…</span></p>
  </div>`, () => refresh(MORE));
  bindClose();
  const save = () => backupSettings.set({ token: $('#b-token').value.trim(), url: $('#b-url').value.trim(), auto: $('#b-auto').checked });
  ['b-token', 'b-url', 'b-auto'].forEach((id) => $('#' + id).addEventListener('change', save));
  $('#b-now').onclick = async (e) => {
    save(); e.target.disabled = true; e.target.textContent = 'Sichere …';
    try { const bytes = await uploadBackup(); toast(`Gesichert (${(bytes / 1024 / 1024).toFixed(1)} MB)`); } catch (err) { backupSettings.set({ lastError: err.message }); toast(navigator.onLine ? err.message : 'Kein Internet. Sicherung später.'); }
    e.target.disabled = false; e.target.textContent = 'Jetzt sichern';
  };
  $('#b-sync').onclick = async (e) => { save(); e.target.disabled = true; await runSync(); const st = backupSettings.get(); toast(st.syncError ? st.syncError : 'Abgeglichen'); e.target.disabled = false; };
  $('#b-restore').onclick = async () => {
    save(); if (!confirm('Das letzte Backup vom Server laden? Gleiche Einträge werden überschrieben, neue bleiben erhalten.')) return;
    try { const n = await restoreBackup(); imageUrls.forEach((u) => URL.revokeObjectURL(u)); imageUrls.clear(); await load(); refresh(); toast(`${n} Einträge wiederhergestellt`); } catch (err) { toast(err.message); }
  };
  $('#f-export').onclick = async () => {
    const d = await exportAll(); const blob = new Blob([JSON.stringify(d)], { type: 'application/json' });
    const name = `bummel-backup-${toISODate(new Date())}.json`; const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (err) { if (err.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  $('#f-import').onclick = () => $('#import-file').click();
  showVersion();
}
$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0]; e.target.value = ''; if (!file) return;
  try { const n = await importAll(JSON.parse(await file.text())); imageUrls.forEach((u) => URL.revokeObjectURL(u)); imageUrls.clear(); markDirty(); await load(); refresh(); toast(`${n} Einträge importiert`); } catch (err) { toast(err.message || 'Datei konnte nicht gelesen werden'); }
});
async function showVersion() {
  const el = $('#app-version'); if (!el) return;
  try { const keys = await caches.keys(); el.textContent = keys.find((k) => k.startsWith('lifestyle-'))?.replace('lifestyle-', '') || 'Entwicklung'; } catch { el.textContent = '–'; }
}

// ---------- Anlegen: Tipp auf eine freie Stelle ----------
const cmp = $('#cmp'), scrim = $('#scrim');
let cmpCtx = null, manual = {}, pendingFocus = false;
const chip = (g, label, on, extra = '') => `<button type="button" class="chip ${extra}${on ? ' on' : ''}" data-g="${g}" data-v="${esc(label)}">${esc(label)}</button>`;
function quickShop() {
  const f = frequent().slice(0, 6).map((x) => [x.emoji || emoOf(x.title), x.title]);
  const base = [['🥚', 'Eier'], ['🍌', 'Bananen'], ['🥛', 'Milch'], ['🍞', 'Brot'], ['🧈', 'Butter'], ['☕', 'Kaffee']];
  const listed = new Set(onList().map((x) => norm(x.title)));
  const out = [...f]; for (const b of base) if (out.length < 6 && !out.some((x) => norm(x[1]) === norm(b[1]))) out.push(b);
  return out.filter((x) => !listed.has(norm(x[1])));
}
function cmpHtml(type, v) {
  const x = '<button type="button" class="x" data-act="x">Abbrechen</button>';
  if (type === 'todo') {
    return `<div class="kk"><span>Neue Aufgabe</span>${x}</div><div class="fld"><span class="ck"></span><input id="fT" placeholder="Was steht an?" enterkeyhint="done" autocomplete="off" autocapitalize="sentences"></div>
      <div class="lab">Deadline, wenn es eine gibt</div><div class="datef" id="fDf"><input id="fW" type="date"><button type="button" class="clr" data-act="clr" aria-label="Deadline entfernen">×</button></div>
      <div class="foot"><span class="dest" id="fD"></span><button type="button" class="go" id="fGo" disabled>Hinzufügen</button></div>`;
  }
  if (type === 'shop') {
    const q = quickShop();
    return `<div class="kk"><span>Auf die Liste</span>${x}</div><div class="fld"><span class="em" id="fE">🛒</span><input id="fT" placeholder="Was fehlt?" enterkeyhint="done" autocomplete="off" autocapitalize="sentences"></div>
      <div class="chips">${['1', '2', '3', '6', '500 g', '1 kg'].map((qq) => chip('qty', qq, false)).join('')}</div>
      ${q.length ? `<div class="lab">Oft gekauft · antippen setzt es sofort drauf</div><div class="chips">${q.map(([e, t]) => chip('quick', e + ' ' + t, false, 'q')).join('')}</div>` : ''}
      <div class="foot"><span class="dest">Landet auf der Liste</span><button type="button" class="go" id="fGo" disabled>Hinzufügen</button></div>`;
  }
  if (type === 'money') {
    return `<div class="kk"><span>Neue Ausgabe</span>${x}</div><div class="amt"><input id="fA" inputmode="decimal" placeholder="0,00" enterkeyhint="next" autocomplete="off"><span>€</span></div><div class="sep"></div>
      <div class="fld"><input id="fT" placeholder="Wofür? Zum Beispiel Bäcker" enterkeyhint="done" autocomplete="off" autocapitalize="sentences"></div>
      <div class="chips">${chip('scan', '📷 Beleg scannen', false, 'scan')}${CATEGORIES.map((c) => chip('cat', c.name, false)).join('')}</div>
      <div class="foot"><span class="dest" id="fD">Zählt zum ${esc(monthLabel(monthKey(new Date())).split(' ')[0])}</span><button type="button" class="go" id="fGo" disabled>Eintragen</button></div>`;
  }
  return `<div class="kk"><span>⚡ Gedankenblitz</span>${x}</div><div class="fld"><textarea id="fT" rows="3" placeholder="Was geht dir durch den Kopf?" autocomplete="off" autocapitalize="sentences"></textarea></div>
    <div class="foot"><span class="dest">Landet links bei den Gedankenblitzen</span><button type="button" class="go" id="fGo" disabled>Festhalten</button></div>`;
}
const q = (s) => cmp.querySelector(s);
const chosen = (g) => { const b = q(`.chip.on[data-g="${g}"]`); return b ? b.dataset.v : null; };
function pick(g, val, auto) {
  cmp.querySelectorAll(`.chip[data-g="${g}"]`).forEach((b) => {
    const on = b.dataset.v === val;
    if (on && !b.classList.contains('on') && auto) { b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); }
    b.classList.toggle('on', on);
  });
}
const amount = () => { const el = q('#fA'); if (!el) return 0; const c = parseEuroInput(el.value); return c || 0; };
const catByName = (n) => CATEGORIES.find((c) => c.name === n);
function cmpRefresh() {
  if (!cmpCtx) return;
  const t = (q('#fT') || {}).value || ''; const go = q('#fGo');
  if (cmpCtx.type === 'todo') {
    const wi = q('#fW');
    if (!manual.when) { const hit = WHEN.find((w) => w[1].test(t)); const nv = hit ? whenDue(hit[0]) : ''; if (wi.value !== nv) { wi.value = nv; if (nv) { const f = q('#fDf'); f.classList.remove('pulse'); void f.offsetWidth; f.classList.add('pulse'); } } }
    q('#fDf').classList.toggle('set', !!wi.value);
    q('#fD').textContent = wi.value ? `Mit Fahne „${dueFlag(wi.value)}“` : 'Bekommt einen freien Platz'; go.disabled = !t.trim();
  }
  if (cmpCtx.type === 'shop') {
    const e = t.trim() ? emoOf(t) : '🛒', el = q('#fE');
    if (el.textContent !== e) { el.textContent = e; el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 250); }
    if (!manual.qty) { const m = t.match(/^\s*(\d+)\s*(g|kg|l|x)?\b/i); pick('qty', m ? (m[2] && /kg/i.test(m[2]) ? '1 kg' : m[2] && /^g$/i.test(m[2]) ? '500 g' : m[1]) : null, !!m); }
    go.disabled = !t.trim();
  }
  if (cmpCtx.type === 'money') {
    if (!manual.cat) { const id = guessCategory(t); if (id !== 'sonstiges') pick('cat', CAT[id].name, true); }
    go.disabled = !(amount() > 0);
  }
  if (cmpCtx.type === 'blitz') go.disabled = !t.trim();
  placeCmp();
}
const TYPE = { [TODO]: 'todo', [SHOP]: 'shop', [MONEY]: 'money', [PROJ]: 'blitz' };
function openCmp(si, v, at) {
  const type = TYPE[si]; if (!type || cmpCtx) return false;
  cmpCtx = { si, v, type, at }; manual = {};
  cmp.innerHTML = cmpHtml(type, v);
  weg.pause(true); scrim.classList.add('on');
  cmp.style.transition = 'none'; cmp.classList.remove('show'); placeCmp(true); void cmp.offsetWidth; cmp.style.transition = '';
  cmpRefresh();
  requestAnimationFrame(() => cmp.classList.add('show'));
  return true;
}
function focusFirst() { const el = q('#fA') || q('#fT'); if (el) { try { el.focus({ preventScroll: true }); } catch { el.focus(); } } }
function closeCmp() {
  if (!cmpCtx) return;
  const a = document.activeElement; if (a && a.blur) a.blur();
  cmp.classList.remove('show'); scrim.classList.remove('on'); cmpCtx = null; pendingFocus = false;
  if (!sheet.classList.contains('on')) weg.pause(false);
  setTimeout(() => { if (!cmpCtx) cmp.innerHTML = ''; }, 350);
}
function placeCmp(first) {
  if (!cmpCtx) return;
  const vv = window.visualViewport, vh = vv ? vv.height : innerHeight, ot = vv ? vv.offsetTop : 0, ch = cmp.offsetHeight, w = cmp.offsetWidth;
  const { x, y } = cmpCtx.at;
  // Immer mittig und ganz sichtbar, auch wenn die Tastatur offen ist; die Animation startet trotzdem am Finger.
  const L = Math.round((innerWidth - w) / 2);
  const T = Math.round(Math.max(ot + 12, ot + (vh - ch) / 2 - (vv && vh < innerHeight * 0.8 ? 0 : 30)));
  cmp.style.left = L + 'px'; cmp.style.top = T + 'px';
  if (first) { cmp.style.setProperty('--ox', (x - L) + 'px'); cmp.style.setProperty('--oy', (y - T) + 'px'); }
}
if (window.visualViewport) { visualViewport.addEventListener('resize', () => placeCmp()); visualViewport.addEventListener('scroll', () => placeCmp()); }
cmp.addEventListener('change', (e) => { if (e.target.id === 'fW') { manual.when = true; cmpRefresh(); } });
cmp.addEventListener('input', (e) => { if (e.target.id === 'fW') manual.when = true; if (e.target.id === 'fA') e.target.value = e.target.value.replace(/[^\d,.]/g, ''); cmpRefresh(); });
cmp.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeCmp(); return; }
  if (e.key === 'Enter' && !(e.target.tagName === 'TEXTAREA' && e.shiftKey)) {
    e.preventDefault();
    if (e.target.id === 'fA') { q('#fT').focus(); return; }
    const go = q('#fGo'); if (go && !go.disabled) submitCmp();
  }
});
cmp.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.act === 'x') { closeCmp(); return; }
  if (b.dataset.act === 'clr') { manual.when = true; q('#fW').value = ''; cmpRefresh(); return; }
  if (b.id === 'fGo') { submitCmp(); return; }
  const g = b.dataset.g; if (!g) return;
  if (g === 'quick') { const [em, ...rest] = b.dataset.v.split(' '); quickAdd(em, rest.join(' '), b); return; }
  if (g === 'scan') { closeCmp(); chooseSource(); return; }
  manual[g] = true; const was = b.classList.contains('on'); pick(g, (was && g !== 'when') ? null : b.dataset.v); cmpRefresh();
  const f = q('#fT'); if (f) try { f.focus({ preventScroll: true }); } catch { /* egal */ }
});
scrim.addEventListener('pointerup', (e) => { e.stopPropagation(); closeCmp(); });
async function quickAdd(em, t, btn) {
  const r = btn.getBoundingClientRect();
  btn.style.transition = 'opacity .3s, transform .3s'; btn.style.opacity = '0'; btn.style.transform = 'scale(.6)'; setTimeout(() => btn.remove(), 300);
  await addShop({ title: t, emoji: em }, r);
}
async function submitCmp() {
  if (!cmpCtx) return;
  const { type, v } = cmpCtx; const src = q('.fld') || q('.amt') || cmp; const rect = src.getBoundingClientRect();
  if (type === 'todo') {
    let t = q('#fT').value.trim(); const due = q('#fW').value || null;
    const hit = WHEN.find((x) => x[1].test(t)); if (hit && due && due === whenDue(hit[0])) t = t.replace(hit[1], '').replace(/\s{2,}/g, ' ').trim() || t;
    const id = uid(); closeCmp();
    await db.put('todos', { id, title: cap(t), done: false, due, note: '', createdAt: Date.now() });
    await changed(TODO, { [id]: rect });
    setTimeout(() => { const t = data.todos.find((x) => x.id === id); const nv = t && t.pos ? t.pos.v : 0; if (nv !== v) toast(`Liegt ${nv < 0 ? 'links' : nv > 0 ? 'rechts' : 'in der Mitte'}`, { action: 'Zeigen', onAction: () => weg.setView(nv) }); }, 300);
  } else if (type === 'shop') {
    let t = q('#fT').value.trim(); let qty = chosen('qty');
    const m = t.match(/^\s*(\d+)\s*(g|kg|l|x)?\s+/i); if (m) { t = t.slice(m[0].length); qty = qty || (m[1] + (m[2] && !/x/i.test(m[2]) ? ' ' + m[2] : '')); }
    closeCmp(); await addShop({ title: cap(t), qty: qty || '' }, rect);
  } else if (type === 'money') {
    const a = amount(); const t = q('#fT').value.trim(); const c = catByName(chosen('cat'));
    const cat = c ? c.id : guessCategory(t);
    const r2 = q('.amt').getBoundingClientRect(); closeCmp();
    state.month = monthKey(new Date());
    await db.put('receipts', { id: uid(), merchant: cap(t), date: today(), total: a, category: cat, note: '', image: null, ocrText: '', createdAt: Date.now() });
    flyAmount(a, t, r2);
  } else {
    const t = q('#fT').value.trim(); const id = uid(); closeCmp();
    await db.put('ideas', { id, kind: 'blitz', title: '', idea: t, log: [{ at: Date.now(), by: 'ich', text: 'Gedankenblitz notiert' }], createdAt: Date.now() });
    await changed(PROJ, { [id]: rect });
    if (v !== -1) setTimeout(() => toast('Bei den Gedankenblitzen abgelegt', { action: 'Zeigen', onAction: () => weg.setView(-1) }), 250);
  }
}
// Finanzen: der Betrag fliegt in die Monatssumme
function flyAmount(a, t, rect) {
  const el = document.createElement('div'); el.className = 'wc';
  el.style.cssText = 'opacity:1;z-index:2600;visibility:visible;width:auto;padding:10px 14px;transition:transform .8s cubic-bezier(.5,0,.2,1),opacity .8s';
  el.innerHTML = `<div class="t">− ${esc(euro(a))}</div>${t ? `<div class="s">${esc(t)}</div>` : ''}`;
  $('#hud').appendChild(el);
  const w = el.offsetWidth, h = el.offsetHeight;
  el.style.transform = `translate3d(${rect.left + rect.width / 2 - w / 2}px,${rect.top + rect.height / 2 - h / 2}px,0)`;
  const tr = weg.view === 0 ? weg.cardRect(MONEY, 'total') : null;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    let x2, y2, sc = 0.45;
    if (tr) { x2 = tr.left + tr.width / 2; y2 = tr.top + tr.height / 2; } else { x2 = weg.view > 0 ? -120 : innerWidth + 120; y2 = innerHeight * 0.4; sc = 0.8; }
    el.style.transform = `translate3d(${x2 - w / 2}px,${y2 - h / 2}px,0) scale(${sc})`; el.style.opacity = tr ? '0' : '.2';
  }));
  setTimeout(async () => {
    el.remove(); await changed(MONEY);
    const tel = weg.cardEl(MONEY, 'total'); if (tel) { tel.classList.add('fresh'); setTimeout(() => tel.classList.remove('fresh'), 1600); }
    if (!tr) toast(`${euro(a)} eingetragen`, { action: 'Zeigen', onAction: () => weg.setView(0) });
  }, tr ? 820 : 500);
}
function onEmptyTap({ si, v, x, y }) {
  if (si === MORE) return;
  if (openCmp(si, v, { x, y })) { pendingFocus = true; focusFirst(); }
}
// iOS öffnet die Tastatur nur, wenn der Fokus direkt im Berührungs-Ereignis gesetzt wird
const doFocus = () => { if (pendingFocus) { pendingFocus = false; focusFirst(); } };
document.addEventListener('touchend', doFocus, true);
document.addEventListener('pointerup', doFocus, true);

// iOS: keine Browser-Gesten, kein Nachfedern der Seite (außer in Blättern und Eingaben)
for (const ev of ['touchstart', 'touchmove']) {
  document.addEventListener(ev, (e) => {
    if (e.touches && e.touches.length > 1) return;
    const t = e.target;
    if (t.closest && t.closest('.sheet .sbody, .cmp, input, textarea, select')) return;
    if (ev === 'touchmove' || !(t.closest && t.closest('button, label, .sheet'))) e.preventDefault();
  }, { passive: false });
}

// ---------- Abgleich ----------
let syncTimer = null;
function scheduleSync(delay = 1500) { clearTimeout(syncTimer); syncTimer = setTimeout(runSync, delay); }
async function runSync() {
  try {
    const r = await sync();
    backupSettings.set({ syncAt: r.skipped ? backupSettings.get().syncAt : new Date().toISOString(), syncError: null });
    if (r.received) { await load(); if (!sheet.classList.contains('on') && !cmpCtx) refresh(); else refresh([MORE]); }
  } catch (e) { backupSettings.set({ syncError: e.message }); }
}

// ---------- Offline & Updates ----------
const offline = { shell: false, ocr: false, version: null };
function askOfflineStatus() { offline.askedAt = Date.now(); if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'offline-status' }); }
const hadController = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== 'offline-status') return;
    Object.assign(offline, e.data);
    if (offline.shell && offline.ocr && ls.get('lifestyle.offlineReady') !== e.data.version) { toast('App ist jetzt offline verfügbar'); ls.set('lifestyle.offlineReady', e.data.version); }
    refresh([MORE]);
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {}); });
  }).catch((e) => console.warn('Service Worker nicht registriert', e));
  navigator.serviceWorker.ready.then(() => {
    if (navigator.serviceWorker.controller) askOfflineStatus();
    else navigator.serviceWorker.addEventListener('controllerchange', askOfflineStatus, { once: true });
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return; reloading = true;
    toast('App wurde aktualisiert'); setTimeout(() => location.reload(), 600);
  });
}
window.addEventListener('online', () => { autoBackup(); scheduleSync(200); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') autoBackup();
  else { scheduleSync(300); if (weg) refresh([TODO, MONEY]); }
});

// ---------- Start ----------
async function start() {
  requestPersistence();
  await load();
  const startSt = Math.max(0, Math.min(SECT.length - 1, Number(ls.get('lifestyle.station')) || 0));
  try {
    if (!window.THREE) throw new Error('3D-Bibliothek fehlt');
    weg = createWeg({
      sections: SECT, host: document.body, hud: $('#hud'), start: startSt,
      head, tip, onCardTap, onEmptyTap, onMore, onReorder, onPlace,
      onStation: (i) => ls.set('lifestyle.station', String(i)),
    });
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', `<div class="nogl"><div><h2 style="font-family:var(--serif);font-weight:500">Der Weg kann nicht angezeigt werden</h2><p>${esc(e.message)}. Bitte Safari aktualisieren oder die App neu öffnen.</p></div></div>`);
    return;
  }
  refresh(undefined, null, true);
  setTimeout(() => $('#boot').classList.add('off'), 300);
  if (!ls.get('lifestyle.weg.hint')) { setTimeout(() => toast('Wisch hoch zum Gehen, seitlich zum Umschauen', { ms: 4200 }), 1200); ls.set('lifestyle.weg.hint', '1'); }
  setTimeout(() => autoBackup(), 3000);
  scheduleSync(500);
  // Mitternacht: Heute/Demnächst neu einsortieren
  setInterval(() => { if (!sheet.classList.contains('on') && !cmpCtx) refresh([TODO]); }, 5 * 60 * 1000);
}
start();
