const STORE = "iiest.pending";

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function write(map) {
  try {
    localStorage.setItem(STORE, JSON.stringify(map));
  } catch {
    localStorage.removeItem(STORE);
  }
}

export function pending() {
  return read();
}

export function enqueue(key, entry) {
  const map = read();
  map[key] = entry;
  write(map);
}

export function drop(key) {
  const map = read();
  delete map[key];
  write(map);
}

export function count() {
  return Object.keys(read()).length;
}

let running = null;

export async function flush(send) {
  if (running) return running;

  running = (async () => {
    const map = read();
    const keys = Object.keys(map);
    if (!keys.length) return { sent: 0, failed: 0 };

    let sent = 0;
    let failed = 0;
    for (const key of keys) {
      const job = read()[key];
      if (!job) continue;
      try {
        await send(job);
        drop(key);
        sent += 1;
      } catch {
        failed += 1;
      }
    }
    return { sent, failed };
  })();

  try {
    return await running;
  } finally {
    running = null;
  }
}

export function onReconnect(fn) {
  window.addEventListener("online", fn);
  return () => window.removeEventListener("online", fn);
}
