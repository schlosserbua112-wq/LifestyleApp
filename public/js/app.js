import { db, uid, requestPersistence, exportAll, importAll } from './db.js';
import { parseReceipt, CATEGORIES } from './parse.js';
import { prepareImage, recognize } from './ocr.js';
import { monthBars, categoryBars } from './charts.js';
import { backupSettings, markDirty, uploadBackup, restoreBackup, autoBackup } from './backup.js';
import {
  esc, euro, parseEuroInput, centsToInput, monthKey, monthLabel, shiftMonth, formatDate, relativeDue,
} from './util.js';
import { toISODate } from './parse.js';
import { sync } from './sync.js';

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const titleEl = $('#title');
const topAction = $('#top-action');
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

const state = {
  tab: 'todos',
  month: monthKey(new Date()),
  showDone: false,
  search: '',
  ideaFilter: 'offen',
};

// ---------- Hilfsfunktionen ----------
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

const imageUrls = new Map();
function imageUrl(r) {
  if (!r.image) return null;
  if (!imageUrls.has(r.id)) imageUrls.set(r.id, URL.createObjectURL(r.image));
  return imageUrls.get(r.id);
}
function dropImageUrl(id) {
  const u = imageUrls.get(id);
  if (u) { URL.revokeObjectURL(u); imageUrls.delete(id); }
}

async function changed() {
  markDirty();
  await render();
  scheduleSync();
}

// Abgleich mit dem Server (To-Dos, Ideen). Läuft still im Hintergrund, wenn online.
let syncTimer = null;
function scheduleSync(delay = 1500) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, delay);
}
async function runSync() {
  try {
    const r = await sync();
    backupSettings.set({ syncAt: r.skipped ? backupSettings.get().syncAt : new Date().toISOString(), syncError: null });
    if (r.received && sheet.hidden) await render();
  } catch (e) {
    backupSettings.set({ syncError: e.message });
  }
}

// ---------- Sheet (Bottom-Sheet für Bearbeiten) ----------
const sheet = $('#sheet');
const backdrop = $('#sheet-backdrop');
let sheetCloseHandler = null;

function openSheet(html, onClose) {
  sheet.innerHTML = `<div class="grabber"></div>${html}`;
  sheet.hidden = false;
  backdrop.hidden = false;
  sheet.scrollTop = 0;
  sheetCloseHandler = onClose || null;
  document.body.style.overflow = 'hidden';
}
function closeSheet() {
  sheet.hidden = true;
  backdrop.hidden = true;
  sheet.innerHTML = '';
  document.body.style.overflow = '';
  const h = sheetCloseHandler; sheetCloseHandler = null;
  if (h) h();
}
backdrop.addEventListener('click', closeSheet);

// ---------- Tabs ----------
const TITLES = { todos: 'Aufgaben', ideas: 'Projektideen', dashboard: 'Ausgaben', receipts: 'Belege', more: 'Mehr' };
document.querySelectorAll('.tabbar button').forEach((b) => {
  b.addEventListener('click', () => {
    if (state.tab === b.dataset.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    state.tab = b.dataset.tab;
    try { localStorage.setItem('lifestyle.tab', state.tab); } catch { /* egal */ }
    render();
    window.scrollTo(0, 0);
  });
});

async function render() {
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  titleEl.textContent = TITLES[state.tab];
  topAction.innerHTML = '';
  document.querySelectorAll('.fab').forEach((f) => f.remove());
  if (state.tab === 'todos') await renderTodos();
  else if (state.tab === 'ideas') await renderIdeas();
  else if (state.tab === 'dashboard') await renderDashboard();
  else if (state.tab === 'receipts') await renderReceipts();
  else renderMore();
}

// ---------- To-Dos ----------
const CHECK_SVG = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function sortTodos(a, b) {
  if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
  if (a.due && !b.due) return -1;
  if (!a.due && b.due) return 1;
  return b.createdAt - a.createdAt;
}

function todoRow(t) {
  const today = toISODate(new Date());
  const overdue = !t.done && t.due && t.due < today;
  return `<div class="row${t.done ? ' done' : ''}" data-id="${t.id}">
    <button class="check${t.done ? ' on' : ''}" data-act="toggle" aria-label="${t.done ? 'Als offen markieren' : 'Erledigt'}">${CHECK_SVG}</button>
    <div class="grow tap" data-act="edit">
      <div class="title">${esc(t.title)}</div>
      ${t.due ? `<div class="sub${overdue ? ' overdue' : ''}">${esc(relativeDue(t.due))}</div>` : ''}
      ${t.note ? `<div class="sub">${esc(t.note.split('\n')[0])}</div>` : ''}
    </div>
  </div>`;
}

async function renderTodos() {
  const todos = await db.all('todos');
  const open = todos.filter((t) => !t.done).sort(sortTodos);
  const done = todos.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));

  view.innerHTML = `
    <form class="add-todo" id="add-todo" autocomplete="off">
      <input id="todo-input" placeholder="Neue Aufgabe …" enterkeyhint="done" aria-label="Neue Aufgabe">
      <button class="icon-btn" type="submit" aria-label="Hinzufügen">+</button>
    </form>
    ${open.length ? `<div class="list">${open.map(todoRow).join('')}</div>`
      : `<div class="empty"><div class="big">✅</div>${done.length ? 'Alles erledigt. Stark!' : 'Noch keine Aufgaben. Tipp oben eine ein.'}</div>`}
    ${done.length ? `
      <button class="link section-title" id="toggle-done" style="display:block">${state.showDone ? '▾' : '▸'} Erledigt (${done.length})</button>
      ${state.showDone ? `<div class="list">${done.map(todoRow).join('')}</div>
        <p style="text-align:center"><button class="btn danger" id="clear-done">Erledigte löschen</button></p>` : ''}` : ''}
  `;

  $('#add-todo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#todo-input');
    const title = input.value.trim();
    if (!title) return;
    await db.put('todos', { id: uid(), title, done: false, due: null, note: '', createdAt: Date.now() });
    input.value = '';
    await changed();
    $('#todo-input').focus();
  });

  view.querySelectorAll('.row[data-id]').forEach((row) => {
    const id = row.dataset.id;
    row.querySelector('[data-act="toggle"]').addEventListener('click', async () => {
      const t = await db.get('todos', id);
      t.done = !t.done;
      t.doneAt = t.done ? Date.now() : null;
      await db.put('todos', t);
      if (navigator.vibrate) navigator.vibrate(10);
      await changed();
    });
    row.querySelector('[data-act="edit"]').addEventListener('click', () => editTodo(id));
  });

  const td = $('#toggle-done');
  if (td) td.addEventListener('click', () => { state.showDone = !state.showDone; renderTodos(); });
  const cd = $('#clear-done');
  if (cd) cd.addEventListener('click', async () => {
    if (!confirm(`${done.length} erledigte Aufgaben löschen?`)) return;
    for (const t of done) await db.delete('todos', t.id);
    await changed();
  });
}

async function editTodo(id) {
  const t = await db.get('todos', id);
  if (!t) return;
  openSheet(`
    <div class="sheet-head"><button class="link" data-act="cancel">Abbrechen</button><h2>Aufgabe</h2><button class="link" data-act="save"><b>Fertig</b></button></div>
    <label class="field"><span>Titel</span><input id="t-title" value="${esc(t.title)}"></label>
    <label class="field"><span>Fällig am</span><input id="t-due" type="date" value="${esc(t.due || '')}"></label>
    <label class="field"><span>Notiz</span><textarea id="t-note" rows="3">${esc(t.note || '')}</textarea></label>
    <button class="btn danger block" data-act="delete">Aufgabe löschen</button>
  `);
  sheet.querySelector('[data-act="cancel"]').onclick = closeSheet;
  sheet.querySelector('[data-act="save"]').onclick = async () => {
    t.title = $('#t-title').value.trim() || t.title;
    t.due = $('#t-due').value || null;
    t.note = $('#t-note').value.trim();
    await db.put('todos', t);
    closeSheet();
    await changed();
  };
  sheet.querySelector('[data-act="delete"]').onclick = async () => {
    await db.delete('todos', id);
    closeSheet();
    await changed();
    toast('Aufgabe gelöscht');
  };
}

// ---------- Projektideen ----------
const IDEA_STATUS = [
  { id: 'idee', name: 'Idee' },
  { id: 'aktiv', name: 'In Arbeit' },
  { id: 'erledigt', name: 'Umgesetzt' },
  { id: 'verworfen', name: 'Verworfen' },
];
// Vorlage für Projektideen
const IDEA_FIELDS = [
  { key: 'short', label: 'Kurzbeschreibung', rows: 2, ph: 'Ein, zwei Sätze, worum es geht' },
  { key: 'idea', label: 'Idee', rows: 4, ph: 'Was genau ist die Idee?' },
  { key: 'goal', label: 'Ziel', rows: 3, ph: 'Was soll am Ende erreicht sein?' },
  { key: 'implementation', label: 'Umsetzung', rows: 4, ph: 'Wie wird es umgesetzt? Schritte, Technik, Material' },
  { key: 'effort', label: 'Aufwand und Kosten', rows: 3, ph: 'Zeit, Geld, Material' },
  { key: 'summary', label: 'Aktueller Stand', rows: 5, ph: 'Zusammenfassung der bisherigen Diskussion' },
  { key: 'questions', label: 'Offene Fragen', rows: 3, ph: 'Was ist noch unklar?' },
];
const IDEA_ST = Object.fromEntries(IDEA_STATUS.map((x) => [x.id, x]));
const IDEA_FILTERS = [
  { id: 'offen', name: 'Offen', test: (i) => i.status === 'idee' || i.status === 'aktiv' },
  ...IDEA_STATUS.map((x) => ({ id: x.id, name: x.name, test: (i) => i.status === x.id })),
  { id: 'alle', name: 'Alle', test: () => true },
];

async function renderIdeas() {
  const btn = document.createElement('button');
  btn.className = 'icon-btn'; btn.textContent = '+'; btn.setAttribute('aria-label', 'Neue Idee');
  btn.onclick = () => editIdea(null);
  topAction.appendChild(btn);

  const ideas = (await db.all('ideas')).sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  const f = IDEA_FILTERS.find((x) => x.id === state.ideaFilter) || IDEA_FILTERS[0];
  const shown = ideas.filter(f.test);

  view.innerHTML = ideas.length ? `
    <div class="filter">${IDEA_FILTERS.map((x) => `<button class="chip${x.id === f.id ? ' on' : ''}" data-f="${x.id}">${esc(x.name)} <span class="muted">${ideas.filter(x.test).length}</span></button>`).join('')}</div>
    ${shown.map((i) => `<div class="card idea-card" data-iid="${i.id}">
      <h3>${esc(i.title)}</h3>
      ${(i.short || i.summary) ? `<p>${esc(i.short || i.summary)}</p>` : ''}
      <div class="idea-meta"><span class="badge st-${i.status}">${esc(IDEA_ST[i.status]?.name || i.status)}</span>
        ${(i.tags || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}
        ${(i.log || []).some((e) => e.by === 'claude') ? '<span class="tag">· mit Claude</span>' : ''}</div>
    </div>`).join('') || '<p class="empty">Keine Ideen in dieser Ansicht.</p>'}`
    : `<div class="empty"><div class="big">💡</div>Halte hier deine Projektideen fest.<br><br><button class="btn primary" id="first-idea">Erste Idee anlegen</button></div>`;

  view.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { state.ideaFilter = b.dataset.f; renderIdeas(); }));
  view.querySelectorAll('[data-iid]').forEach((c) => c.addEventListener('click', () => editIdea(c.dataset.iid)));
  const fi = $('#first-idea'); if (fi) fi.onclick = () => editIdea(null);
}

function ideaLogHtml(log) {
  if (!log || !log.length) return '';
  return `<div class="field"><span>Verlauf</span><div class="list">${[...log].reverse().map((e) => `
    <div class="row" style="align-items:flex-start"><div class="grow">
      <div class="sub">${esc(new Date(e.at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }))} · ${e.by === 'claude' ? 'Claude' : 'Du'}</div>
      <div class="title small" style="white-space:pre-wrap">${esc(e.text)}</div>
    </div></div>`).join('')}</div></div>`;
}

async function editIdea(id) {
  const isNew = !id;
  const i = isNew ? { id: uid(), title: '', status: 'idee', tags: [], log: [], createdAt: Date.now() } : await db.get('ideas', id);
  if (!i) return;
  let status = i.status;
  openSheet(`
    <div class="sheet-head"><button class="link" data-act="cancel">Abbrechen</button><h2>${isNew ? 'Neue Idee' : 'Idee'}</h2><button class="link" data-act="save"><b>Sichern</b></button></div>
    <label class="field"><span>Titel</span><input id="i-title" value="${esc(i.title)}" placeholder="Worum geht's?"></label>
    ${IDEA_FIELDS.map((f) => `<label class="field"><span>${esc(f.label)}</span><textarea id="i-${f.key}" rows="${f.rows}" placeholder="${esc(f.ph)}">${esc(i[f.key] || '')}</textarea></label>`).join('')}
    <div class="field"><span>Status</span><div class="chips">
      ${IDEA_STATUS.map((x) => `<button type="button" class="chip${x.id === status ? ' on' : ''}" data-st="${x.id}">${esc(x.name)}</button>`).join('')}
    </div></div>
    <label class="field"><span>Schlagwörter (mit Komma trennen)</span><input id="i-tags" value="${esc((i.tags || []).join(', '))}" placeholder="z. B. app, garten"></label>
    <label class="field"><span>Notiz zum Verlauf hinzufügen</span><input id="i-note" placeholder="optional, z. B. Gespräch mit Tom"></label>
    ${ideaLogHtml(i.log)}
    ${isNew ? '' : `<button class="btn block" data-act="todo" style="margin-bottom:10px">Als Aufgabe übernehmen</button>
      <button class="btn danger block" data-act="delete">Idee löschen</button>`}
  `);
  if (isNew) setTimeout(() => $('#i-title')?.focus(), 250);
  sheet.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => {
    status = b.dataset.st;
    sheet.querySelectorAll('[data-st]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  sheet.querySelector('[data-act="cancel"]').onclick = closeSheet;
  sheet.querySelector('[data-act="save"]').onclick = async () => {
    const title = $('#i-title').value.trim();
    if (!title) { toast('Bitte einen Titel eintragen'); return; }
    const values = Object.fromEntries(IDEA_FIELDS.map((f) => [f.key, $('#i-' + f.key).value.trim()]));
    const note = $('#i-note').value.trim();
    const log = [...(i.log || [])];
    const now = Date.now();
    if (isNew) log.push({ at: now, by: 'ich', text: 'Idee angelegt' });
    else {
      const changes = [];
      const changedFields = IDEA_FIELDS.filter((f) => values[f.key] !== (i[f.key] || '')).map((f) => f.label);
      if (changedFields.length) changes.push(changedFields.join(', ') + ' geändert');
      if (status !== i.status) changes.push(`Status: ${IDEA_ST[status].name}`);
      if (title !== i.title) changes.push('Titel geändert');
      if (changes.length) log.push({ at: now, by: 'ich', text: changes.join(', ') });
    }
    if (note) log.push({ at: now, by: 'ich', text: note });
    await db.put('ideas', {
      ...i, ...values, title, status, log,
      tags: $('#i-tags').value.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean),
    });
    closeSheet();
    await changed();
  };
  const td = sheet.querySelector('[data-act="todo"]');
  if (td) td.onclick = async () => {
    await db.put('todos', { id: uid(), title: i.title, done: false, due: null, note: i.short || '', createdAt: Date.now() });
    closeSheet();
    markDirty();
    toast('Als Aufgabe angelegt');
  };
  const del = sheet.querySelector('[data-act="delete"]');
  if (del) del.onclick = async () => {
    if (!confirm('Idee wirklich löschen?')) return;
    await db.delete('ideas', i.id);
    closeSheet();
    await changed();
  };
}

// ---------- Belege scannen ----------
function addScanFab() {
  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8 12h8"/></svg>Beleg scannen';
  fab.addEventListener('click', chooseSource);
  document.body.appendChild(fab);
}

function chooseSource() {
  openSheet(`
    <div class="sheet-head"><span></span><h2>Beleg hinzufügen</h2><button class="link" data-act="cancel">Abbrechen</button></div>
    <div style="display:grid;gap:10px">
      <button class="btn primary block" data-act="camera">📷 Foto aufnehmen</button>
      <button class="btn block" data-act="gallery">🖼️ Aus Fotos wählen</button>
      <button class="btn block" data-act="manual">✏️ Ohne Foto eintragen</button>
    </div>
    <p class="hint" style="margin-top:14px">Tipp: Bon flach auf einen dunklen Untergrund legen, gerade von oben fotografieren und für gutes Licht sorgen.</p>
  `);
  sheet.querySelector('[data-act="cancel"]').onclick = closeSheet;
  sheet.querySelector('[data-act="camera"]').onclick = () => { closeSheet(); $('#camera').click(); };
  sheet.querySelector('[data-act="gallery"]').onclick = () => { closeSheet(); $('#gallery').click(); };
  sheet.querySelector('[data-act="manual"]').onclick = () => {
    closeSheet();
    editReceipt({ id: uid(), merchant: '', date: toISODate(new Date()), total: null, category: 'sonstiges', note: '', image: null, createdAt: Date.now(), isNew: true });
  };
}

for (const id of ['camera', 'gallery']) {
  $('#' + id).addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) await scanFile(file);
  });
}

async function scanFile(file) {
  openSheet(`<div class="progress"><div class="spinner"></div>
    <p id="scan-status" style="margin:14px 0 0;font-weight:600">Bereite Foto vor …</p>
    <div class="bar"><div id="scan-bar"></div></div>
    <p class="small muted">Die Texterkennung läuft komplett auf deinem iPhone.</p></div>`);
  const setProgress = (msg, p) => {
    const s = $('#scan-status'); const b = $('#scan-bar');
    if (s) s.textContent = msg;
    if (b) b.style.width = Math.round(p * 100) + '%';
  };
  let photo = null;
  let parsed = { merchant: '', date: null, total: null, category: 'sonstiges' };
  let text = '';
  let failed = false;
  try {
    const prep = await prepareImage(file);
    photo = prep.photo;
    text = await recognize(prep.ocrCanvas, setProgress);
    parsed = parseReceipt(text);
  } catch (err) {
    console.error(err);
    failed = true;
  }
  closeSheet();
  editReceipt({
    id: uid(),
    merchant: parsed.merchant,
    date: parsed.date || toISODate(new Date()),
    total: parsed.total,
    category: parsed.category,
    note: '',
    image: photo,
    ocrText: text,
    createdAt: Date.now(),
    isNew: true,
  }, failed ? 'Die Texterkennung hat nicht geklappt. Trag die Werte bitte von Hand ein.'
    : 'Automatisch erkannt. Bitte kurz prüfen, vor allem den Betrag.');
}

function editReceipt(r, hint) {
  const photoUrl = r.image ? URL.createObjectURL(r.image) : null;
  let category = r.category || 'sonstiges';
  openSheet(`
    <div class="sheet-head"><button class="link" data-act="cancel">Abbrechen</button><h2>${r.isNew ? 'Neuer Beleg' : 'Beleg'}</h2><button class="link" data-act="save"><b>Sichern</b></button></div>
    ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
    ${photoUrl ? `<img class="receipt-photo" src="${photoUrl}" alt="Foto des Belegs">` : ''}
    <label class="field"><span>Betrag (€)</span><input id="r-total" class="big" inputmode="decimal" placeholder="0,00" value="${esc(centsToInput(r.total))}"></label>
    <label class="field"><span>Händler</span><input id="r-merchant" value="${esc(r.merchant)}" placeholder="z. B. Rewe"></label>
    <label class="field"><span>Datum</span><input id="r-date" type="date" value="${esc(r.date || '')}"></label>
    <div class="field"><span>Kategorie</span><div class="chips" id="r-cats">
      ${CATEGORIES.map((c) => `<button type="button" class="chip${c.id === category ? ' on' : ''}" data-cat="${c.id}">${c.icon} ${esc(c.name)}</button>`).join('')}
    </div></div>
    <label class="field"><span>Notiz</span><input id="r-note" value="${esc(r.note || '')}" placeholder="optional"></label>
    ${r.ocrText ? `<details class="raw"><summary>Erkannter Text anzeigen</summary><pre>${esc(r.ocrText)}</pre></details>` : ''}
    ${r.isNew ? '' : '<button class="btn danger block" data-act="delete">Beleg löschen</button>'}
  `, () => { if (photoUrl) URL.revokeObjectURL(photoUrl); });

  sheet.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
    category = b.dataset.cat;
    sheet.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  sheet.querySelector('[data-act="cancel"]').onclick = closeSheet;
  sheet.querySelector('[data-act="save"]').onclick = async () => {
    const total = parseEuroInput($('#r-total').value);
    if (total == null || total <= 0) { toast('Bitte einen Betrag eintragen'); $('#r-total').focus(); return; }
    const rec = {
      id: r.id,
      merchant: $('#r-merchant').value.trim(),
      date: $('#r-date').value || toISODate(new Date()),
      total,
      category,
      note: $('#r-note').value.trim(),
      image: r.image || null,
      ocrText: r.ocrText || '',
      createdAt: r.createdAt || Date.now(),
    };
    await db.put('receipts', rec);
    dropImageUrl(rec.id);
    state.month = rec.date.slice(0, 7);
    closeSheet();
    await changed();
    toast(r.isNew ? 'Beleg gespeichert' : 'Änderungen gespeichert');
  };
  const del = sheet.querySelector('[data-act="delete"]');
  if (del) del.onclick = async () => {
    if (!confirm('Beleg wirklich löschen?')) return;
    await db.delete('receipts', r.id);
    dropImageUrl(r.id);
    closeSheet();
    await changed();
    toast('Beleg gelöscht');
  };
}

function receiptRow(r) {
  const c = CAT[r.category] || CAT.sonstiges;
  const img = imageUrl(r);
  return `<div class="row tap" data-rid="${r.id}">
    ${img ? `<img class="thumb" src="${img}" alt="">` : `<div class="thumb">${c.icon}</div>`}
    <div class="grow">
      <div class="title">${esc(r.merchant || c.name)}</div>
      <div class="sub">${esc(formatDate(r.date))} · ${esc(c.name)}</div>
    </div>
    <div class="amount">${esc(euro(r.total))}</div>
  </div>`;
}

function bindReceiptRows(root) {
  root.querySelectorAll('[data-rid]').forEach((row) => row.addEventListener('click', async () => {
    const r = await db.get('receipts', row.dataset.rid);
    if (r) editReceipt(r);
  }));
}

// ---------- Dashboard ----------
async function renderDashboard() {
  addScanFab();
  const receipts = await db.all('receipts');
  const byMonth = new Map();
  for (const r of receipts) {
    const k = r.date.slice(0, 7);
    byMonth.set(k, (byMonth.get(k) || 0) + r.total);
  }
  const current = state.month;
  const inMonth = receipts.filter((r) => r.date.startsWith(current)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = inMonth.reduce((s, r) => s + r.total, 0);
  const prev = byMonth.get(shiftMonth(current, -1)) || 0;
  const thisMonth = monthKey(new Date());

  let delta = '';
  if (prev > 0 && total > 0) {
    const pct = Math.round(((total - prev) / prev) * 100);
    delta = `${pct > 0 ? '+' : ''}${pct} % gegenüber ${monthLabel(shiftMonth(current, -1)).split(' ')[0]}`;
  }

  const cats = CATEGORIES.map((c) => ({ ...c, total: inMonth.filter((r) => r.category === c.id).reduce((s, r) => s + r.total, 0) }))
    .filter((c) => c.total > 0).sort((a, b) => b.total - a.total);

  // Sechs Monate bis zum gewählten Monat (oder bis heute, wenn das später ist)
  const end = current >= shiftMonth(thisMonth, -5) ? thisMonth : current;
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const k = shiftMonth(end, -i);
    months.push({ key: k, total: byMonth.get(k) || 0, label: monthLabel(k), short: monthLabel(k, true) });
  }

  view.innerHTML = `
    <div class="month-switch">
      <button class="icon-btn" id="m-prev" aria-label="Vormonat">‹</button>
      <span class="label">${esc(monthLabel(current))}</span>
      <button class="icon-btn" id="m-next" aria-label="Nächster Monat" ${current >= thisMonth ? 'disabled style="opacity:.35"' : ''}>›</button>
    </div>
    <div class="card hero">
      <div class="label">Ausgaben im ${esc(monthLabel(current).split(' ')[0])}</div>
      <div class="value">${esc(euro(total))}</div>
      <div class="delta">${inMonth.length} ${inMonth.length === 1 ? 'Beleg' : 'Belege'}${delta ? ' · ' + esc(delta) : ''}</div>
    </div>
    <div class="section-title">Nach Kategorie</div>
    <div class="card" id="cat-chart"></div>
    <div class="section-title">Letzte 6 Monate</div>
    <div class="card" id="month-chart"></div>
    ${inMonth.length ? `<div class="section-title">Belege im ${esc(monthLabel(current).split(' ')[0])}</div>
      <div class="list" id="month-list">${inMonth.slice(0, 5).map(receiptRow).join('')}</div>
      ${inMonth.length > 5 ? '<p style="text-align:center"><button class="link" id="all-receipts">Alle Belege ansehen</button></p>' : ''}`
      : (receipts.length ? '' : `<div class="empty"><div class="big">🧾</div>Scanne deinen ersten Kassenbon. Die Ausgaben landen dann automatisch hier.</div>`)}
  `;

  categoryBars($('#cat-chart'), cats, total);
  monthBars($('#month-chart'), months, current, (k) => { state.month = k; renderDashboard(); });
  $('#m-prev').onclick = () => { state.month = shiftMonth(current, -1); renderDashboard(); };
  $('#m-next').onclick = () => { if (current < thisMonth) { state.month = shiftMonth(current, 1); renderDashboard(); } };
  const ml = $('#month-list'); if (ml) bindReceiptRows(ml);
  const ar = $('#all-receipts'); if (ar) ar.onclick = () => { state.tab = 'receipts'; render(); };
}

// ---------- Belegliste ----------
async function renderReceipts() {
  addScanFab();
  const receipts = (await db.all('receipts')).sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
  const q = state.search.toLowerCase();
  const filtered = q ? receipts.filter((r) => `${r.merchant} ${r.note} ${CAT[r.category]?.name}`.toLowerCase().includes(q)) : receipts;

  const groups = new Map();
  for (const r of filtered) {
    const k = r.date.slice(0, 7);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  view.innerHTML = receipts.length ? `
    <input class="search" id="search" type="search" placeholder="Suchen" value="${esc(state.search)}">
    <div id="groups">${[...groups].map(([k, list]) => `
      <div class="section-title" style="display:flex;justify-content:space-between"><span>${esc(monthLabel(k))}</span><span>${esc(euro(list.reduce((s, r) => s + r.total, 0)))}</span></div>
      <div class="list">${list.map(receiptRow).join('')}</div>`).join('') || '<p class="empty">Nichts gefunden.</p>'}</div>`
    : `<div class="empty"><div class="big">🧾</div>Noch keine Belege. Tipp unten auf "Beleg scannen".</div>`;

  bindReceiptRows(view);
  const s = $('#search');
  if (s) s.addEventListener('input', () => {
    state.search = s.value;
    const pos = s.selectionStart;
    renderReceipts().then(() => { const n = $('#search'); n.focus(); n.setSelectionRange(pos, pos); });
  });
}

// ---------- Mehr: Backup & Infos ----------
function renderMore() {
  const s = backupSettings.get();
  const last = s.lastAt ? new Date(s.lastAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'noch nie';
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  view.innerHTML = `
    <div class="section-title">Dein Server</div>
    <div class="card">
      <p class="small" style="margin-top:0">
        <span class="status-dot ${s.lastError ? 'err' : s.lastAt ? 'ok' : ''}"></span>
        Letzte Sicherung: <b>${esc(last)}</b>${s.lastError ? `<br><span style="color:var(--danger)">${esc(s.lastError)}</span>` : ''}
        <br><span class="status-dot ${s.syncError ? 'err' : s.syncAt ? 'ok' : ''}"></span>
        Abgleich mit Claude: <b>${esc(s.syncAt ? new Date(s.syncAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'noch nie')}</b>${s.syncError ? `<br><span style="color:var(--danger)">${esc(s.syncError)}</span>` : ''}
      </p>
      <label class="field"><span>Server-Schlüssel</span><input id="b-token" type="password" autocomplete="off" value="${esc(s.token)}" placeholder="vom Server (BACKUP_TOKEN)"></label>
      <label class="field"><span>Server-Adresse (leer = diese Seite)</span><input id="b-url" inputmode="url" autocomplete="off" value="${esc(s.url)}" placeholder="${esc(location.origin)}"></label>
      <label class="row" style="padding:4px 4px 12px;min-height:0;border:0">
        <span class="grow">Automatisch sichern, wenn Internet da ist</span>
        <input id="b-auto" type="checkbox" ${s.auto ? 'checked' : ''} style="width:22px;height:22px">
      </label>
      <div class="btn-row">
        <button class="btn primary" id="b-now">Jetzt sichern</button>
        <button class="btn" id="b-sync">Abgleichen</button>
        <button class="btn" id="b-restore">Wiederherstellen</button>
      </div>
    </div>

    <div class="section-title">Backup als Datei</div>
    <div class="card">
      <p class="small muted" style="margin-top:0">Speichert alles (inkl. Fotos) als Datei, z. B. in der Dateien-App oder iCloud Drive.</p>
      <div class="btn-row">
        <button class="btn" id="f-export">Exportieren</button>
        <button class="btn" id="f-import">Importieren</button>
      </div>
    </div>

    <div class="section-title">Über die App</div>
    <div class="card small">
      <p style="margin-top:0">Alle Daten liegen nur auf diesem iPhone. Die App funktioniert ohne Internet. Ist das iPhone online, holt sie sich Updates automatisch und sichert (falls eingerichtet) auf deinen Server.</p>
      ${standalone ? '' : '<p class="hint">Zum Installieren: in Safari auf <b>Teilen</b> tippen und <b>Zum Home-Bildschirm</b> wählen.</p>'}
      <p class="muted" style="margin-bottom:0">Version <span id="app-version">…</span></p>
    </div>
  `;

  const saveSettings = () => backupSettings.set({
    token: $('#b-token').value.trim(),
    url: $('#b-url').value.trim(),
    auto: $('#b-auto').checked,
  });
  ['b-token', 'b-url', 'b-auto'].forEach((id) => $('#' + id).addEventListener('change', saveSettings));

  $('#b-now').onclick = async (e) => {
    saveSettings();
    e.target.disabled = true; e.target.textContent = 'Sichere …';
    try {
      const bytes = await uploadBackup();
      toast(`Gesichert (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
    } catch (err) {
      backupSettings.set({ lastError: err.message });
      toast(navigator.onLine ? err.message : 'Kein Internet. Sicherung später.');
    }
    renderMore();
  };
  $('#b-sync').onclick = async (e) => {
    saveSettings();
    e.target.disabled = true;
    await runSync();
    const st = backupSettings.get();
    toast(st.syncError ? st.syncError : 'Abgeglichen');
    renderMore();
  };
  $('#b-restore').onclick = async () => {
    saveSettings();
    if (!confirm('Das letzte Backup vom Server laden? Gleiche Einträge werden überschrieben, neue bleiben erhalten.')) return;
    try {
      const n = await restoreBackup();
      imageUrls.forEach((u) => URL.revokeObjectURL(u)); imageUrls.clear();
      toast(`${n} Einträge wiederhergestellt`);
    } catch (err) { toast(err.message); }
  };
  $('#f-export').onclick = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const name = `lifestyle-backup-${toISODate(new Date())}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  $('#f-import').onclick = () => $('#import-file').click();
  showVersion();
}

$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const n = await importAll(JSON.parse(await file.text()));
    imageUrls.forEach((u) => URL.revokeObjectURL(u)); imageUrls.clear();
    markDirty();
    toast(`${n} Einträge importiert`);
  } catch (err) { toast(err.message || 'Datei konnte nicht gelesen werden'); }
});

async function showVersion() {
  const el = $('#app-version');
  if (!el) return;
  try {
    const keys = await caches.keys();
    el.textContent = keys.find((k) => k.startsWith('lifestyle-'))?.replace('lifestyle-', '') || 'Entwicklung';
  } catch { el.textContent = '–'; }
}

// ---------- Offline & Updates ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      // Bei jedem Öffnen kurz nach Updates schauen (nur wenn online)
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {}); });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading || !hadController) return;
        reloading = true;
        toast('App wurde aktualisiert');
        setTimeout(() => location.reload(), 600);
      });
    } catch (e) { console.warn('Service Worker nicht registriert', e); }
  });
}
const hadController = !!(navigator.serviceWorker && navigator.serviceWorker.controller);

// Automatisches Backup: beim Start, wenn das Netz zurückkommt und wenn die App in den Hintergrund geht.
window.addEventListener('online', () => { autoBackup(); scheduleSync(200); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') autoBackup();
  else scheduleSync(300);
});
setTimeout(() => autoBackup(), 3000);
scheduleSync(500);

// ---------- Start ----------
try { state.tab = localStorage.getItem('lifestyle.tab') || 'todos'; } catch { /* egal */ }
if (!TITLES[state.tab]) state.tab = 'todos';
requestPersistence();
render();
