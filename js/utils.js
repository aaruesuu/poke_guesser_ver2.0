export const DEBUG = false;
export const debugLog = (...args) => { if (DEBUG) console.log("[PG]", ...args); };
export const debugWarn = (...args) => { if (DEBUG) console.warn("[PG]", ...args); };
export const debugErr = (...args) => { if (DEBUG) console.error("[PG]", ...args); };

export function formatDisplayName(name) {
  const match = name.match(/(.+?)（(.+)）/);
  if (match) return { main: match[1], form: `（${match[2]}）` };
  return { main: name, form: "" };
}

export function normalizePokemonName(input) {
  if (!input) return "";
  let s = input.normalize("NFC");
  s = s.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  s = s.replace(/[ぁ-ん]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
  s = s.replace(/[・\s\u3000\-‐‑‒–—―]/g, "");
  return s;
}

export function formatDebut(gen, title) {
  if (!gen && !title) return "—";
  const t = title ? `${title}` : "";
  const g = gen ? `（${gen}世代）` : "";
  return `${t}${g}` || "—";
}

export function formatGenderRate(rate) {
  if (rate === -1) return "性別不明";
  if (rate === 0) return "♂のみ";
  if (rate === 8) return "♀のみ";
  if (typeof rate !== "number" || rate < 0 || rate > 8) return "—";
  const female = rate * 12.5;
  const male = 100 - female;
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return `♂:${fmt(male)}% / ♀:${fmt(female)}%`;
}
