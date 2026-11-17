// Rezept-Link in Einkaufsliste: Seite laden, Zutaten aus den Rezeptdaten (schema.org/Recipe) lesen
// und jede Zeile in Name, Menge und Einheit zerlegen. Funktioniert z. B. mit Chefkoch, Lecker, Kitchen Stories.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { joinQty, mergeQty, looseKey } from '../public/js/qty.js';
export { splitQty, joinQty, mergeQty, looseKey } from '../public/js/qty.js';

// ---------- Zutatenzeile zerlegen ----------
const FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const UNIT_MAP = [
  [/^(g|gr\.?|gramm)$/i, 'g', 1], [/^(kg|kilo(gramm)?)$/i, 'kg', 1], [/^(ml|milliliter)$/i, 'ml', 1], [/^(l|liter)$/i, 'l', 1],
  [/^cl$/i, 'ml', 10], [/^dl$/i, 'ml', 100], [/^(stück|stk\.?|st\.)$/i, 'Stück', 1],
];
// Einheiten, die man nicht so kauft: die Zutat kommt ohne Menge auf die Liste.
const KITCHEN = /^(el|tl|esslöffel|teelöffel|prise[n]?|msp\.?|messerspitze[n]?|schuss|spritzer|tropfen|etwas|n\.\s?b\.?|evtl\.?|nach\s+belieben)$/i;
// Packungs-Einheiten bleiben als Text stehen („1 Dose“).
const PACK = /^(dose[n]?|platte[n]?|stiel[e]?|kugel[n]?|pck\.?|päckchen|packung(en)?|pkt\.?|bund|zehe[n]?|zehe\/n|becher|glas|gläser|scheibe[n]?|scheibe\/n|zweig[e]?|tasse[n]?|stange[n]?|stange\/n|knolle[n]?|kopf|köpfe|beutel|flasche[n]?|würfel|blatt|blätter|handvoll|tüte[n]?|rolle[n]?|netz)$/i;
const SKIP = /^(wasser|leitungswasser|eiswasser|warmes wasser|kaltes wasser)$/i;
export const PANTRY = /^(salz|pfeffer|salz und pfeffer|salz & pfeffer|zucker|öl|olivenöl|speiseöl|rapsöl|sonnenblumenöl|essig|mehl|backpulver|natron|muskat|muskatnuss|paprikapulver|zimt|oregano|chili|chiliflocken|currypulver|kreuzkümmel|lorbeerblatt|lorbeerblätter|brühe|gemüsebrühe|hefe|vanillezucker)$/i;

function num(s) {
  s = s.trim(); if (FRAC[s] != null) return FRAC[s];
  let m = s.match(/^(\d+)\s*([½¼¾⅓⅔⅛])$/); if (m) return +m[1] + FRAC[m[2]];
  m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/); if (m) return +m[1] + +m[2] / +m[3];
  m = s.match(/^(\d+)\/(\d+)$/); if (m) return +m[1] / +m[2];
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)$/); if (m) return parseFloat(m[2].replace(',', '.'));
  return parseFloat(s.replace(',', '.'));
}
function cleanTitle(t) {
  t = t.replace(/\(.*?\)/g, '').replace(/\s*\/\s*n\b/g, '').replace(/\s+/g, ' ').trim();
  t = t.split(/,|\s+–\s+|\s+-\s+|\s+oder\s+|\s+zum\s+|\s+für\s+(die|den|das)\s+/i)[0].trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}
export function parseIngredient(line) {
  let s = String(line || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const raw = s;
  let n = null, unit = '', pack = '', kitchen = false;
  const m = s.match(/^((?:\d+\s*)?[½¼¾⅓⅔⅛]|\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?)\s*/);
  if (m) { n = num(m[1]); s = s.slice(m[0].length); }
  const w = s.match(/^([A-Za-zäöüÄÖÜß.\/]+)\s+(.*)$/);
  if (w) {
    const word = w[1].replace(/\/(n|e|en|s)$/i, '');
    const um = UNIT_MAP.find(([re]) => re.test(word));
    if (um) { unit = um[1]; if (n != null) n *= um[2]; s = w[2]; }
    else if (KITCHEN.test(word)) { kitchen = true; s = w[2]; }
    else if (PACK.test(word)) { pack = word.replace(/\/n$/, '').replace(/\.$/, ''); s = w[2]; }
  }
  if (/^(n\.\s?b\.?|etwas|evtl\.?)\s+/i.test(s)) { kitchen = true; s = s.replace(/^(n\.\s?b\.?|etwas|evtl\.?)\s+/i, ''); }
  const title = cleanTitle(s);
  if (!title || SKIP.test(title)) return null;
  let qty = '';
  if (!kitchen && n != null && Number.isFinite(n) && n > 0) {
    if (pack) qty = `${String(+n.toFixed(2)).replace('.', ',')} ${pack}`;
    else if (unit === 'g' && n >= 1000) qty = joinQty(n / 1000, 'kg');
    else if (unit === 'ml' && n >= 1000) qty = joinQty(n / 1000, 'l');
    else qty = joinQty(unit === 'Stück' || !unit ? Math.ceil(n) : n, unit || 'Stück');
  }
  return { title, qty, raw, pantry: kitchen || PANTRY.test(title) };
}

// Zutaten zusammenfassen (gleiche Zutat zweimal im Rezept)
export function combine(list) {
  const out = new Map();
  for (const it of list) {
    if (!it) continue;
    const k = looseKey(it.title); const prev = out.get(k);
    if (prev) { prev.qty = mergeQty(prev.qty, it.qty); prev.pantry = prev.pantry && it.pantry; } else out.set(k, { ...it });
  }
  return [...out.values()];
}

// ---------- Seite laden ----------
function privateIp(ip) {
  if (isIP(ip) === 6) { const l = ip.toLowerCase(); return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.'); }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}
async function safeUrl(u) {
  let url; try { url = new URL(String(u).trim()); } catch { throw new Error('Das ist kein gültiger Link.'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Nur http- und https-Links.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => { throw new Error('Die Seite ist nicht erreichbar.'); });
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error('Diese Adresse ist nicht erlaubt.');
  return url;
}
async function fetchPage(u) {
  let url = await safeUrl(u);
  for (let hop = 0; hop < 4; hop++) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10000);
    let res;
    try {
      res = await fetch(url, { redirect: 'manual', signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Bummel-Rezept/1.0)', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'de-DE,de;q=0.9' } });
    } catch { clearTimeout(t); throw new Error('Die Seite ist nicht erreichbar.'); }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { clearTimeout(t); url = await safeUrl(new URL(res.headers.get('location'), url)); continue; }
    if (!res.ok) { clearTimeout(t); throw new Error(`Die Seite antwortet mit ${res.status}.`); }
    const reader = res.body.getReader(); const chunks = []; let size = 0;
    try {
      for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 4 * 1024 * 1024) break; chunks.push(value); }
    } finally { clearTimeout(t); try { reader.cancel(); } catch { /* egal */ } }
    return { html: Buffer.concat(chunks).toString('utf8'), url: url.toString() };
  }
  throw new Error('Zu viele Weiterleitungen.');
}

const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/<[^>]+>/g, '');
function findRecipe(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const x of node) { const r = findRecipe(x); if (r) return r; } return null; }
  const type = [].concat(node['@type'] || []).map(String);
  if (type.some((t) => /recipe$/i.test(t)) && (node.recipeIngredient || node.ingredients)) return node;
  for (const k of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) { const r = findRecipe(node[k]); if (r) return r; }
  return null;
}
export function extractRecipe(html) {
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data; try { data = JSON.parse(m[1].trim()); } catch { try { data = JSON.parse(m[1].trim().replace(/[\u0000-\u001f]+/g, ' ')); } catch { continue; } }
    const r = findRecipe(data);
    if (r) return { name: decode(r.name || ''), lines: [].concat(r.recipeIngredient || r.ingredients || []).map(decode), servings: decode([].concat(r.recipeYield || [])[0] || '') };
  }
  const lines = [...html.matchAll(/itemprop=["'](?:recipeIngredient|ingredients)["'][^>]*>([\s\S]*?)<\/(?:li|span|div|p)>/gi)].map((x) => decode(x[1]).trim()).filter(Boolean);
  if (lines.length) { const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); return { name: t ? decode(t[1]).split(/[|–-]/)[0].trim() : '', lines, servings: '' }; }
  return null;
}

export async function recipeFromUrl(u) {
  const { html, url } = await fetchPage(u);
  const r = extractRecipe(html);
  if (!r || !r.lines.length) throw new Error('Auf der Seite habe ich keine Zutatenliste gefunden.');
  const items = combine(r.lines.map(parseIngredient));
  return { name: r.name || 'Rezept', url, servings: r.servings, items };
}
