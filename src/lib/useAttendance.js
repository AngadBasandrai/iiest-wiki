import { useCallback, useEffect, useMemo, useState } from "react";
import { db, ensureProfile } from "./auth.js";
import { configured, ATTENDANCE_TARGET } from "./config.js";
import { isoDate, addDays, weekdayOf, fmtDate } from "./util.js";
import { sessionFor, dayState } from "./calendar.js";
import { loadJson } from "./data.js";
import { useUser } from "./useAuth.js";

export const slotId = (slot) => `${slot.day}-${slot.start}`;
export const markKey = (code, date, slot) => `${code}|${date}|${slot}`;
export const today = () => isoDate(new Date());

function rollParts(roll) {
  const m = /^(\d{4})([A-Z]{3})(\d+)$/.exec(roll || "");
  if (!m) return null;
  return { year: Number(m[1]), dept: m[2], number: Number(m[3]),
           batch: `${m[2]}-${m[1]}` };
}

function pickTable(timetables, groups, roll) {
  const parts = rollParts(roll);
  if (!parts) return { table: null, parts: null };
  const batch = timetables.filter((t) => t.dept === parts.dept && t.year === parts.year);
  if (!batch.length) return { table: null, parts };
  if (batch.length === 1 && !batch[0].group) return { table: batch[0], parts };

  for (const rule of groups[parts.batch] || []) {
    const okMin = rule.min == null || parts.number >= rule.min;
    const okMax = rule.max == null || parts.number <= rule.max;
    if (okMin && okMax) {
      const hit = batch.find((t) => t.group === rule.group);
      if (hit) return { table: { ...hit, groupLabel: rule.label }, parts };
    }
  }
  return { table: batch.find((t) => !t.group) || null, parts };
}

export function useAttendance() {
  const who = useUser();
  const [sets, setSets] = useState(null);
  const [marks, setMarks] = useState(() => new Map());
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      loadJson("timetables"),
      loadJson("schedule"),
      loadJson("holidays", []),
      loadJson("exams", []),
      loadJson("groups", {}),
    ]).then(([timetables, schedule, holidays, exams, groups]) => {
      if (alive) setSets({ timetables, schedule, holidays, exams, groups });
    }).catch((err) => alive && setError(err));
    return () => { alive = false; };
  }, []);

  const { table, parts } = useMemo(() => {
    if (!sets || !who) return { table: null, parts: null };
    return pickTable(sets.timetables.timetables, sets.groups, who.roll);
  }, [sets, who]);

  const session = useMemo(() => {
    if (!sets || !table) return null;
    const s = sessionFor(sets.schedule, table.key, table.year);
    return { ...s, startLabel: fmtDate(s.start), endLabel: fmtDate(s.end) };
  }, [sets, table]);

  useEffect(() => {
    let alive = true;
    if (!configured() || !who || !table) {
      setLoading(false);
      return () => {};
    }
    setLoading(true);
    (async () => {
      try {
        await ensureProfile();
        const rows = (await db("attendance", { params: { select: "*" } })) || [];
        if (!alive) return;
        const next = new Map();
        for (const r of rows) next.set(markKey(r.course_code, r.class_on, r.slot), r.status);
        setMarks(next);
        setError(null);
      } catch (err) {
        if (alive) setError(err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [who, table]);

  const classesFor = useCallback((iso) => {
    if (!table || !session) return [];
    const day = weekdayOf(iso);
    return table.slots
      .filter((s) => {
        if (s.day !== day) return false;
        if (!s.weekly) return iso === s.from;
        return iso >= session.start && iso <= session.end;
      })
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [table, session]);

  const statusFor = useCallback((slot, iso) => {
    const stored = marks.get(markKey(slot.code, iso, slotId(slot)));
    if (stored) return stored;
    return iso < today() ? "absent" : "";
  }, [marks]);

  const storedStatus = useCallback(
    (slot, iso) => marks.get(markKey(slot.code, iso, slotId(slot))) || "",
    [marks]);

  const ctx = useMemo(() => ({
    session, holidays: sets?.holidays || [], exams: sets?.exams || [],
    classesFor, statusFor,
  }), [session, sets, classesFor, statusFor]);

  const rows = useMemo(() => {
    if (!session) return [];
    const byCourse = new Map();
    let cursor = session.start;
    const stop = session.end < today() ? session.end : today();
    while (cursor <= stop) {
      const info = dayState(ctx, cursor);
      if (info.classes) {
        for (const slot of info.classes) {
          const key = slot.code || slot.title;
          const row = byCourse.get(key) || {
            code: slot.code, title: slot.title, profs: slot.profs,
            present: 0, absent: 0, cancelled: 0,
          };
          const status = statusFor(slot, cursor);
          if (status === "present") row.present += 1;
          else if (status === "absent") row.absent += 1;
          else if (status === "cancelled") row.cancelled += 1;
          byCourse.set(key, row);
        }
      }
      cursor = addDays(cursor, 1);
    }
    const target = ATTENDANCE_TARGET / 100;
    return [...byCourse.values()].map((r) => {
      const held = r.present + r.absent;
      const pct = held ? Math.round((r.present / held) * 100) : 100;
      const canSkip = Math.max(0, Math.floor(r.present / target) - held);
      const needed = pct < ATTENDANCE_TARGET
        ? Math.ceil((target * held - r.present) / (1 - target)) : 0;
      return { ...r, held, pct, canSkip, needed };
    }).sort((a, b) => (a.code || a.title).localeCompare(b.code || b.title));
  }, [session, ctx, statusFor]);

  const totals = useMemo(() => {
    const present = rows.reduce((a, r) => a + r.present, 0);
    const absent = rows.reduce((a, r) => a + r.absent, 0);
    const cancelled = rows.reduce((a, r) => a + r.cancelled, 0);
    const held = present + absent;
    return { present, absent, cancelled, held, pct: held ? (present / held) * 100 : 100 };
  }, [rows]);

  const setMark = useCallback(async (slot, iso, status) => {
    const key = markKey(slot.code, iso, slotId(slot));
    const clearing = marks.get(key) === status;
    const next = new Map(marks);
    if (clearing) next.delete(key);
    else next.set(key, status);
    setMarks(next);

    try {
      if (clearing) {
        await db("attendance", {
          method: "DELETE",
          params: {
            course_code: `eq.${slot.code}`,
            class_on: `eq.${iso}`,
            slot: `eq.${slotId(slot)}`,
          },
        });
      } else {
        await db("attendance", {
          method: "POST",
          body: { student: who.id, course_code: slot.code, class_on: iso,
                  slot: slotId(slot), status },
          prefer: "resolution=merge-duplicates,return=minimal",
        });
      }
      setError(null);
    } catch (err) {
      setMarks(marks);
      setError(err);
    }
  }, [marks, who]);

  return { who, sets, table, parts, session, ctx, rows, totals,
           classesFor, statusFor, storedStatus, setMark, error, loading };
}
