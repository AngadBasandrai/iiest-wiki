import { useCallback, useEffect, useState } from "react";
import {
  classReminders, clearScheduled, enable, eventReminders,
  permission, readFollows, schedule, writeFollows,
} from "./notify.js";
import { isoDate } from "./util.js";
import { loadJson } from "./data.js";
import { currentSubscription, pushSupported, sendTest, subscribe, unsubscribe }
  from "./push.js";
import { configured } from "./config.js";
import { db } from "./auth.js";
import { useUser } from "./useAuth.js";

export function useFollows() {
  const [follows, setFollows] = useState(readFollows);
  const who = useUser();

  useEffect(() => {
    if (!configured() || !who) return;
    let alive = true;
    (async () => {
      try {
        const rows = (await db("club_follows", { params: { select: "club" } })) || [];
        const remote = rows.map((r) => r.club);
        const local = readFollows();
        const merged = [...new Set([...remote, ...local])];
        const missing = merged.filter((c) => !remote.includes(c));
        if (missing.length) {
          await db("club_follows", {
            method: "POST",
            body: missing.map((club) => ({ student: who.id, club })),
            prefer: "resolution=merge-duplicates,return=minimal",
          });
        }
        if (!alive) return;
        writeFollows(merged);
        setFollows(merged);
      } catch {
        /* offline or blocked, localStorage keeps working */
      }
    })();
    return () => { alive = false; };
  }, [who]);

  const toggle = useCallback((slug) => {
    setFollows((prev) => {
      const adding = !prev.includes(slug);
      const next = adding ? [...prev, slug] : prev.filter((s) => s !== slug);
      writeFollows(next);

      if (configured() && who) {
        const call = adding
          ? db("club_follows", {
              method: "POST",
              body: { student: who.id, club: slug },
              prefer: "resolution=merge-duplicates,return=minimal",
            })
          : db("club_follows", { method: "DELETE", params: { club: `eq.${slug}` } });
        call.catch(() => {});
      }
      return next;
    });
  }, [who]);

  return { follows, toggle, following: (slug) => follows.includes(slug) };
}

export function useReminders(classesFor, follows, ready) {
  const [perm, setPerm] = useState(permission);
  const [armed, setArmed] = useState(0);
  const [push, setPush] = useState({ supported: pushSupported(), on: false, error: "" });

  useEffect(() => {
    let alive = true;
    currentSubscription()
      .then((sub) => alive && setPush((p) => ({ ...p, on: Boolean(sub) })))
      .catch(() => {});
    return () => { alive = false; };
  }, [perm]);

  const ask = useCallback(async () => {
    const result = await enable();
    setPerm(result);
    if (result !== "granted") return result;

    if (pushSupported()) {
      const res = await subscribe();
      setPush({ supported: true, on: res.ok, error: res.ok ? "" : res.reason });
    }
    return result;
  }, []);

  const stopPush = useCallback(async () => {
    await unsubscribe();
    setPush((p) => ({ ...p, on: false }));
  }, []);

  const [testState, setTestState] = useState("");
  const test = useCallback(async () => {
    setTestState("sending");
    const res = await sendTest().catch((e) => ({ ok: false, reason: e.message }));
    setTestState(res.ok ? `sent to ${res.sent} device${res.sent > 1 ? "s" : ""}` : res.reason);
    setTimeout(() => setTestState(""), 6000);
  }, []);

  useEffect(() => {
    if (perm !== "granted" || !ready) return () => {};

    let alive = true;
    const run = async () => {
      const today = isoDate(new Date());
      const items = classesFor ? classReminders(classesFor, today) : [];
      try {
        const clubs = await loadJson("clubs", { clubs: [] });
        items.push(...eventReminders(clubs.clubs || [], follows));
      } catch {
        /* clubs data missing, class reminders still schedule */
      }
      if (!alive) return;
      setArmed(await schedule(items));
    };

    run();
    const onWake = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      clearScheduled();
    };
  }, [perm, ready, classesFor, follows]);

  return { perm, ask, armed, push, stopPush, test, testState };
}
