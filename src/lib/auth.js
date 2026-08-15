import { SUPABASE_URL, SUPABASE_ANON_KEY, EMAIL_DOMAIN, configured } from "./config.js";

const STORE = "iiest.session";
const listeners = new Set();
let session = null;
let refreshing = null;

function decode(token) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "="));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

function save(next) {
  session = next;
  if (next) localStorage.setItem(STORE, JSON.stringify(next));
  else localStorage.removeItem(STORE);
  for (const fn of listeners) fn(user());
}

function fromTokens(tokens) {
  const claims = decode(tokens.access_token || "");
  if (!claims) return null;
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || "",
    expires_at: Number(tokens.expires_at) || claims.exp || 0,
    email: (claims.email || "").toLowerCase(),
    sub: claims.sub || "",
  };
}

function readHash() {
  if (!location.hash.includes("access_token=")) return null;
  const params = new URLSearchParams(location.hash.slice(1));
  const tokens = {
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
    expires_at: params.get("expires_at"),
  };
  history.replaceState(null, "", location.pathname + location.search + "#overview");
  return tokens.access_token ? fromTokens(tokens) : null;
}

function readError() {
  if (!location.hash.includes("error")) return "";
  const params = new URLSearchParams(location.hash.slice(1));
  const message = params.get("error_description") || params.get("error") || "";
  if (message) history.replaceState(null, "", location.pathname + location.search + "#overview");
  return decodeURIComponent(message.replace(/\+/g, " "));
}

export const authError = readError();

export function user() {
  if (!session) return null;
  const local = session.email.split("@")[0];
  const first = local.split(".")[1] || "";
  return {
    id: session.sub,
    email: session.email,
    roll: local.split(".")[0].toUpperCase(),
    name: first ? first[0].toUpperCase() + first.slice(1) : "",
  };
}

export function onChange(fn) {
  listeners.add(fn);
  fn(user());
  return () => listeners.delete(fn);
}

async function refresh() {
  if (!session?.refresh_token) return null;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!res.ok) {
      save(null);
      return null;
    }
    const next = fromTokens(await res.json());
    save(next);
    return next;
  })();
  const result = await refreshing;
  refreshing = null;
  return result;
}

export async function accessToken() {
  return token();
}

async function token() {
  if (!session) return null;
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at && session.expires_at - now < 60) await refresh();
  return session?.access_token || null;
}

export function signIn() {
  const back = `${location.origin}${location.pathname}`;
  const url = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", back);
  url.searchParams.set("hd", EMAIL_DOMAIN);
  location.href = url.toString();
}

export async function signOut() {
  const access = await token();
  if (access) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${access}` },
    }).catch(() => {});
  }
  save(null);
}

export async function db(path, { method = "GET", body, prefer, params } = {}) {
  if (!configured()) throw new Error("Sign-in is not configured yet");
  const access = await token();
  if (!access) throw new Error("Please sign in first");

  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${access}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return null;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data;
}

let profileReady = false;

export async function ensureProfile() {
  const who = user();
  if (!who || profileReady) return;
  const local = who.email.split("@")[0];
  const roll = local.split(".")[0];
  const first = local.split(".")[1] || "";
  try {
    await db("profiles", {
      method: "POST",
      body: {
        id: who.id,
        email: who.email,
        roll: roll.toUpperCase(),
        year: Number((/^(\d{4})/.exec(roll) || [])[1]) || null,
        dept: ((/^\d{4}([A-Za-z]{3})/.exec(roll) || [])[1] || "").toUpperCase() || null,
        display: first ? first[0].toUpperCase() + first.slice(1) : roll.toUpperCase(),
      },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
    profileReady = true;
  } catch {
    profileReady = false;
  }
}

export function init() {
  if (!configured()) return;
  const hashed = readHash();
  if (hashed) {
    save(hashed);
    return;
  }
  try {
    const stored = JSON.parse(localStorage.getItem(STORE) || "null");
    if (stored?.access_token) {
      save(stored);
      const now = Math.floor(Date.now() / 1000);
      if (stored.expires_at && stored.expires_at - now < 120) refresh();
    }
  } catch {
    localStorage.removeItem(STORE);
  }
}

export const domainHint = `Sign in with your @${EMAIL_DOMAIN} account`;
