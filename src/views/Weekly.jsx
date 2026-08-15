import Gate, { Alert } from "../components/Gate.jsx";
import { DAY_NAMES } from "../lib/calendar.js";

const LUNCH = { start: "12:30", end: "13:50" };

export default function Weekly({ att, onFaculty }) {
  const table = att.table;
  const slots = table?.slots || [];
  const times = [...new Set(slots.flatMap((s) => [s.start, s.end]))].sort();
  const first = times[0] || "09:00";
  const last = times[times.length - 1] || "17:00";

  return (
    <section className="view">
      <div className="page-head">
        <h1>Weekly Schedule</h1>
        <p className="sub">
          {table ? `${table.department}, ${table.dept} ${table.year}` : ""}
        </p>
      </div>
      {att.error ? <Alert title="Attendance problem. " detail={att.error.message} /> : null}
      <Gate who={att.who} table={att.table} parts={att.parts}>
        <div className="card-plain">
          <div className="wk-meta">
            <span>{first} to {last}</span>
            <span className="dim">Lunch {LUNCH.start} to {LUNCH.end}</span>
          </div>
          <div className="wk-grid">
            {[0, 1, 2, 3, 4].map((day) => {
              const items = slots.filter((s) => s.day === day)
                .sort((a, b) => a.start.localeCompare(b.start));
              return (
                <div className="wk-col" key={day}>
                  <div className="wk-head">{DAY_NAMES[day]}</div>
                  <div className="wk-stack">
                    {items.length ? items.map((s, i) => (
                      <div className={`wk-item ${s.kind.toLowerCase()}`} key={`${s.code}-${s.start}-${i}`}>
                        <div className="wk-name">{s.title}</div>
                        <div className="wk-code">{s.code}</div>
                        <div className="wk-foot">
                          <span className="wk-time">{s.start} - {s.end}</span>
                          {s.room ? <span className="wk-room">{s.room}</span> : null}
                        </div>
                        {s.profs.length ? (
                          <div className="wk-profs">
                            {s.profs.map((p, n) => (
                              <span key={p}>
                                {n ? ", " : ""}
                                <button className="linkish" onClick={() => onFaculty(p)}>{p}</button>
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )) : <p className="dim tiny">No classes</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Gate>
    </section>
  );
}
