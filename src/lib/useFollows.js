import { useCallback, useEffect, useState } from "react";
import { configured } from "./config.js";
import { db } from "./auth.js";
import { useUser } from "./useAuth.js";

const FOLLOW_KEY = "iiest.follows";

function readFollows() {
  try {
    const raw = JSON.parse(localStorage.getItem(FOLLOW_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeFollows(list) {
  try {
    localStorage.setItem(FOLLOW_KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked, follows simply do not persist */
  }
}

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
