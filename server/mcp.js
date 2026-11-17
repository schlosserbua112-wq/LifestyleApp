// Claude-Connector (MCP, Streamable HTTP ohne Sitzungen). Claude kann damit Gedankenblitze lesen und zu
// Projekten ausarbeiten, Projekte pflegen, Aufgaben anlegen und den Einkaufszettel führen.
// Die App holt sich die Änderungen beim nächsten Abgleich.

import { splitQty, joinQty, mergeQty, looseKey, recipeFromUrl, parseIngredient, combine } from './recipe.js';

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const STATUS = {
  idee: 'Idee',
  aktiv: 'In Arbeit',
  erledigt: 'Umgesetzt',
  verworfen: 'Verworfen',
};
const statusEnum = Object.keys(STATUS);

// Vorlage für Projektideen (gleiche Felder wie in der App).
const FIELDS = [
  ['short_description', 'short', 'Kurzbeschreibung', 'One or two sentences: what the idea is about.'],
  ['idea', 'idea', 'Idee', 'What exactly the idea is.'],
  ['goal', 'goal', 'Ziel', 'What should be achieved in the end.'],
  ['implementation', 'implementation', 'Umsetzung', 'How it will be implemented: steps, technology, materials.'],
  ['effort_and_costs', 'effort', 'Aufwand und Kosten', 'Estimated time, money and materials.'],
  ['current_state', 'summary', 'Aktueller Stand', 'Summary of the discussion so far: what has been decided and where things stand.'],
  ['open_questions', 'questions', 'Offene Fragen', 'Questions that are still open.'],
];
const fieldProps = Object.fromEntries(FIELDS.map(([api, , label, desc]) => [api, { type: 'string', description: `${label}: ${desc}` }]));

const KINDS = { blitz: 'Gedankenblitz', projekt: 'Projekt' };
const kindOf = (i) => (i.kind === 'blitz' ? 'blitz' : 'projekt');

const TOOLS = [
  {
    name: 'list_ideas',
    title: 'Gedankenblitze und Projekte auflisten',
    description: 'Lists entries from the "Projekte" area of Vale\'s Bummel app. There are two kinds: kind "blitz" = Gedankenblitz, a short raw note Vale jotted down in the app (only text, no title), and kind "projekt" = a worked-out project. When Vale says "hol meine Gedankenblitze/Ideen", call this with kind "blitz", discuss them, and turn one into a project with promote_idea. Optional filters: kind and a search text.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['blitz', 'projekt', 'alle'], default: 'alle', description: 'blitz = raw thoughts, projekt = projects' },
        query: { type: 'string', description: 'Search text' },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_idea',
    title: 'Projekt oder Gedankenblitz lesen',
    description: 'Returns one entry in full: for a project all template fields (Kurzbeschreibung, Idee, Ziel, Umsetzung, Aufwand und Kosten, Aktueller Stand, Offene Fragen) and the change history; for a Gedankenblitz its text. Read it before updating so changes build on what is there.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'promote_idea',
    title: 'Gedankenblitz zum Projekt machen',
    description: 'Turns a Gedankenblitz (kind "blitz") into a project after you discussed and worked it out with Vale. Keeps the id and history and remembers the date of the original thought; the app then shows it as a new project in the middle of the Projekte station. Give a title and short_description and fill the other template fields as far as they are known (leave unknown ones empty rather than guessing). Write in German. Only call this when Vale agrees that the thought should become a project.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'id of the Gedankenblitz' },
        title: { type: 'string', description: 'Titel' },
        ...fieldProps,
        change_note: { type: 'string', description: 'Short note for the history (German), e.g. "Aus Gedankenblitz ausgearbeitet"' },
      },
      required: ['id', 'title', 'short_description'],
    },
  },
  {
    name: 'create_idea',
    title: 'Projekt anlegen',
    description: 'Creates a NEW project (kind "projekt") in the Bummel app. Only call this when Vale explicitly asks you to create or save a new project. If it comes from a Gedankenblitz, use promote_idea instead. Check list_ideas first so you do not create a duplicate. Fill the template fields as far as they are known (leave unknown ones empty rather than guessing). Write in German unless Vale asks otherwise.',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string', description: 'Titel' }, ...fieldProps },
      required: ['title', 'short_description'],
    },
  },
  {
    name: 'update_idea',
    title: 'Projekt aktualisieren',
    description: 'Updates an existing project with the current state of knowledge, for example after discussing it with Vale. Call get_idea first. Only pass the fields that change; each passed field REPLACES that field completely, so include everything in it that is still valid, not only the news. Keep current_state as a summary of the discussion and move answered questions out of open_questions. Always give a short "change_note" (German) saying what changed; it is added to the history. Projects are finished or deleted by Vale in the app, not here.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        change_note: { type: 'string', description: 'Short note for the history, e.g. "Budget und Materialliste ergänzt"' },
        title: { type: 'string', description: 'Titel' },
        ...fieldProps,
      },
      required: ['id', 'change_note'],
    },
  },
  {
    name: 'list_todos',
    title: 'Aufgaben auflisten',
    description: 'Lists Vale\'s to-dos from the Bummel app in Vale\'s own order (overdue and soon due ones first). By default only open ones.',
    inputSchema: {
      type: 'object',
      properties: { include_done: { type: 'boolean', default: false } },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_todo',
    title: 'Aufgabe anlegen',
    description: 'Adds a to-do to the Bummel app. Only call this when Vale asks you to add a task.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        due: { type: 'string', description: 'Deadline as YYYY-MM-DD (optional, only if there is a real deadline)' },
        note: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'complete_todo',
    title: 'Aufgabe abhaken',
    description: 'Marks a to-do as done. Only when Vale asks for it.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'list_shopping',
    title: 'Einkaufsliste lesen',
    description: 'Returns Vale\'s shopping list (what still needs to be bought: title, quantity, note). Optionally also the things Vale buys most often.',
    inputSchema: { type: 'object', properties: { include_frequent: { type: 'boolean', default: false } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'add_shopping_item',
    title: 'Auf die Einkaufsliste setzen',
    description: 'Puts something on Vale\'s shopping list. If the same thing is already on the list, its quantity is increased instead of adding a duplicate. Use short German names ("Hafermilch", "Tomaten"). Only when Vale asks for it, e.g. while planning meals.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        amount: { type: 'number', description: 'optional amount, e.g. 2 or 500 or 1.5' },
        unit: { type: 'string', enum: ['Stück', 'g', 'kg', 'ml', 'l'], description: 'unit for amount, default "Stück"' },
        quantity: { type: 'string', description: 'legacy free text like "1 Packung"; prefer amount + unit' },
        note: { type: 'string', description: 'optional, e.g. "die Barista-Sorte"' },
      },
      required: ['title'],
    },
  },
  {
    name: 'add_recipe_to_shopping',
    title: 'Rezept auf die Einkaufsliste',
    description: 'Puts the ingredients of a recipe on Vale\'s shopping list. Either pass a recipe url (e.g. Chefkoch; the server reads the ingredient list) or pass ingredients yourself. Things already on the list are merged and their amounts added (g/kg and ml/l are converted). Pantry staples like salt, pepper, oil, flour and spoon amounts (EL/TL/Prise) are skipped unless include_pantry is true. Optional servings_factor scales amounts (e.g. 0.5 for half the recipe). Only when Vale asks for it.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'link to a recipe page' },
        ingredients: { type: 'array', description: 'instead of url: the ingredients', items: { type: 'object', properties: { title: { type: 'string' }, amount: { type: 'number' }, unit: { type: 'string', enum: ['Stück', 'g', 'kg', 'ml', 'l'] }, text: { type: 'string', description: 'or a raw line like "200 g Mehl"' } } } },
        include_pantry: { type: 'boolean', default: false },
        servings_factor: { type: 'number', description: 'scale amounts, default 1' },
      },
    },
  },
  {
    name: 'remove_shopping_item',
    title: 'Von der Einkaufsliste nehmen',
    description: 'Removes an item from the shopping list. bought=true marks it as bought (it then counts for "Oft gekauft" in the app), otherwise it is simply deleted. Only when Vale asks for it.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, bought: { type: 'boolean', default: false } }, required: ['id'] },
  },
];

const text = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });
const fail = (msg) => ({ content: [{ type: 'text', text: msg }], isError: true });
const cleanTags = (tags) => (Array.isArray(tags) ? tags.map((t) => String(t).trim().replace(/^#/, '')).filter(Boolean) : undefined);
const iso = (ts) => (ts ? new Date(ts).toISOString() : null);
const fmtIdea = (i) => (kindOf(i) === 'blitz'
  ? { id: i.id, kind: 'blitz', kind_label: KINDS.blitz, text: i.idea || i.title || '', created: iso(i.createdAt), updated: iso(i.updatedAt) }
  : {
    id: i.id, kind: 'projekt', kind_label: KINDS.projekt, title: i.title,
    ...Object.fromEntries(FIELDS.map(([api, key]) => [api, i[key] || ''])),
    ...(i.blitzAt ? { from_thought_of: iso(i.blitzAt) } : {}),
    updated: iso(i.updatedAt),
  });
const visible = (i) => i.status !== 'erledigt' && i.status !== 'verworfen';
const normTitle = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
const todayIso = () => new Date().toISOString().slice(0, 10);
const pickFields = (a) => Object.fromEntries(FIELDS.filter(([api]) => typeof a[api] === 'string').map(([api, key]) => [key, a[api].trim()]));

async function callTool(store, name, a = {}) {
  switch (name) {
    case 'list_ideas': {
      const q = (a.query || '').toLowerCase();
      let ideas = (await store.list('ideas')).filter(visible);
      if (a.kind === 'blitz' || a.kind === 'projekt') ideas = ideas.filter((i) => kindOf(i) === a.kind);
      if (q) ideas = ideas.filter((i) => [i.title, ...FIELDS.map(([, key]) => i[key])].join(' ').toLowerCase().includes(q));
      ideas.sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
      return text(ideas.map((i) => (kindOf(i) === 'blitz'
        ? { id: i.id, kind: 'blitz', text: i.idea || i.title || '', created: iso(i.createdAt) }
        : { id: i.id, kind: 'projekt', title: i.title, short_description: i.short || '', updated: iso(i.updatedAt) })));
    }
    case 'get_idea': {
      const i = await store.get('ideas', a.id);
      if (!i) return fail('Keinen Eintrag mit dieser id gefunden. Nutze list_ideas.');
      return text({ ...fmtIdea(i), history: (i.log || []).map((e) => ({ at: iso(e.at), by: e.by === 'claude' ? 'Claude' : 'Vale', text: e.text })) });
    }
    case 'promote_idea': {
      const cur = await store.get('ideas', a.id);
      if (!cur) return fail('Keinen Gedankenblitz mit dieser id gefunden. Nutze list_ideas mit kind "blitz".');
      if (kindOf(cur) !== 'blitz') return fail('Das ist schon ein Projekt. Nutze update_idea.');
      if (!a.title || !String(a.title).trim()) return fail('title fehlt.');
      const fields = pickFields(a);
      if (!fields.idea) fields.idea = cur.idea || '';
      const rec = await store.upsert('ideas', {
        ...cur, kind: 'projekt', title: String(a.title).trim(), ...fields, blitzAt: cur.createdAt || Date.now(),
        createdAt: Date.now(), pos: null, seenAt: null,
        log: [...(cur.log || []), { at: Date.now(), by: 'claude', text: String(a.change_note || 'Aus Gedankenblitz zum Projekt ausgearbeitet').trim() }],
      });
      return text({ promoted: fmtIdea(rec), hint: 'Erscheint in der App beim nächsten Abgleich als neues Projekt in der Mitte.' });
    }
    case 'create_idea': {
      if (!a.title || !String(a.title).trim()) return fail('title fehlt.');
      const rec = await store.upsert('ideas', {
        kind: 'projekt', title: String(a.title).trim(), ...pickFields(a),
        log: [{ at: Date.now(), by: 'claude', text: 'Projekt angelegt' }],
      });
      return text({ created: fmtIdea(rec), hint: 'Erscheint in der App beim nächsten Abgleich (sobald das iPhone online ist).' });
    }
    case 'update_idea': {
      const cur = await store.get('ideas', a.id);
      if (!cur) return fail('Keinen Eintrag mit dieser id gefunden. Nutze list_ideas.');
      if (kindOf(cur) === 'blitz') return fail('Das ist ein Gedankenblitz. Mach ihn mit promote_idea zum Projekt.');
      if (!a.change_note) return fail('change_note fehlt.');
      const next = {
        ...cur,
        ...(a.title ? { title: String(a.title).trim() } : {}),
        ...pickFields(a),
        log: [...(cur.log || []), { at: Date.now(), by: 'claude', text: String(a.change_note).trim() }],
      };
      const rec = await store.upsert('ideas', next);
      return text({ updated: fmtIdea(rec) });
    }
    case 'list_todos': {
      let todos = await store.list('todos');
      if (!a.include_done) todos = todos.filter((t) => !t.done);
      const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      const urgent = (t) => !!t.due && t.due <= soon;
      const rank = (t) => (typeof t.order === 'number' ? t.order : -1e12 + -(t.createdAt || 0));
      todos.sort((x, y) => (urgent(x) !== urgent(y) ? (urgent(x) ? -1 : 1) : urgent(x) ? (x.due < y.due ? -1 : 1) : rank(x) - rank(y)));
      return text(todos.map((t) => ({ id: t.id, title: t.title, done: !!t.done, deadline: t.due || null, overdue: !!t.due && !t.done && t.due < todayIso(), note: t.note || '' })));
    }
    case 'create_todo': {
      if (!a.title || !String(a.title).trim()) return fail('title fehlt.');
      if (a.due && !/^\d{4}-\d{2}-\d{2}$/.test(a.due)) return fail('due muss YYYY-MM-DD sein.');
      const rec = await store.upsert('todos', { title: String(a.title).trim(), done: false, due: a.due || null, note: String(a.note || '').trim(), by: 'claude' });
      return text({ created: { id: rec.id, title: rec.title, due: rec.due }, hint: 'Erscheint in der App beim nächsten Abgleich.' });
    }
    case 'complete_todo': {
      const cur = await store.get('todos', a.id);
      if (!cur) return fail('Keine Aufgabe mit dieser id gefunden.');
      await store.upsert('todos', { ...cur, done: true, doneAt: Date.now() });
      return text(`Erledigt: ${cur.title}`);
    }
    case 'list_shopping': {
      const all = await store.list('shopping');
      const open = all.filter((x) => !x.bought).sort((x, y) => (x.order ?? -1) - (y.order ?? -1) || (y.createdAt || 0) - (x.createdAt || 0));
      const out = { list: open.map((x) => { const q = splitQty(x.qty); return { id: x.id, title: x.title, quantity: x.qty || '', ...(q ? { amount: q.n, unit: q.u } : {}), note: x.note || '' }; }) };
      if (a.include_frequent) {
        const m = new Map();
        for (const x of all) if (x.bought) { const k = normTitle(x.title); m.set(k, { title: x.title, times: ((m.get(k) || {}).times || 0) + 1 }); }
        out.frequent = [...m.values()].sort((p, q2) => q2.times - p.times).slice(0, 15);
      }
      return text(out);
    }
    case 'add_shopping_item': {
      const title = String(a.title || '').trim();
      if (!title) return fail('title fehlt.');
      const qty = Number.isFinite(+a.amount) && +a.amount > 0 ? joinQty(a.amount, a.unit) : String(a.quantity || '').trim();
      const same = (await store.list('shopping')).find((x) => !x.bought && looseKey(x.title) === looseKey(title));
      if (same) {
        const next = mergeQty(same.qty || '1', qty || '1');
        const rec = await store.upsert('shopping', { ...same, qty: next, ...(a.note ? { note: String(a.note).trim() } : {}) });
        return text({ merged: { id: rec.id, title: rec.title, quantity: rec.qty }, hint: 'Stand schon auf der Liste, Menge erhöht.' });
      }
      const rec = await store.upsert('shopping', { title: title.charAt(0).toUpperCase() + title.slice(1), qty, note: String(a.note || '').trim(), bought: false, by: 'claude' });
      return text({ added: { id: rec.id, title: rec.title, quantity: rec.qty }, hint: 'Erscheint in der App beim nächsten Abgleich.' });
    }
    case 'add_recipe_to_shopping': {
      let name = '', items = [];
      if (a.url) {
        try { const r = await recipeFromUrl(a.url); name = r.name; items = r.items; } catch (e) { return fail(e.message); }
      } else if (Array.isArray(a.ingredients) && a.ingredients.length) {
        items = combine(a.ingredients.map((x) => (x && x.text ? parseIngredient(x.text)
          : x && x.title ? { title: String(x.title).trim(), qty: Number.isFinite(+x.amount) && +x.amount > 0 ? joinQty(x.amount, x.unit) : '', pantry: false } : null)));
      } else return fail('url oder ingredients angeben.');
      const f = Number(a.servings_factor) > 0 ? Number(a.servings_factor) : 1;
      const skipped = items.filter((x) => x.pantry && !a.include_pantry).map((x) => x.title);
      const use = items.filter((x) => a.include_pantry || !x.pantry);
      const open = (await store.list('shopping')).filter((x) => !x.bought);
      const added = [], merged = [];
      for (const it of use) {
        let qty = it.qty; const s = splitQty(qty);
        if (s && f !== 1) qty = joinQty(s.u === 'Stück' ? Math.ceil(s.n * f) : s.n * f, s.u);
        const same = open.find((x) => looseKey(x.title) === looseKey(it.title));
        if (same) {
          const rec = await store.upsert('shopping', { ...same, qty: qty ? mergeQty(same.qty || '1', qty) : same.qty });
          Object.assign(same, rec); merged.push(`${rec.title}${rec.qty ? ' (' + rec.qty + ')' : ''}`);
        } else {
          const rec = await store.upsert('shopping', { title: it.title, qty, note: '', bought: false, by: 'claude' });
          open.push(rec); added.push(`${rec.title}${rec.qty ? ' (' + rec.qty + ')' : ''}`);
        }
      }
      return text({ recipe: name || undefined, added, merged, skipped_pantry: skipped, hint: 'Erscheint in der App beim nächsten Abgleich.' });
    }
    case 'remove_shopping_item': {
      const cur = await store.get('shopping', a.id);
      if (!cur || cur.bought) return fail('Nichts mit dieser id auf der Liste. Nutze list_shopping.');
      if (a.bought) await store.upsert('shopping', { ...cur, bought: true, boughtAt: Date.now() });
      else await store.remove('shopping', cur.id);
      return text(`${a.bought ? 'Als gekauft abgehakt' : 'Von der Liste genommen'}: ${cur.title}`);
    }
    default:
      return null;
  }
}

async function handleMessage(store, msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;
  const reply = (result) => (isNotification ? null : { jsonrpc: '2.0', id, result });
  const error = (code, message) => (isNotification ? null : { jsonrpc: '2.0', id, error: { code, message } });

  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion;
      return reply({
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'lifestyle', title: 'Bummel', version: '2.0.0' },
        instructions: 'Zugriff auf Vales persönliche App Bummel (früher Lifestyle): Gedankenblitze und Projekte, Aufgaben und Einkaufsliste. Gedankenblitze sind rohe Notizen, die Vale in der App festhält; auf Wunsch holst du sie mit list_ideas (kind "blitz"), arbeitest sie mit Vale aus und machst sie mit promote_idea zum Projekt. Projekte nach Diskussionen mit update_idea auf den aktuellen Stand bringen. Neues nur anlegen, wenn Vale ausdrücklich darum bittet. Inhalte auf Deutsch schreiben.',
      });
    }
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call': {
      try {
        const res = await callTool(store, params?.name, params?.arguments || {});
        if (!res) return error(-32602, `Unbekanntes Tool: ${params?.name}`);
        return reply(res);
      } catch (e) {
        console.error(e);
        return reply(fail('Interner Fehler: ' + e.message));
      }
    }
    case 'resources/list':
      return reply({ resources: [] });
    case 'prompts/list':
      return reply({ prompts: [] });
    default:
      if (isNotification) return null;
      return error(-32601, `Methode nicht unterstützt: ${method}`);
  }
}

export async function handleMcp(store, req, res, body, send) {
  if (req.method === 'GET') return send(res, 405, '', { Allow: 'POST' }); // kein SSE-Stream nötig
  if (req.method === 'DELETE') return send(res, 200, '');
  if (req.method !== 'POST') return send(res, 405, '', { Allow: 'POST' });
  let msg;
  try { msg = JSON.parse(body); } catch {
    return send(res, 400, JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }), { 'Content-Type': 'application/json' });
  }
  const batch = Array.isArray(msg);
  const results = (await Promise.all((batch ? msg : [msg]).map((m) => handleMessage(store, m)))).filter(Boolean);
  if (!results.length) return send(res, 202, '');
  return send(res, 200, JSON.stringify(batch ? results : results[0]), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
}

export { TOOLS };
