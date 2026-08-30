import { ANALYTICS_SITE } from "./config.js";

// GoatCounter, loaded from the app rather than from a script tag in index.html.
//
// Two reasons it is wired this way. First, a stock snippet in <head> runs before
// main.jsx, and straight after a Google sign-in the URL still carries
// #access_token=... at that moment; a default snippet would post that token to
// the analytics host as the page URL. Second, the app is hash-routed, so
// #home -> #clubs is not a page load and the automatic counter would record one
// hit per session and nothing after.
//
// So auto-counting is off and this module never reads location. Every hit is
// built from the route the router already parsed, which carries no roll number,
// name, email or attendance.

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", ""]);
const ENDPOINT = `https://${ANALYTICS_SITE}.goatcounter.com/count`;
const SCRIPT = "https://gc.zgo.at/count.js";

const enabled = () => Boolean(ANALYTICS_SITE) && !LOCAL.has(location.hostname);

let booted = false;
let dead = false;
const queue = [];

function flush() {
  const gc = window.goatcounter;
  if (!gc || typeof gc.count !== "function") return;
  for (const hit of queue.splice(0)) gc.count(hit);
}

function boot() {
  if (booted) return;
  booted = true;
  window.goatcounter = {
    no_onload: true,    // we fire page views ourselves, on hash change
    no_events: true,    // no automatic click tracking
    endpoint: ENDPOINT,
  };
  const el = document.createElement("script");
  el.async = true;
  el.src = SCRIPT;
  el.addEventListener("load", flush);
  el.addEventListener("error", () => {
    // blocked, offline or the host is down: stop queueing so it cannot grow
    dead = true;
    queue.length = 0;
  });
  document.head.appendChild(el);
}

function send(hit) {
  if (!enabled() || dead) return;
  boot();
  queue.push(hit);
  flush();
}

/** One page view for a parsed route. Never pass anything user-specific. */
export function pageview(view, param) {
  send({ path: param ? `/${view}/${param}` : `/${view}` });
}

/** An anonymous counter, e.g. "club-follow". No identifiers, no payload. */
export function event(name) {
  send({ path: name, title: name, event: true });
}
