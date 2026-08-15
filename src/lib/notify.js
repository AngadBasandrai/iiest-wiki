export const LEAD_MINUTES = 15;
const MAX_DELAY = 2 ** 31 - 1;
const FOLLOW_KEY = "iiest.follows";

let timers = [];

export function supported() {
  return typeof Notification !== "undefined" && "serviceWorker" in navigator;
}

export function permission() {
  if (!supported()) return "unsupported";
  return Notification.permission;
}

export async function enable() {
  if (!supported()) return "unsupported";
  return Notification.requestPermission();
}

export function clearScheduled() {
  timers.forEach(clearTimeout);
  timers = [];
}

export async function schedule(items) {
  clearScheduled();
  if (permission() !== "granted") return 0;

  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 0;

  const now = Date.now();
  let armed = 0;
  for (const item of items) {
    const fireAt = item.at - LEAD_MINUTES * 60000;
    const delay = fireAt - now;
    if (delay <= 0 || delay > MAX_DELAY) continue;
    timers.push(setTimeout(() => {
      reg.showNotification(item.title, {
        body: item.body,
        icon: "./icon-192.png",
        badge: "./icon-192.png",
        tag: item.tag,
        renotify: false,
        data: { url: item.url || "./" },
      }).catch(() => {});
    }, delay));
    armed += 1;
  }
  return armed;
}

export function classReminders(classesFor, isoToday) {
  const out = [];
  for (const slot of classesFor(isoToday)) {
    if (!slot.start) continue;
    const at = new Date(`${isoToday}T${slot.start}:00`).getTime();
    if (Number.isNaN(at)) continue;
    out.push({
      at,
      tag: `class-${slot.code}-${isoToday}-${slot.start}`,
      title: `${slot.code || "Class"} in ${LEAD_MINUTES} minutes`,
      body: [slot.title, slot.room].filter(Boolean).join(" | ") +
            ` at ${slot.start}`,
      url: "./#overview",
    });
  }
  return out;
}

export function eventReminders(clubs, followed) {
  const out = [];
  for (const club of clubs) {
    if (!followed.includes(club.slug)) continue;
    for (const ev of club.events || []) {
      const at = new Date(`${ev.date}T${(ev.start || "09:00")}:00`).getTime();
      if (Number.isNaN(at)) continue;
      out.push({
        at,
        tag: `club-${club.slug}-${ev.date}-${ev.title}`,
        title: `${club.name} in ${LEAD_MINUTES} minutes`,
        body: [ev.title, ev.venue].filter(Boolean).join(" | ") +
              ` at ${ev.start}`,
        url: `./#club/${club.slug}`,
      });
    }
  }
  return out;
}

export function readFollows() {
  try {
    const raw = JSON.parse(localStorage.getItem(FOLLOW_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function writeFollows(list) {
  try {
    localStorage.setItem(FOLLOW_KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked, follows simply do not persist */
  }
}
