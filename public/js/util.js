export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmt0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// Beträge werden als Cent (Ganzzahl) gespeichert.
export const euro = (cents) => fmt.format((cents || 0) / 100);
export const euroShort = (cents) => fmt0.format(Math.round((cents || 0) / 100));

export function parseEuroInput(str) {
  if (str == null) return null;
  let s = String(str).replace(/[€\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export const centsToInput = (c) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export function monthLabel(key, short = false) {
  const [y, m] = key.split('-').map(Number);
  return short ? MONTHS_SHORT[m - 1] : `${MONTHS[m - 1]} ${y}`;
}
export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export function relativeDue(iso) {
  if (!iso) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [y, m, d] = iso.split('-').map(Number);
  const diff = Math.round((new Date(y, m - 1, d) - today) / 86400000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  if (diff < 0) return `Seit ${-diff} Tagen fällig`;
  if (diff < 7) return `In ${diff} Tagen`;
  return formatDate(iso);
}
