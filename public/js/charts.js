// Schlanke Diagramme ohne Fremdbibliothek.
import { esc, euro, euroShort } from './util.js';

// Monatsverlauf: Säulen, eine Serie, Tipp/Hover zeigt den Wert.
export function monthBars(container, months, selectedKey, onSelect) {
  const W = 340, H = 170, padL = 4, padR = 4, padT = 22, padB = 24;
  const max = Math.max(1, ...months.map((m) => m.total));
  const nice = niceMax(max);
  const bw = (W - padL - padR) / months.length;
  const barW = Math.min(30, bw - 10);
  const y = (v) => padT + (H - padT - padB) * (1 - v / nice);

  const grid = [0.5, 1].map((f) => {
    const gy = y(nice * f);
    return `<line x1="${padL}" x2="${W - padR}" y1="${gy}" y2="${gy}" class="grid"/>
      <text x="${W - padR}" y="${gy - 4}" class="axis" text-anchor="end">${esc(euroShort(nice * f))}</text>`;
  }).join('');

  const bars = months.map((m, i) => {
    const cx = padL + bw * i + bw / 2;
    const top = y(m.total);
    const h = Math.max(0, H - padB - top);
    const sel = m.key === selectedKey;
    const r = Math.min(4, h);
    const path = h > 0
      ? `M${cx - barW / 2},${H - padB} V${top + r} q0,-${r} ${r},-${r} H${cx + barW / 2 - r} q${r},0 ${r},${r} V${H - padB} Z`
      : '';
    return `<g class="bar${sel ? ' sel' : ''}" data-key="${m.key}" tabindex="0" role="button"
        aria-label="${esc(m.label)}: ${esc(euro(m.total))}">
      <rect x="${cx - bw / 2}" y="${padT - 18}" width="${bw}" height="${H - padT + 18}" fill="transparent"/>
      ${path ? `<path d="${path}"/>` : ''}
      ${sel ? `<text x="${cx}" y="${top - 6}" class="val" text-anchor="middle">${esc(euroShort(m.total))}</text>` : ''}
      <text x="${cx}" y="${H - 7}" class="axis${sel ? ' strong' : ''}" text-anchor="middle">${esc(m.short)}</text>
    </g>`;
  }).join('');

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Ausgaben der letzten Monate">
    ${grid}<line x1="${padL}" x2="${W - padR}" y1="${H - padB}" y2="${H - padB}" class="baseline"/>${bars}</svg>`;
  container.querySelectorAll('.bar').forEach((g) => {
    const pick = () => onSelect(g.dataset.key);
    g.addEventListener('click', pick);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
}

// Kategorien: waagrechte Balken, jede Zeile beschriftet (Name, Betrag, Anteil).
export function categoryBars(container, rows, total) {
  if (!rows.length) {
    container.innerHTML = '<p class="empty-inline">In diesem Monat noch keine Ausgaben.</p>';
    return;
  }
  const max = Math.max(...rows.map((r) => r.total));
  container.innerHTML = rows.map((r) => `
    <div class="cat-row" title="${esc(r.name)}: ${esc(euro(r.total))}">
      <div class="cat-head">
        <span class="cat-name"><span class="swatch" style="background:var(--cat-${r.id})"></span>${r.icon} ${esc(r.name)}</span>
        <span class="cat-val">${esc(euro(r.total))} <span class="muted">${Math.round((r.total / total) * 100)} %</span></span>
      </div>
      <div class="cat-track"><div class="cat-fill" style="width:${Math.max(2, (r.total / max) * 100)}%;background:var(--cat-${r.id})"></div></div>
    </div>`).join('');
}

function niceMax(v) {
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * e >= v) return m * e;
  return 10 * e;
}
