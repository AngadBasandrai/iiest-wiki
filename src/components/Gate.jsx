import Icon from "./Icon.jsx";
import { configured } from "../lib/config.js";
import { signIn } from "../lib/auth.js";

export function EmptyPanel({ icon = "info", title, pill, note, tone = "" }) {
  return (
    <div className={`panel-empty ${tone}`}>
      <span className="panel-ico"><Icon name={icon} /></span>
      <h3>{title}</h3>
      {pill ? <span className="pill soft">{pill}</span> : null}
      {note ? <p>{note}</p> : null}
    </div>
  );
}

export function Alert({ title, detail }) {
  const hint = /permission denied|42501/i.test(detail || "")
    ? " Re-run supabase/schema.sql, it includes the table grants."
    : /foreign key|profiles/i.test(detail || "")
      ? " Your profile row is missing. Sign out and back in once."
      : "";
  return (
    <div className="alert">
      <strong>{title}</strong>{detail}{hint}
    </div>
  );
}

export default function Gate({ who, table, parts, children }) {
  if (!configured()) {
    return (
      <EmptyPanel
        title="Attendance is not switched on"
        note="Add your Supabase URL and anon key to src/lib/config.js, then rebuild."
      />
    );
  }
  if (!who) {
    return (
      <div className="gate">
        <EmptyPanel
          title="Sign in required"
          note="Attendance is private to your account. Sign in with your student email to start marking."
        />
        <div className="more-wrap">
          <button className="btn primary" onClick={signIn}>Sign in with Google</button>
        </div>
      </div>
    );
  }
  if (!table) {
    const file = parts ? `${parts.dept}-${parts.year}.ics` : "your department calendar";
    return (
      <EmptyPanel
        icon="cal"
        title={`No timetable for ${who.roll}`}
        note={`Your roll number maps to a calendar named ${file}, which is not published yet. Add it to public/data/timetables/ and run the scraper.`}
      />
    );
  }
  return children;
}
