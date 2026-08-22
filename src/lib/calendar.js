import { isoDate, addDays, weekdayOf } from "./util.js";

export const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday",
                          "Friday", "Saturday", "Sunday"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                       "August", "September", "October", "November", "December"];

export function semesterFor(joinYear, on = new Date()) {
  if (!joinYear) return null;
  const year = on.getFullYear();
  const month = on.getMonth() + 1;
  const elapsed = year - joinYear;
  const semester = month >= 7 ? elapsed * 2 + 1 : elapsed * 2;
  return Math.min(10, Math.max(1, semester));
}

// NSS, NCC, PT and Yoga sit on the routine but are not graded courses, so they
// show on the schedule and stay out of the attendance maths.
export const graded = (slot) => slot.kind !== "Activity";

const appliesTo = (item, semester) =>
  !item.semesters || !semester || item.semesters.includes(semester);

export function sessionFor(schedule, key, joinYear) {
  const semester = semesterFor(joinYear);
  const terms = schedule.terms || [];
  const term = terms.find((t) => appliesTo(t, semester) && t.semesters)
    || terms.find((t) => appliesTo(t, semester))
    || terms[0]
    || { start: schedule.start, end: schedule.end, label: "Session" };

  return {
    session: schedule.session,
    source: schedule.source,
    semester: semester || schedule.semester || null,
    label: term.label || "Session",
    term: term.id || "",
    start: term.start,
    end: term.end,
    ...((schedule.overrides || {})[key] || {}),
  };
}

export function holidayOn(holidays, iso, semester) {
  for (const h of holidays) {
    if (!appliesTo(h, semester)) continue;
    if (h.date === iso) return h;
    if (h.start && h.end && iso >= h.start && iso <= h.end) return h;
  }
  return null;
}

export function examOn(exams, iso, semester) {
  for (const e of exams) {
    if (!appliesTo(e, semester)) continue;
    if (iso >= e.start && iso <= e.end) return e;
  }
  return null;
}

export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = addDays(isoDate(first), -lead);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const iso = addDays(start, i);
    const d = new Date(`${iso}T00:00:00`);
    cells.push({ iso, day: d.getDate(), outside: d.getMonth() !== month,
                 weekend: weekdayOf(iso) >= 5 });
  }
  return cells;
}

export function dayState(ctx, iso) {
  const { session, holidays, exams, classesFor, statusFor } = ctx;
  const sem = session.semester;

  const holiday = holidayOn(holidays, iso, sem);
  if (holiday) return { kind: "holiday", holiday };

  const exam = examOn(exams, iso, sem);
  if (exam) return { kind: "exam", exam };

  if (iso < session.start || iso > session.end) return { kind: "outside" };
  if (weekdayOf(iso) >= 5) return { kind: "weekend" };

  const classes = classesFor(iso);
  if (!classes.length) return { kind: "free" };

  const counted = classes.filter(graded);
  if (!counted.length) return { kind: "free", classes };

  const marks = counted.map((slot) => statusFor(slot, iso));
  const present = marks.filter((m) => m === "present").length;
  const absent = marks.filter((m) => m === "absent").length;
  const cancelled = marks.filter((m) => m === "cancelled").length;

  if (cancelled === marks.length) return { kind: "cancelled", classes };
  if (present === marks.length) return { kind: "present", classes };
  if (absent === marks.length) return { kind: "absent", classes };
  if (present || absent || cancelled) return { kind: "mixed", classes };
  return { kind: "unmarked", classes };
}
