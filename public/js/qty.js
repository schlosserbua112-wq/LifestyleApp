// Mengen auf der Einkaufsliste, gemeinsam für App und Server: „2“ (Stück), „500 g“, „1,5 l“.
export const UNITS = ['Stück', 'g', 'kg', 'ml', 'l'];

export function splitQty(q) {
  const m = String(q || '').match(/^\s*(\d+(?:[.,]\d+)?)\s*(stück|stk\.?|x|kg|g|ml|l)?\s*$/i); if (!m) return null;
  const u = (m[2] || '').toLowerCase(); return { n: parseFloat(m[1].replace(',', '.')), u: UNITS.find((x) => x.toLowerCase() === u) || 'Stück' };
}
export function joinQty(n, u) { const v = String(+(+n).toFixed(2)).replace('.', ','); return u && u !== 'Stück' && UNITS.includes(u) ? `${v} ${u}` : v; }
// Zwei Mengen addieren; g/kg und ml/l werden umgerechnet. Passt es nicht zusammen, bleibt die alte Menge.
export function mergeQty(a, b) {
  if (!a) return b || ''; if (!b) return a;
  const x = splitQty(a), y = splitQty(b);
  if (!x || !y) {
    // Packungen mit gleicher Einheit („1 Dose“ + „2 Dosen“) zusammenzählen
    const p = String(a).match(/^\s*(\d+(?:[.,]\d+)?)\s+(\S+)\s*$/), r = String(b).match(/^\s*(\d+(?:[.,]\d+)?)\s+(\S+)\s*$/);
    const stem = (w) => w.toLowerCase().replace(/(en|n|e|s)$/, '');
    if (p && r && stem(p[2]) === stem(r[2])) return `${String(+(parseFloat(p[1].replace(',', '.')) + parseFloat(r[1].replace(',', '.'))).toFixed(2)).replace('.', ',')} ${p[2]}`;
    return a;
  }
  if (x.u === y.u) {
    const t = x.n + y.n;
    if (x.u === 'g' && t >= 1000) return joinQty(t / 1000, 'kg');
    if (x.u === 'ml' && t >= 1000) return joinQty(t / 1000, 'l');
    return joinQty(t, x.u);
  }
  const base = { g: ['g', 1], kg: ['g', 1000], ml: ['ml', 1], l: ['ml', 1000] };
  if (base[x.u] && base[y.u] && base[x.u][0] === base[y.u][0]) {
    const tot = x.n * base[x.u][1] + y.n * base[y.u][1], big = base[x.u][0] === 'g' ? 'kg' : 'l';
    return tot >= 1000 ? joinQty(tot / 1000, big) : joinQty(tot, base[x.u][0]);
  }
  return a;
}
// Lockerer Vergleich von Namen: „Zwiebel(n)“, „Zwiebeln“ und „zwiebel“ sind dasselbe.
export function looseKey(t) {
  return String(t || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-zäöüß]/g, '').replace(/(en|n|e|s)$/, '');
}

