import { VAPID_PUBLIC_KEY, configured } from "./config.js";
import { db, user } from "./auth.js";

function urlBase64ToUint8Array(base64) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window &&
    Boolean(VAPID_PUBLIC_KEY);
}

function keyOf(sub, name) {
  const raw = sub.getKey(name);
  if (!raw) return "";
  return btoa(String.fromCharCode(...new Uint8Array(raw)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function subscribe() {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  if (!configured() || !user()) return { ok: false, reason: "signed-out" };

  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return { ok: false, reason: "no-worker" };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } catch (err) {
      return { ok: false, reason: "denied", error: err };
    }
  }

  try {
    await db("push_subscriptions", {
      method: "POST",
      body: {
        endpoint: sub.endpoint,
        student: user().id,
        p256dh: keyOf(sub, "p256dh"),
        auth: keyOf(sub, "auth"),
        user_agent: navigator.userAgent.slice(0, 300),
        last_seen: new Date().toISOString(),
      },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  } catch (err) {
    return { ok: false, reason: "store-failed", error: err };
  }

  return { ok: true, endpoint: sub.endpoint };
}

export async function unsubscribe() {
  const sub = await currentSubscription();
  if (!sub) return { ok: true };
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  try {
    await db("push_subscriptions", {
      method: "DELETE",
      params: { endpoint: `eq.${endpoint}` },
    });
  } catch {
    /* row may already be gone, the local subscription is what matters */
  }
  return { ok: true };
}
