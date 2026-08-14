export const $ = (sel, root = document) => root.querySelector(sel);

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const norm = (s) => String(s ?? "").toLowerCase();

export const debounce = (fn, ms = 130) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : (iso || "");
}

export const count = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function highlight(text, query) {
  const safe = esc(text);
  if (!query) return safe;
  const needle = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(needle, "gi"), (hit) => `<mark>${hit}</mark>`);
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
