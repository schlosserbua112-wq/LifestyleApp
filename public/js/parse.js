// Liest Händler, Datum und Gesamtbetrag aus dem erkannten Text eines Kassenbons.

const AMOUNT_RE = /(-?\d{1,5}(?:[.\s]\d{3})*)\s?[,.]\s?(\d{2})(?!\d)/g;
const TOTAL_WORDS = /(zu\s*zahlen|summe|gesamt|total|endbetrag|betrag|zahlbetrag|brutto|karte|girocard|ec[\s-]?cash|kartenzahlung|visa|mastercard|maestro|\bbar\b)/i;
const STRONG_TOTAL = /(zu\s*zahlen|summe|gesamt|endbetrag|zahlbetrag)/i;
const NOT_TOTAL = /(zwischensumme|mwst|ust|steuer|netto|rückgeld|rueckgeld|zurück|gegeben|rabatt|pfand)/i;

export const CATEGORIES = [
  { id: 'lebensmittel', name: 'Lebensmittel', icon: '🛒' },
  { id: 'restaurant', name: 'Essen & Trinken', icon: '🍽️' },
  { id: 'mobilitaet', name: 'Mobilität', icon: '⛽' },
  { id: 'freizeit', name: 'Freizeit', icon: '🎟️' },
  { id: 'haushalt', name: 'Haushalt', icon: '🏠' },
  { id: 'kleidung', name: 'Kleidung', icon: '👕' },
  { id: 'sonstiges', name: 'Sonstiges', icon: '📦' },
];

const MERCHANT_HINTS = [
  [/rewe|edeka|aldi|lidl|penny|netto|kaufland|norma|globus|tegut|spar|billa|hofer|migros|coop|denns|alnatura|bäck|baeck|metzger/i, 'lebensmittel'],
  [/aral|shell|esso|jet\b|totalenergies|avia|omv|agip|eni|tankstelle|db\s|bahn|mvg|bvg|hvv|parken|park/i, 'mobilitaet'],
  [/\bdm\b|dm-drogerie|rossmann|müller|mueller|bipa|apotheke/i, 'haushalt'],
  [/restaurant|café|cafe|pizz|burger|mcdonald|kebap|döner|doner|sushi|bistro|bar\b|gaststätte|imbiss|starbucks|subway/i, 'restaurant'],
  [/ikea|obi|bauhaus|hornbach|toom|hagebau|tedi|action|depot/i, 'haushalt'],
  [/h&m|zara|primark|c&a|deichmann|kik|tk\s?maxx|zalando|snipes/i, 'kleidung'],
  [/kino|cinema|thalia|hugendubel|museum|theater|fitness|mediamarkt|saturn/i, 'freizeit'],
];

export function guessCategory(merchant) {
  for (const [re, cat] of MERCHANT_HINTS) if (re.test(merchant || '')) return cat;
  return 'sonstiges';
}

function toCents(intPart, dec) {
  const n = parseInt(intPart.replace(/[.\s]/g, ''), 10);
  return n * 100 + (n < 0 ? -1 : 1) * parseInt(dec, 10);
}

function amountsIn(line) {
  const out = [];
  // Datum (17.11.2026) und Uhrzeit sind keine Beträge
  line = line.replace(/(?<!\d)\d{1,2}\s?\.\s?\d{1,2}\s?\.\s?(?:\d{4}|\d{2})(?!\d)/g, ' ').replace(/\d{1,2}:\d{2}(?::\d{2})?/g, ' ');
  for (const m of line.matchAll(AMOUNT_RE)) out.push(toCents(m[1], m[2]));
  return out;
}

export function parseTotal(lines) {
  // 1. Zeilen mit eindeutigem Wort (Summe, zu zahlen ...), Betrag in der Zeile oder der nächsten.
  let best = null;
  lines.forEach((line, i) => {
    if (!TOTAL_WORDS.test(line) || NOT_TOTAL.test(line)) return;
    let amounts = amountsIn(line);
    if (!amounts.length && lines[i + 1]) amounts = amountsIn(lines[i + 1]);
    const positive = amounts.filter((a) => a > 0);
    if (!positive.length) return;
    const score = STRONG_TOTAL.test(line) ? 2 : 1;
    const value = positive[positive.length - 1];
    if (!best || score > best.score || (score === best.score && value > best.value)) best = { score, value };
  });
  if (best) return best.value;
  // 2. Ersatz: größter Betrag auf dem Bon.
  const all = lines.filter((l) => !NOT_TOTAL.test(l)).flatMap(amountsIn).filter((a) => a > 0 && a < 1000000);
  return all.length ? Math.max(...all) : null;
}

export function parseDate(text) {
  const today = new Date();
  const candidates = [];
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})\s?[.\-/]\s?(\d{1,2})\s?[.\-/]\s?(\d{4}|\d{2})(?!\d)/g)) {
    let [, d, mo, y] = m;
    d = +d; mo = +mo; y = +y;
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2000) candidates.push(new Date(y, mo - 1, d));
  }
  for (const m of text.matchAll(/(?<!\d)(20\d{2})-(\d{2})-(\d{2})(?!\d)/g)) {
    candidates.push(new Date(+m[1], +m[2] - 1, +m[3]));
  }
  const valid = candidates.filter((dt) => dt <= new Date(today.getTime() + 86400000));
  return valid.length ? toISODate(valid[0]) : null;
}

export function parseMerchant(lines) {
  for (const raw of lines.slice(0, 6)) {
    const line = raw.replace(/[^\p{L}\p{N}&.\-' ]/gu, ' ').replace(/\s+/g, ' ').trim();
    const letters = (line.match(/\p{L}/gu) || []).length;
    if (letters < 3) continue;
    if (/^(beleg|kassenbon|rechnung|quittung|bon|willkommen|herzlich)/i.test(line)) continue;
    if (/(str\.|straße|strasse|\btel\b|www\.|\d{5})/i.test(line)) continue;
    return line.length > 40 ? line.slice(0, 40) : titleCase(line);
  }
  return '';
}

function titleCase(s) {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s\-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

export function toISODate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseReceipt(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const merchant = parseMerchant(lines);
  return {
    merchant,
    date: parseDate(text),
    total: parseTotal(lines),
    category: merchant && guessCategory(merchant) !== 'sonstiges'
      ? guessCategory(merchant)
      : guessCategory(lines.slice(0, 4).join(' ')),
  };
}
