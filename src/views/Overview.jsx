import { useState } from "react";
import Icon from "../components/Icon.jsx";
import Gate, { EmptyPanel, Alert } from "../components/Gate.jsx";
import { ATTENDANCE_TARGET } from "../lib/config.js";
import { fmtDate, weekdayOf } from "../lib/util.js";
import { DOW, DAY_NAMES, MONTHS, dayState, monthGrid } from "../lib/calendar.js";
import { slotId, today } from "../lib/useAttendance.js";

const LEGEND = [
  ["present", "All present"], ["absent", "All absent"], ["cancelled", "Cancelled"],
  ["mixed", "Mixed"], ["exam", "Exams"], ["holiday", "Holiday"],
];

function Stats({ totals, rows }) {
  const pct = Math.round(totals.pct);
  const low = rows.filter((r) => r.pct < ATTENDANCE_TARGET);
  return (
    <div className="stat-grid">
      <div className="stat wide">
        <div className="stat-head">
          <span className="stat-label">Overall Attendance</span>
          <Icon name="trend" className="ico accent" />
        </div>
        <div className="stat-value">{pct}%</div>
        <div className={`bar ${totals.pct >= ATTENDANCE_TARGET ? "good" : "bad"}`}>
          <i style={{ width: `${Math.min(100, totals.pct)}%` }} />
        </div>
        <div className="stat-note">Target {ATTENDANCE_TARGET}% eligibility</div>
        {low.length ? (
          <div className="alert-list">
            <p className="alert-title">Attendance alerts</p>
            {low.slice(0, 5).map((r) => (
              <div key={r.code || r.title} className={`alert-row${r.pct < 50 ? "" : " warn"}`}>
                <span className="alert-tag">{r.pct < 50 ? "Critical" : "Low"}</span>
                <span>{r.title} at {r.pct}%</span>
              </div>
            ))}
            {low.length > 5 ? (
              <p className="alert-more">and {low.length - 5} more below target</p>
            ) : null}
          </div>
        ) : null}
      </div>
      {[
        ["Present", "check", "good", totals.present, "Classes attended"],
        ["Absent", "cross", "bad", totals.absent, "Classes missed"],
        ["Cancelled", "ban", "warn", totals.cancelled, "Faculty cancelled"],
      ].map(([label, ico, tone, value, note]) => (
        <div className="stat" key={label}>
          <div className="stat-head">
            <span className="stat-label">{label}</span>
            <Icon name={ico} className={`ico ${tone}`} />
          </div>
          <div className={`stat-value ${tone}`}>{value}</div>
          <div className="stat-note">{note}</div>
        </div>
      ))}
    </div>
  );
}

function Calendar({ month, setMonth, selected, setSelected, ctx }) {
  const [y, m] = month;
  const now = today();
  return (
    <div className="cal">
      <div className="cal-head">
        <button className="icon-btn" aria-label="Previous month"
                onClick={() => { const d = new Date(y, m - 1, 1); setMonth([d.getFullYear(), d.getMonth()]); }}>
          &#8249;
        </button>
        <h3>{MONTHS[m]} {y}</h3>
        <button className="icon-btn" aria-label="Next month"
                onClick={() => { const d = new Date(y, m + 1, 1); setMonth([d.getFullYear(), d.getMonth()]); }}>
          &#8250;
        </button>
      </div>
      <div className="cal-grid">
        {DOW.map((d, i) => (
          <span className={`cal-dow${i >= 5 ? " weekend" : ""}`} key={d + i}>{d}</span>
        ))}
        {monthGrid(y, m).map((c) => {
          const info = dayState(ctx, c.iso);
          const cls = ["cal-day", `is-${info.kind}`,
                       c.outside ? "faded" : "", c.weekend ? "weekend" : "",
                       c.iso === selected ? "picked" : "", c.iso === now ? "now" : ""]
            .filter(Boolean).join(" ");
          return (
            <button className={cls} key={c.iso} data-day={c.iso}
                    onClick={() => setSelected(c.iso)}>{c.day}</button>
          );
        })}
      </div>
      <div className="legend">
        {LEGEND.map(([k, label]) => (
          <span className="leg" key={k}><i className={`dot-${k}`} />{label}</span>
        ))}
      </div>
    </div>
  );
}

function DayPanel({ iso, ctx, session, statusFor, storedStatus, onMark, onFaculty }) {
  const info = dayState(ctx, iso);

  if (info.kind === "outside") {
    const when = iso < session.start
      ? `${session.label} classes begin on ${fmtDate(session.start)}.`
      : `${session.label} classes ended on ${fmtDate(session.end)}.`;
    return <EmptyPanel title="Outside the teaching term" note={when} />;
  }
  if (info.kind === "exam") {
    return <EmptyPanel title={info.exam.name} pill="Exam window"
                       note={info.exam.note || "Regular classes suspended."} />;
  }
  if (info.kind === "holiday") {
    return <EmptyPanel icon="cal" title={info.holiday.name} pill="Public holiday"
                       note="No regular classes today." />;
  }
  if (info.kind === "weekend") {
    return <EmptyPanel icon="cup" title="Weekend break" pill="Rest day"
                       note="Enjoy your weekend." />;
  }
  if (!info.classes || !info.classes.length) {
    return <EmptyPanel icon="cal" title="No classes" note="Nothing scheduled for this day." />;
  }

  const unmarked = info.classes.some((s) => !storedStatus(s, iso)) && iso < today();
  return (
    <>
      <div className="panel-head">
        <h3>{DAY_NAMES[weekdayOf(iso)]} schedule</h3>
        <span className="pill soft">{iso}</span>
      </div>
      {unmarked ? (
        <p className="panel-note">Unmarked classes in the past count as absent.</p>
      ) : null}
      <div className="klass-list">
        {info.classes.map((slot) => {
          const status = statusFor(slot, iso);
          const stored = storedStatus(slot, iso);
          return (
            <article className={`klass ${status}${stored ? "" : " implied"}`}
                     key={`${slot.code}-${slotId(slot)}`}>
              <div className="klass-bar" />
              <div className="klass-body">
                <div className="klass-top">
                  <div>
                    <div className="klass-name">{slot.title}</div>
                    <div className="klass-code">{slot.code}</div>
                  </div>
                  <div className="klass-when">
                    <span>{slot.start} to {slot.end}</span>
                    {slot.room ? <span className="dim">{slot.room}</span> : null}
                  </div>
                </div>
                {slot.profs.length ? (
                  <div className="klass-profs">
                    {slot.profs.map((p, i) => (
                      <span key={p}>
                        {i ? ", " : ""}
                        <button className="linkish" onClick={() => onFaculty(p)}>{p}</button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="klass-actions">
                  {[["present", "P", "Present"], ["absent", "A", "Absent"],
                    ["cancelled", "C", "Class cancelled"]].map(([kind, label, title]) => {
                    const future = iso > today();
                    const blocked = future && kind !== "cancelled";
                    return (
                      <button key={kind} disabled={blocked}
                              title={blocked ? "Only cancellations can be marked ahead of time" : title}
                              className={`mark ${kind}${stored === kind ? " on" : ""}`}
                              onClick={() => onMark(slot, iso, kind)}>{label}</button>
                    );
                  })}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function ReminderBar({ reminders }) {
  if (reminders.perm === "unsupported") return null;
  if (reminders.perm === "granted") {
    const p = reminders.push;
    const detail = !p.supported
      ? "This device gets reminders while the app is open."
      : p.on
        ? "This device is registered for push."
        : p.error === "signed-out"
          ? "Sign in to get reminders when the app is closed."
          : "Reminders arrive while the app is open.";
    return (
      <div className="remind on">
        <Icon name="bellring" />
        <span>
          Reminders are on, {reminders.armed} queued for today. {detail}
        </span>
        {p.on ? (
          <button className="link-inline" onClick={reminders.stopPush}>
            Stop on this device
          </button>
        ) : null}
      </div>
    );
  }
  if (reminders.perm === "denied") {
    return (
      <div className="remind">
        <Icon name="bellring" />
        <span>Notifications are blocked. Allow them in your browser settings to get
              class reminders.</span>
      </div>
    );
  }
  return (
    <div className="remind">
      <Icon name="bellring" />
      <span>Get a reminder 15 minutes before every class.</span>
      <button className="btn small primary" onClick={reminders.ask}>Turn on</button>
    </div>
  );
}

export default function Overview({ att, onFaculty, reminders }) {
  const [selected, setSelected] = useState(today());
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return [d.getFullYear(), d.getMonth()];
  });

  return (
    <section className="view">
      <div className="page-head">
        <h1>Academic Overview</h1>
        <p className="sub">
          {att.who && att.table
            ? <>Hello, <strong>{att.who.roll}</strong>. Tracking your {att.table.department} session.</>
            : ""}
        </p>
      </div>
      {att.error ? <Alert title="Attendance problem. " detail={att.error.message} /> : null}
      <Gate who={att.who} table={att.table} parts={att.parts}>
        {reminders ? <ReminderBar reminders={reminders} /> : null}
        <Stats totals={att.totals} rows={att.rows} />
        <div className="split">
          <div className="card-plain">
            <Calendar month={month} setMonth={setMonth} selected={selected}
                      setSelected={setSelected} ctx={att.ctx} />
          </div>
          <div className="card-plain panel">
            <DayPanel iso={selected} ctx={att.ctx} session={att.session}
                      statusFor={att.statusFor} storedStatus={att.storedStatus}
                      onMark={att.setMark} onFaculty={onFaculty} />
          </div>
        </div>
      </Gate>
    </section>
  );
}
