import { db, user, signIn, ensureProfile } from "./auth.js";
import { configured, ATTENDANCE_TARGET } from "./config.js";
import { $, esc, count, fmtDate, isoDate, addDays, weekdayOf } from "./util.js";
import { DOW, DAY_NAMES, MONTHS, sessionFor, dayState, monthGrid } from "./calendar.js";

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

const state = {
  loaded: false,
  timetables: null,
  schedule: null,
  holidays: [],
  exams: [],
  table: null,
  session: null,
  marks: new Map(),
  selected: isoDate(new Date()),
  month: null,
};

const slotId = (slot) => `${slot.day}-${slot.start}`;
const markKey = (code, date, slot) => `${code}|${date}|${slot}`;
const today = () => isoDate(new Date());

function classesFor(iso) {
  if (!state.table || !state.session) return [];
  const day = weekdayOf(iso);
  return state.table.slots
    .filter((s) => {
      if (s.day !== day) return false;
      if (!s.weekly) return iso === s.from;
      return iso >= state.session.start && iso <= state.session.end;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

function storedStatus(slot, iso) {
  return state.marks.get(markKey(slot.code, iso, slotId(slot))) || "";
}

function statusFor(slot, iso) {
  const stored = storedStatus(slot, iso);
  if (stored) return stored;
  return iso < today() ? "absent" : "";
}

const ctx = () => ({
  session: state.session,
  holidays: state.holidays,
  exams: state.exams,
  classesFor,
  statusFor,
});

function allClassDays() {
  const out = [];
  let cursor = state.session.start;
  const stop = state.session.end < today() ? state.session.end : today();
  while (cursor <= stop) {
    const info = dayState(ctx(), cursor);
    if (info.classes) out.push({ iso: cursor, classes: info.classes });
    cursor = addDays(cursor, 1);
  }
  return out;
}

function summary() {
  const byCourse = new Map();
  for (const { iso, classes } of allClassDays()) {
    for (const slot of classes) {
      const key = slot.code || slot.title;
      const row = byCourse.get(key) || {
        code: slot.code, title: slot.title, profs: slot.profs,
        present: 0, absent: 0, cancelled: 0,
      };
      const status = statusFor(slot, iso);
      if (status === "present") row.present += 1;
      else if (status === "absent") row.absent += 1;
      else if (status === "cancelled") row.cancelled += 1;
      byCourse.set(key, row);
    }
  }
  return [...byCourse.values()].map((r) => {
    const held = r.present + r.absent;
    const pct = held ? Math.round((r.present / held) * 100) : 100;
    const target = ATTENDANCE_TARGET / 100;
    const canSkip = Math.max(0, Math.floor(r.present / target) - held);
    const needed = pct < ATTENDANCE_TARGET
      ? Math.ceil((target * held - r.present) / (1 - target)) : 0;
    return { ...r, held, pct, canSkip, needed };
  }).sort((a, b) => (a.code || a.title).localeCompare(b.code || b.title));
}

function totals() {
  const rows = summary();
  const present = rows.reduce((a, r) => a + r.present, 0);
  const absent = rows.reduce((a, r) => a + r.absent, 0);
  const cancelled = rows.reduce((a, r) => a + r.cancelled, 0);
  const held = present + absent;
  return { rows, present, absent, cancelled, held,
           pct: held ? (present / held) * 100 : 100 };
}

async function setMark(slot, iso, status) {
  const key = markKey(slot.code, iso, slotId(slot));
  const clearing = state.marks.get(key) === status;

  if (clearing) state.marks.delete(key);
  else state.marks.set(key, status);
  renderOverview();

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
        body: {
          student: user().id, course_code: slot.code,
          class_on: iso, slot: slotId(slot), status,
        },
        prefer: "resolution=merge-duplicates,return=minimal",
      });
    }
  } catch (err) {
    if (clearing) state.marks.set(key, status);
    else state.marks.delete(key);
    renderOverview();
    showAlert("Could not save that mark", err.message);
  }
}

function showAlert(title, detail) {
  const box = $("#overview-body");
  const hint = /permission denied|42501/i.test(detail)
    ? " Re-run <code>supabase/schema.sql</code>, it now includes the table grants."
    : /foreign key|profiles/i.test(detail)
      ? " Your profile row is missing. Sign out and back in once."
      : "";
  box.insertAdjacentHTML("afterbegin",
    `<div class="alert"><strong>${esc(title)}</strong>${esc(detail)}${hint}</div>`);
}

const ICONS = {
  up: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  x: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  cal: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  cup: '<path d="M10 2v2M14 2v2M6 8h12a2 2 0 0 1 0 8h-1"/><path d="M6 8v8a4 4 0 0 0 4 4h3a4 4 0 0 0 4-4V8"/>',
};

const icon = (name, cls = "") =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

function statCards() {
  const t = totals();
  const pct = t.pct.toFixed(1);
  const low = t.rows
    .filter((r) => r.held && r.pct < ATTENDANCE_TARGET)
    .sort((a, b) => a.pct - b.pct);
  const alerts = low.slice(0, 5)
    .map((r) => `<div class="alert-row ${r.pct < 50 ? "critical" : "warn"}">
      <span class="alert-tag">${r.pct < 50 ? "Critical" : "Low"}</span>
      <span class="alert-name">${esc(r.title)} at ${r.pct}%</span>
    </div>`).join("")
    + (low.length > 5
      ? `<p class="alert-more">and ${low.length - 5} more below target</p>` : "");

  return `<div class="stat-grid">
    <div class="stat wide">
      <div class="stat-head"><span class="stat-label">Overall Attendance</span>${icon("up", "accent")}</div>
      <div class="stat-value">${pct}%</div>
      <div class="bar ${t.pct >= ATTENDANCE_TARGET ? "good" : "bad"}"><i style="width:${Math.min(100, t.pct)}%"></i></div>
      <div class="stat-note">Target ${ATTENDANCE_TARGET}% eligibility</div>
      ${low.length ? `<div class="alert-list"><p class="alert-title">Attendance alerts</p>${alerts}</div>` : ""}
    </div>
    <div class="stat">
      <div class="stat-head"><span class="stat-label">Present</span>${icon("check", "good")}</div>
      <div class="stat-value good">${t.present}</div>
      <div class="stat-note">Classes attended</div>
    </div>
    <div class="stat">
      <div class="stat-head"><span class="stat-label">Absent</span>${icon("x", "bad")}</div>
      <div class="stat-value bad">${t.absent}</div>
      <div class="stat-note">Classes missed</div>
    </div>
    <div class="stat">
      <div class="stat-head"><span class="stat-label">Cancelled</span>${icon("ban", "warn")}</div>
      <div class="stat-value warn">${t.cancelled}</div>
      <div class="stat-note">Faculty cancelled</div>
    </div>
  </div>`;
}

function calendarPanel() {
  const [y, m] = state.month;
  const cells = monthGrid(y, m);
  const now = today();

  const days = cells.map((c) => {
    const info = dayState(ctx(), c.iso);
    const classes = [
      "cal-day", `is-${info.kind}`,
      c.outside ? "faded" : "",
      c.weekend ? "weekend" : "",
      c.iso === state.selected ? "picked" : "",
      c.iso === now ? "now" : "",
    ].filter(Boolean).join(" ");
    return `<button class="${classes}" data-day="${c.iso}">${c.day}</button>`;
  }).join("");

  const legend = [
    ["present", "All present"], ["absent", "All absent"], ["cancelled", "Cancelled"],
    ["mixed", "Mixed"], ["exam", "Exams"], ["holiday", "Holiday"],
  ].map(([k, label]) =>
    `<span class="leg"><i class="dot-${k}"></i>${label}</span>`).join("");

  return `<div class="cal">
    <div class="cal-head">
      <button class="icon-btn" data-month="-1" aria-label="Previous month">&#8249;</button>
      <h3>${MONTHS[m]} ${y}</h3>
      <button class="icon-btn" data-month="1" aria-label="Next month">&#8250;</button>
    </div>
    <div class="cal-grid">
      ${DOW.map((d, i) => `<span class="cal-dow ${i >= 5 ? "weekend" : ""}">${d}</span>`).join("")}
      ${days}
    </div>
    <div class="legend">${legend}</div>
  </div>`;
}

function emptyPanel(icoName, title, badge, note) {
  return `<div class="panel-empty">
    <span class="panel-ico">${icon(icoName)}</span>
    <h3>${esc(title)}</h3>
    ${badge ? `<span class="pill soft">${esc(badge)}</span>` : ""}
    <p>${esc(note)}</p>
  </div>`;
}

function dayPanel() {
  const iso = state.selected;
  const info = dayState(ctx(), iso);

  if (info.kind === "outside") {
    const when = iso < state.session.start
      ? `${state.session.label} classes begin on ${fmtDate(state.session.start)}.`
      : `${state.session.label} classes ended on ${fmtDate(state.session.end)}.`;
    return emptyPanel("info", "Outside the teaching term", null, when);
  }
  if (info.kind === "exam") {
    return emptyPanel("info", info.exam.name, "Exam window",
      info.exam.note || "Regular classes suspended.");
  }
  if (info.kind === "holiday") {
    return emptyPanel("cal", info.holiday.name, "Public holiday", "No regular classes today.");
  }
  if (info.kind === "weekend") {
    return emptyPanel("cup", "Weekend break", "Rest day", "Enjoy your weekend.");
  }
  if (!info.classes || !info.classes.length) {
    return emptyPanel("cal", "No classes", null, "Nothing scheduled for this day.");
  }

  const rows = info.classes.map((slot) => {
    const status = statusFor(slot, iso);
    const stored = storedStatus(slot, iso);
    const profs = slot.profs.map((p) =>
      `<button class="linkish" data-faculty="${esc(p)}">${esc(p)}</button>`).join(", ");
    const btn = (kind, label, title) =>
      `<button class="mark ${kind}${stored === kind ? " on" : ""}" data-mark="${kind}"
        data-slot="${slotId(slot)}" data-code="${esc(slot.code)}" data-date="${iso}"
        title="${title}">${label}</button>`;
    return `<article class="klass ${status}${stored ? "" : " implied"}">
      <div class="klass-bar"></div>
      <div class="klass-body">
        <div class="klass-top">
          <div>
            <div class="klass-name">${esc(slot.title)}</div>
            <div class="klass-code">${esc(slot.code)}</div>
          </div>
          <div class="klass-when">
            <span>${esc(slot.start)} to ${esc(slot.end)}</span>
            ${slot.room ? `<span class="dim">${esc(slot.room)}</span>` : ""}
          </div>
        </div>
        ${profs ? `<div class="klass-profs">${profs}</div>` : ""}
        <div class="klass-actions">
          ${btn("present", "P", "Present")}
          ${btn("absent", "A", "Absent")}
          ${btn("cancelled", "C", "Class cancelled")}
        </div>
      </div>
    </article>`;
  }).join("");

  const unmarked = info.classes.some((s) => !storedStatus(s, iso)) && iso < today();
  return `<div class="panel-head">
      <h3>${DAY_NAMES[weekdayOf(iso)]} schedule</h3>
      <span class="pill soft">${esc(iso)}</span>
    </div>
    ${unmarked ? '<p class="panel-note">Unmarked classes in the past count as absent.</p>' : ""}
    <div class="klass-list">${rows}</div>`;
}

export function renderOverview() {
  const body = $("#overview-body");
  const who = user();
  $("#overview-sub").innerHTML = who
    ? `Hello, <strong>${esc(who.roll)}</strong>. Tracking your ${esc(state.table.department)} session.`
    : "Sign in to track your attendance.";

  body.innerHTML = `${statCards()}
    <div class="split">
      <div class="card-plain">${calendarPanel()}</div>
      <div class="card-plain panel">${dayPanel()}</div>
    </div>`;

  body.querySelectorAll("[data-day]").forEach((el) => {
    el.onclick = () => { state.selected = el.dataset.day; renderOverview(); };
  });
  body.querySelectorAll("[data-month]").forEach((el) => {
    el.onclick = () => {
      const [y, m] = state.month;
      const next = new Date(y, m + Number(el.dataset.month), 1);
      state.month = [next.getFullYear(), next.getMonth()];
      renderOverview();
    };
  });
  body.querySelectorAll("[data-mark]").forEach((el) => {
    el.onclick = () => {
      const slot = state.table.slots.find((s) =>
        slotId(s) === el.dataset.slot && s.code === el.dataset.code);
      if (slot) setMark(slot, el.dataset.date, el.dataset.mark);
    };
  });
  wireFacultyLinks(body);
}

function wireFacultyLinks(root) {
  root.querySelectorAll("[data-faculty]").forEach((el) => {
    el.onclick = () => {
      location.hash = "faculty";
      setTimeout(() => {
        const box = $("#faculty-q");
        if (box) {
          box.value = el.dataset.faculty;
          box.dispatchEvent(new Event("input"));
        }
      }, 60);
    };
  });
}

const LUNCH = { start: "12:30", end: "13:50" };

export function renderWeekly() {
  const body = $("#weekly-body");
  if (!state.table) return;
  $("#weekly-sub").textContent =
    `${state.table.department}, ${state.table.dept} ${state.table.year}`;

  const slots = state.table.slots;
  const times = [...new Set(slots.flatMap((s) => [s.start, s.end]))].sort();
  const first = times[0] || "09:00";
  const last = times[times.length - 1] || "17:00";

  const columns = [0, 1, 2, 3, 4].map((day) => {
    const items = slots.filter((s) => s.day === day).sort((a, b) => a.start.localeCompare(b.start));
    const cells = items.map((s) => `<div class="wk-item ${s.kind.toLowerCase()}">
        <div class="wk-name">${esc(s.title)}</div>
        <div class="wk-code">${esc(s.code)}</div>
        <div class="wk-foot">
          <span class="wk-time">${esc(s.start)} - ${esc(s.end)}</span>
          ${s.room ? `<span class="wk-room">${esc(s.room)}</span>` : ""}
        </div>
        ${s.profs.length ? `<div class="wk-profs">${s.profs.map((p) =>
          `<button class="linkish" data-faculty="${esc(p)}">${esc(p)}</button>`).join(", ")}</div>` : ""}
      </div>`).join("");
    return `<div class="wk-col">
      <div class="wk-head">${DAY_NAMES[day]}</div>
      <div class="wk-stack">${cells || '<p class="dim tiny">No classes</p>'}</div>
    </div>`;
  }).join("");

  body.innerHTML = `<div class="card-plain">
    <div class="wk-meta">
      <span>${esc(first)} to ${esc(last)}</span>
      <span class="dim">Lunch ${LUNCH.start} to ${LUNCH.end}</span>
    </div>
    <div class="wk-grid">${columns}</div>
  </div>`;
  wireFacultyLinks(body);
}

export function renderCourses() {
  const body = $("#courses-body");
  const rows = summary();
  $("#courses-sub").textContent =
    `Semester ${state.session.semester} of the ${state.session.session} session.`;

  const list = rows.map((r) => {
    const face = r.held === 0 ? "" : r.pct >= ATTENDANCE_TARGET ? "good" : "bad";
    const profs = r.profs.map((p) =>
      `<button class="linkish" data-faculty="${esc(p)}">${esc(p)}</button>`).join(", ");
    return `<tr>
      <td>
        <div class="course-name">${esc(r.title)}</div>
        <div class="course-code">${esc(r.code)}</div>
        ${profs ? `<div class="course-profs">${profs}</div>` : ""}
      </td>
      <td class="nowrap">
        <span class="tag good">P ${r.present}</span>
        <span class="tag bad">A ${r.absent}</span>
        ${r.cancelled ? `<span class="tag warn">C ${r.cancelled}</span>` : ""}
      </td>
      <td class="grow"><div class="bar ${face}"><i style="width:${r.pct}%"></i></div></td>
      <td class="num pct-cell ${face}">${r.pct}%</td>
    </tr>`;
  }).join("");

  body.innerHTML = `<div class="card-plain">
    <h2 class="card-title">Detailed analysis</h2>
    <div class="table-scroll"><table class="analysis">
      <thead><tr><th>Course</th><th>Status</th><th>Presence</th><th class="num">Attendance</th></tr></thead>
      <tbody>${list || '<tr><td colspan="4" class="dim">No classes yet.</td></tr>'}</tbody>
    </table></div>
  </div>`;
  wireFacultyLinks(body);
}

function pickTable() {
  const roll = user()?.roll || "";
  const m = /^(\d{4})([A-Z]{3})/.exec(roll);
  if (m) {
    const hit = state.timetables.timetables.find(
      (t) => t.dept === m[2] && t.year === Number(m[1]));
    if (hit) return hit;
  }
  return null;
}

async function loadMarks() {
  state.marks = new Map();
  const rows = (await db("attendance", { params: { select: "*" } })) || [];
  for (const r of rows) state.marks.set(markKey(r.course_code, r.class_on, r.slot), r.status);
}

function gate(view, message, showButton) {
  $(`#${view}-body`).innerHTML = `<div class="card-plain gate">
    <h3>Sign in required</h3>
    <p>${message}</p>
    ${showButton ? '<button class="btn primary" id="gate-signin">Sign in with Google</button>' : ""}
  </div>`;
  const btn = document.getElementById("gate-signin");
  if (btn) btn.onclick = signIn;
}

export function sideCards() {
  const card = $("#session-card");
  if (state.session) {
    const sem = state.session.semester;
    const yearOf = Math.ceil(sem / 2);
    card.innerHTML = `<p class="micro">${esc(state.session.session)} session</p>
      <p class="session-line">Semester ${sem}</p>
      <p class="micro">${ORDINAL[yearOf]} year</p>
      <p class="session-dates">${esc(fmtDate(state.session.start))} to
        ${esc(fmtDate(state.session.end))}</p>`;
    card.hidden = false;
  } else {
    card.hidden = true;
  }
}

export async function showAttendance(view) {
  if (!configured()) {
    $(`#${view}-body`).innerHTML = `<div class="card-plain gate">
      <h3>Not configured</h3>
      <p>Add your Supabase URL and anon key to <code>config.js</code>.</p></div>`;
    return;
  }
  if (!user()) {
    gate(view, "Attendance is private to your account. Sign in with your student email.", true);
    return;
  }

  if (!state.loaded) {
    const [timetables, schedule, holidays, exams] = await Promise.all([
      fetch("data/timetables.json").then((r) => r.json()),
      fetch("data/schedule.json").then((r) => r.json()),
      fetch("data/holidays.json").then((r) => r.json()).catch(() => []),
      fetch("data/exams.json").then((r) => r.json()).catch(() => []),
    ]);
    state.timetables = timetables;
    state.schedule = schedule;
    state.holidays = holidays;
    state.exams = exams;
    state.table = pickTable();
    state.loaded = true;
  }

  if (!state.table) {
    const roll = user().roll;
    $(`#${view}-body`).innerHTML = `<div class="card-plain gate">
      <h3>No timetable for ${esc(roll)}</h3>
      <p>Your roll number maps to a calendar named
      <code>${esc((roll.match(/^\d{4}[A-Z]{3}/) || ["DEPT-YEAR"])[0].replace(/^(\d{4})([A-Z]{3})$/, "$2-$1"))}.ics</code>,
      which is not published yet. Add it to <code>public/data/timetables/</code> and re-run the scraper.</p>
    </div>`;
    return;
  }

  state.session = sessionFor(state.schedule, state.table.key, state.table.year);
  if (!state.month) {
    const base = today() > state.session.end ? state.session.end : today();
    const d = new Date(`${base}T00:00:00`);
    state.month = [d.getFullYear(), d.getMonth()];
  }
  sideCards();

  if (!state.marks.size) {
    try {
      await ensureProfile();
      await loadMarks();
    } catch (err) {
      $(`#${view}-body`).innerHTML = "";
      showAlert("Could not load attendance", err.message);
      return;
    }
  }

  if (view === "overview") renderOverview();
  if (view === "weekly") renderWeekly();
  if (view === "courses") renderCourses();
}
