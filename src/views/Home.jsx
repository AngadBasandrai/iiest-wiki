import Icon from "../components/Icon.jsx";
import Gate, { Alert } from "../components/Gate.jsx";
import { ATTENDANCE_TARGET } from "../lib/config.js";
import { useJson } from "../lib/data.js";
import { useNow } from "../lib/useNow.js";
import { go } from "../lib/router.js";
import { isoDate, addDays, weekdayOf, fmtDate } from "../lib/util.js";
import { DAY_NAMES, dayState } from "../lib/calendar.js";

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];
const NOTICES = 6;
const CLUBS = 4;

const toMin = (t) => {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + m;
};

function since(mins) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

// The first class that has not finished yet, looking a week ahead so a Friday
// evening still points at Monday. dayState does the holiday and exam filtering.
function upcoming(ctx, now) {
  if (!ctx.session) return null;
  const from = isoDate(now);
  const mins = now.getHours() * 60 + now.getMinutes();
  for (let ahead = 0; ahead < 8; ahead++) {
    const iso = addDays(from, ahead);
    const info = dayState(ctx, iso);
    if (!info.classes) continue;
    for (const slot of info.classes) {
      const start = toMin(slot.start);
      const end = toMin(slot.end);
      if (ahead === 0 && end <= mins) continue;
      const live = ahead === 0 && mins >= start;
      return {
        slot, iso, ahead, live,
        left: live ? end - mins : ahead === 0 ? start - mins : 0,
      };
    }
  }
  return null;
}

// When nothing is coming up, say what is blocking the day rather than just
// going quiet: an exam window and a holiday read very differently.
function idleReason(ctx, now) {
  const info = dayState(ctx, isoDate(now));
  if (info.kind === "exam") {
    return { ico: "file", title: info.exam.name, note: "Regular classes are suspended." };
  }
  if (info.kind === "holiday") {
    return { ico: "cal", title: info.holiday.name, note: "No classes today." };
  }
  if (info.kind === "outside") {
    const s = ctx.session;
    return {
      ico: "cal", title: "Outside the teaching term",
      note: `${s.label} runs ${fmtDate(s.start)} to ${fmtDate(s.end)}.`,
    };
  }
  if (info.kind === "weekend") {
    return { ico: "cup", title: "Weekend", note: "Nothing scheduled until Monday." };
  }
  return { ico: "cup", title: "Nothing scheduled", note: "No classes in the week ahead." };
}

function NowNext({ ctx, now, onFaculty }) {
  const next = upcoming(ctx, now);
  if (!next) {
    const idle = idleReason(ctx, now);
    return (
      <div className="now-card quiet">
        <span className="now-ico"><Icon name={idle.ico} /></span>
        <div className="now-body">
          <p className="micro">Up next</p>
          <p className="now-title">{idle.title}</p>
          <p className="now-note"><span>{idle.note}</span></p>
        </div>
      </div>
    );
  }

  const { slot, iso, ahead, live, left } = next;
  const when = live ? `Ends in ${since(left)}`
    : ahead === 0 ? `Starts in ${since(left)}`
    : ahead === 1 ? `Tomorrow, ${slot.start}`
    : `${DAY_NAMES[weekdayOf(iso)]}, ${slot.start}`;

  return (
    <div className={`now-card${live ? " live" : ""}`}>
      <span className="now-ico"><Icon name={live ? "trend" : "cal"} /></span>
      <div className="now-body">
        <p className="micro">{live ? "In class now" : "Up next"}</p>
        <p className="now-title">{slot.title}</p>
        <p className="now-note">
          {slot.code ? <span className="now-code">{slot.code}</span> : null}
          <span>{slot.start} to {slot.end}</span>
          {slot.room ? <span>{slot.room}</span> : null}
          {slot.profs.length ? (
            <button className="linkish" onClick={() => onFaculty(slot.profs[0])}>
              {slot.profs[0]}
            </button>
          ) : null}
        </p>
      </div>
      <span className="now-when">{when}</span>
    </div>
  );
}

function Identity({ who, table, session }) {
  const year = ORDINAL[Math.ceil((session?.semester || 0) / 2)] || "";
  const group = table.groupLabel || table.group || "";
  return (
    <div className="id-card">
      <span className="id-mark">{who.roll.slice(-2)}</span>
      <div className="id-body">
        <p className="id-name">{who.name || who.roll}</p>
        <p className="id-dept">{table.department}</p>
      </div>
      <dl className="id-facts">
        <div><dt>Roll</dt><dd>{who.roll}</dd></div>
        <div>
          <dt>Semester</dt>
          <dd>{session?.semester || "-"}{year ? `, ${year} year` : ""}</dd>
        </div>
        <div><dt>Group</dt><dd>{group || "Not split"}</dd></div>
      </dl>
    </div>
  );
}

function Alerts({ rows }) {
  const low = rows.filter((r) => r.pct < ATTENDANCE_TARGET).sort((a, b) => a.pct - b.pct);
  return (
    <div className="card-plain home-card">
      <div className="home-card-head">
        <h2>Attendance alerts</h2>
        <button className="link-more" onClick={() => go("courses")}>All courses</button>
      </div>
      {low.length ? (
        <ul className="risk-list">
          {low.map((r) => (
            <li className={`risk${r.pct < 50 ? " critical" : ""}`} key={r.code || r.title}>
              <span className="risk-pct">{r.pct}%</span>
              <span className="risk-body">
                <span className="risk-name">{r.title}</span>
                <span className="risk-note">
                  {r.present} of {r.held} held
                  {r.needed ? `, ${r.needed} straight to reach ${ATTENDANCE_TARGET}%` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="home-empty">
          <Icon name="check" className="ico good" />
          Every course is at or above {ATTENDANCE_TARGET}%.
        </p>
      )}
    </div>
  );
}

function LatestNotices() {
  const { data, error } = useJson("notices", { records: [] });
  const rows = (data?.records || []).slice(0, NOTICES);
  return (
    <div className="card-plain home-card notice-window">
      <div className="home-card-head">
        <h2>Latest notices</h2>
        <button className="link-more" onClick={() => go("notices")}>All</button>
      </div>
      {error ? (
        <p className="home-empty">Could not load notices.</p>
      ) : (
        <ul className="mini-notices">
          {rows.map((n) => (
            <li key={n.id}>
              <span className="mini-date">{fmtDate(n.date)}</span>
              <span className="mini-title">{n.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FollowedClubs({ clubs, follows }) {
  const mine = clubs.filter((c) => follows.includes(c.slug)).slice(0, CLUBS);
  const open = (club) => (club.site
    ? window.open(club.site, "_blank", "noopener")
    : go("club", club.slug));

  return (
    <div className="card-plain home-card">
      <div className="home-card-head">
        <h2>Your clubs</h2>
        <button className="link-more" onClick={() => go("clubs")}>Browse</button>
      </div>
      {mine.length ? (
        <div className="mini-clubs">
          {mine.map((club) => (
            <button className="mini-club" key={club.slug} onClick={() => open(club)}>
              <span className="mini-club-mark">
                {club.logo ? <img src={club.logo} alt="" /> : <Icon name="star" />}
              </span>
              <span className="mini-club-text">
                <span className="mini-club-name">{club.name}</span>
                <span className="mini-club-line">{club.tagline}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="home-empty">
          <Icon name="star" />
          Not following any clubs yet. Browse them and tap Follow.
        </p>
      )}
    </div>
  );
}

export default function Home({ att, clubs, follows, onFaculty }) {
  const now = useNow();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning"
    : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <section className="view">
      <div className="page-head">
        <h1>{greeting}{att.who?.name ? `, ${att.who.name}` : ""}</h1>
        <p className="sub">
          {now.toLocaleDateString(undefined,
            { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {att.error ? <Alert title="Attendance problem. " detail={att.error.message} /> : null}

      <Gate who={att.who} table={att.table} parts={att.parts}>
        <NowNext ctx={att.ctx} now={now} onFaculty={onFaculty} />
        <Identity who={att.who} table={att.table} session={att.session} />
      </Gate>

      <div className="home-split">
        <div className="home-main">
          {att.who && att.table ? <Alerts rows={att.rows} /> : null}
          <FollowedClubs clubs={clubs} follows={follows} />
        </div>
        <LatestNotices />
      </div>
    </section>
  );
}
