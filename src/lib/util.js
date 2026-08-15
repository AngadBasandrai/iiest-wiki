export const norm = (s) => String(s ?? "").toLowerCase();

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : (iso || "");
}

export const count = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function splitMatch(text, query) {
  const src = String(text ?? "");
  if (!query) return [{ text: src, hit: false }];
  const needle = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = [];
  let last = 0;
  for (const m of src.matchAll(new RegExp(needle, "gi"))) {
    if (m.index > last) parts.push({ text: src.slice(last, m.index), hit: false });
    parts.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
  }
  if (last < src.length) parts.push({ text: src.slice(last), hit: false });
  return parts;
}

export function isoDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function weekdayOf(iso) {
  return (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
}
