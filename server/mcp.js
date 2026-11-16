// Claude-Connector (MCP, Streamable HTTP ohne Sitzungen). Claude kann damit Projektideen
// lesen und pflegen sowie Aufgaben anlegen. Die App holt sich die Änderungen beim nächsten Abgleich.

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

const TOOLS = [
  {
    name: 'list_ideas',
    title: 'Projektideen auflisten',
    description: 'Lists Vale\'s project ideas from the Lifestyle app (title, status, tags, short description). Use it to find an idea before reading or updating it. Optional filters: status and a search text matched against all fields and tags.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: statusEnum, description: 'idee = idea, aktiv = in progress, erledigt = done, verworfen = dropped' },
        query: { type: 'string', description: 'Search text' },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_idea',
    title: 'Projektidee lesen',
    description: 'Returns one project idea in full: all template fields (Kurzbeschreibung, Idee, Ziel, Umsetzung, Aufwand und Kosten, Aktueller Stand, Offene Fragen), status, tags and the complete change history. Read it before updating so changes build on what is there.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_idea',
    title: 'Projektidee anlegen',
    description: 'Creates a NEW project idea in the Lifestyle app. Only call this when Vale explicitly asks you to create or save a new idea. Do not create ideas on your own initiative. Check list_ideas first so you do not create a duplicate. Fill the template fields as far as they are known (leave unknown ones empty rather than guessing). Write in German unless Vale asks otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Titel' },
        ...fieldProps,
        status: { type: 'string', enum: statusEnum, default: 'idee' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'short_description'],
    },
  },
  {
    name: 'update_idea',
    title: 'Projektidee aktualisieren',
    description: 'Updates an existing project idea with the current state of knowledge, for example after discussing it with Vale. Call get_idea first. Only pass the fields that change; each passed field REPLACES that field completely, so include everything in it that is still valid, not only the news. Keep current_state as a summary of the discussion and move answered questions out of open_questions. Always give a short "change_note" (German) saying what changed; it is added to the idea\'s history.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        change_note: { type: 'string', description: 'Short note for the history, e.g. "Budget und Materialliste ergänzt"' },
        title: { type: 'string', description: 'Titel' },
        ...fieldProps,
        status: { type: 'string', enum: statusEnum },
        tags: { type: 'array', items: { type: 'string' }, description: 'Replaces all tags' },
      },
      required: ['id', 'change_note'],
    },
  },
  {
    name: 'list_todos',
    title: 'Aufgaben auflisten',
    description: 'Lists Vale\'s to-dos from the Lifestyle app. By default only open ones.',
    inputSchema: {
      type: 'object',
      properties: { include_done: { type: 'boolean', default: false } },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_todo',
    title: 'Aufgabe anlegen',
    description: 'Adds a to-do to the Lifestyle app. Only call this when Vale asks you to add a task.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        due: { type: 'string', description: 'Due date as YYYY-MM-DD (optional)' },
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
];

const text = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });
const fail = (msg) => ({ content: [{ type: 'text', text: msg }], isError: true });
const cleanTags = (tags) => (Array.isArray(tags) ? tags.map((t) => String(t).trim().replace(/^#/, '')).filter(Boolean) : undefined);
const fmtIdea = (i) => ({
  id: i.id, title: i.title, status: i.status, status_label: STATUS[i.status] || i.status, tags: i.tags || [],
  ...Object.fromEntries(FIELDS.map(([api, key]) => [api, i[key] || ''])),
  updated: new Date(i.updatedAt).toISOString(),
});
const pickFields = (a) => Object.fromEntries(FIELDS.filter(([api]) => typeof a[api] === 'string').map(([api, key]) => [key, a[api].trim()]));

async function callTool(store, name, a = {}) {
  switch (name) {
    case 'list_ideas': {
      const q = (a.query || '').toLowerCase();
      let ideas = await store.list('ideas');
      if (a.status) ideas = ideas.filter((i) => i.status === a.status);
      if (q) ideas = ideas.filter((i) => [i.title, ...FIELDS.map(([, key]) => i[key]), ...(i.tags || [])].join(' ').toLowerCase().includes(q));
      ideas.sort((x, y) => y.updatedAt - x.updatedAt);
      return text(ideas.map((i) => ({ id: i.id, title: i.title, status: i.status, tags: i.tags || [], short_description: i.short || '', updated: new Date(i.updatedAt).toISOString() })));
    }
    case 'get_idea': {
      const i = await store.get('ideas', a.id);
      if (!i) return fail('Keine Idee mit dieser id gefunden. Nutze list_ideas.');
      return text({ ...fmtIdea(i), history: (i.log || []).map((e) => ({ at: new Date(e.at).toISOString(), by: e.by === 'claude' ? 'Claude' : 'Vale', text: e.text })) });
    }
    case 'create_idea': {
      if (!a.title || !String(a.title).trim()) return fail('title fehlt.');
      const status = statusEnum.includes(a.status) ? a.status : 'idee';
      const rec = await store.upsert('ideas', {
        title: String(a.title).trim(),
        ...pickFields(a),
        status,
        tags: cleanTags(a.tags) || [],
        log: [{ at: Date.now(), by: 'claude', text: 'Idee angelegt' }],
      });
      return text({ created: fmtIdea(rec), hint: 'Erscheint in der App beim nächsten Abgleich (sobald das iPhone online ist).' });
    }
    case 'update_idea': {
      const cur = await store.get('ideas', a.id);
      if (!cur) return fail('Keine Idee mit dieser id gefunden. Nutze list_ideas.');
      if (!a.change_note) return fail('change_note fehlt.');
      if (a.status && !statusEnum.includes(a.status)) return fail('Ungültiger status.');
      const next = {
        ...cur,
        ...(a.title ? { title: String(a.title).trim() } : {}),
        ...pickFields(a),
        ...(a.status ? { status: a.status } : {}),
        ...(cleanTags(a.tags) ? { tags: cleanTags(a.tags) } : {}),
        log: [...(cur.log || []), { at: Date.now(), by: 'claude', text: String(a.change_note).trim() }],
      };
      const rec = await store.upsert('ideas', next);
      return text({ updated: fmtIdea(rec) });
    }
    case 'list_todos': {
      let todos = await store.list('todos');
      if (!a.include_done) todos = todos.filter((t) => !t.done);
      todos.sort((x, y) => (x.due || '9999') < (y.due || '9999') ? -1 : 1);
      return text(todos.map((t) => ({ id: t.id, title: t.title, done: !!t.done, due: t.due || null, note: t.note || '' })));
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
        serverInfo: { name: 'lifestyle', title: 'Lifestyle-App', version: '1.0.0' },
        instructions: 'Zugriff auf Vales persönliche Lifestyle-App (Projektideen und Aufgaben). Ideen nach Diskussionen mit update_idea auf den aktuellen Erkenntnisstand bringen. Neue Ideen oder Aufgaben nur anlegen, wenn Vale ausdrücklich darum bittet. Inhalte auf Deutsch schreiben.',
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
