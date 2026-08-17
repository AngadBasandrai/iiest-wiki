import Gate, { Alert } from "../components/Gate.jsx";
import { DAY_NAMES } from "../lib/calendar.js";

const LUNCH = { start: "12:30", end: "13:50" };
const DAYS = [0, 1, 2, 3, 4];
const FALLBACK = { start: "09:00", end: "16:35" };

const toMin = (t) => {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + m;
};

function label(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

// Sort by start, then spread overlapping classes across side-by-side tracks so
// nothing gets hidden behind a parallel elective.
function layout(items) {
  const sorted = items
    .map((s) => ({ slot: s, from: toMin(s.start), to: toMin(s.end) }))
    .sort((a, b) => a.from - b.from || b.to - a.to);

  const placed = [];
  let cluster = [];
  let tracks = [];

  const flush = () => {
    const lanes = tracks.length || 1;
    for (const it of cluster) placed.push({ ...it, lanes });
    cluster = [];
    tracks = [];
  };

  for (const it of sorted) {
    if (tracks.length && it.from >= Math.max(...tracks)) flush();
    let lane = tracks.findIndex((end) => end <= it.from);
    if (lane < 0) {
      lane = tracks.length;
      tracks.push(it.to);
    } else {
      tracks[lane] = it.to;
    }
    cluster.push({ ...it, lane });
  }
  flush();
  return placed;
}

export default function Weekly({ att, onFaculty }) {
  const table = att.table;
  const slots = table?.slots || [];

  const opens = slots.map((s) => toMin(s.start));
  const closes = slots.map((s) => toMin(s.end));
  const dayStart = opens.length ? Math.min(...opens) : toMin(FALLBACK.start);
  const dayEnd = closes.length ? Math.max(...closes) : toMin(FALLBACK.end);

  const top = Math.floor(dayStart / 60) * 60;
  const bottom = Math.max(dayEnd, top + 60);
  const span = bottom - top;
  const at = (min) => `${((min - top) / span) * 100}%`;
  const tall = (mins) => `${(mins / span) * 100}%`;

  const ticks = [];
  for (let t = top + 60; t < bottom; t += 60) ticks.push(t);

  const lunchFrom = Math.max(toMin(LUNCH.start), top);
  const lunchTo = Math.min(toMin(LUNCH.end), bottom);
  const hasLunch = lunchTo > lunchFrom;

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
            <span>{label(dayStart)} to {label(dayEnd)}</span>
            <span className="dim">Lunch {label(toMin(LUNCH.start))} to {label(toMin(LUNCH.end))}</span>
          </div>
          <div className="wk-cal">
            <div className="wk-corner" />
            {DAYS.map((day) => (
              <div className="wk-head" key={`head-${day}`}>
                <span className="wk-day-long">{DAY_NAMES[day]}</span>
                <span className="wk-day-short">{DAY_NAMES[day].slice(0, 3)}</span>
              </div>
            ))}

            <div className="wk-gutter">
              <span className="wk-tick first" style={{ top: at(top) }}>{label(top)}</span>
              {ticks.map((t) => (
                <span className="wk-tick" style={{ top: at(t) }} key={t}>{label(t)}</span>
              ))}
              <span className="wk-tick last" style={{ top: at(bottom) }}>{label(bottom)}</span>
            </div>

            {DAYS.map((day) => {
              const items = layout(slots.filter((s) => s.day === day));
              return (
                <div className="wk-col" key={day}>
                  {ticks.map((t) => (
                    <i className="wk-rule" style={{ top: at(t) }} key={t} />
                  ))}
                  {hasLunch ? (
                    <div
                      className="wk-lunch"
                      style={{ top: at(lunchFrom), height: tall(lunchTo - lunchFrom) }}
                    >
                      <span>Lunch</span>
                    </div>
                  ) : null}

                  {items.length ? items.map(({ slot: s, from, to, lane, lanes }, i) => {
                    const mins = to - from;
                    const size = mins < 70 ? "short" : mins < 110 ? "mid" : "long";
                    return (
                      <article
                        className={`wk-item ${s.kind.toLowerCase()} ${size}`}
                        key={`${s.code}-${s.start}-${i}`}
                        style={{
                          top: at(from),
                          height: tall(mins),
                          left: `calc(${(lane / lanes) * 100}% + 1px)`,
                          width: `calc(${(1 / lanes) * 100}% - 2px)`,
                        }}
                      >
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
                      </article>
                    );
                  }) : <p className="wk-none dim tiny">No classes</p>}
                </div>
              );
            })}
          </div>
        </div>
      </Gate>
    </section>
  );
}
