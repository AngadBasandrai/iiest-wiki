import Icon from "./Icon.jsx";
import { configured } from "../lib/config.js";
import { signIn, signOut } from "../lib/auth.js";

const GROUPS = [
  ["Attendance", [
    ["overview", "grid", "Daily Overview"],
    ["weekly", "table", "Weekly Schedule"],
    ["courses", "book", "Course Attendance"],
  ]],
  ["Institute", [
    ["faculty", "users", "Faculty"],
    ["notices", "bell", "Notices"],
    ["syllabus", "file", "Syllabus"],
    ["fees", "rupee", "Fees"],
  ]],
  ["Around campus", [
    ["guide", "help", "Student guide"],
  ]],
];

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

const installed =
  ["standalone", "minimal-ui", "fullscreen", "window-controls-overlay"]
    .some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches) ||
  navigator.standalone === true;

function SessionCard({ session, table }) {
  if (!session) return null;
  const year = ORDINAL[Math.ceil(session.semester / 2)] || "";
  const group = table?.groupLabel || table?.group || "";
  return (
    <div className="session-card">
      <p className="micro">{session.session} session</p>
      <p className="session-line">Semester {session.semester}</p>
      <p className="micro">{year} year{group ? `, ${group}` : ""}</p>
      <p className="session-dates">{session.startLabel} to {session.endLabel}</p>
    </div>
  );
}

export default function Sidebar({ view, who, session, table, open, onNavigate }) {
  return (
    <aside className={`side${open ? " open" : ""}`}>
      <a className="logo" href="#overview" onClick={onNavigate}>
        <span className="logo-tile" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.4 10.9a1 1 0 0 0 0-1.8L12.8 5.2a2 2 0 0 0-1.7 0L2.6 9.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.7 0z"/>
            <path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>
          </svg>
        </span>
        <span className="logo-text">
          <strong>IIEST Shibpur</strong>
          <span className="micro">STUDENT HUB</span>
        </span>
      </a>

      <nav className="nav">
        {GROUPS.map(([label, items]) => (
          <div key={label}>
            <p className="nav-label">{label}</p>
            {items.map(([id, icon, text]) => (
              <a key={id} href={`#${id}`} onClick={onNavigate}
                 aria-current={view === id ? "page" : undefined}>
                <Icon name={icon} />{text}
              </a>
            ))}
          </div>
        ))}
        <a href="#clubs" onClick={onNavigate}
           aria-current={view === "clubs" || view === "club" ? "page" : undefined}>
          <Icon name="star" />Clubs
        </a>
        <a href="https://maps.iiest.wiki" className="external">
          <Icon name="pin" />Campus map
        </a>
        {installed ? null : (
          <a href="./download/" className="external">
            <Icon name="down" />Get the app
          </a>
        )}
      </nav>

      <div className="side-foot">
        <SessionCard session={session} table={table} />
        <div className="user-card">
          {!configured() ? (
            <span className="dim tiny">Sign-in not configured</span>
          ) : who ? (
            <>
              <div className="user-row">
                <span className="avatar-dot">{who.roll.slice(-2)}</span>
                <span className="user-text">
                  <strong>{who.roll}</strong>
                  {who.name ? <span className="micro">{who.name}</span> : null}
                </span>
              </div>
              <button className="link-out" onClick={() => signOut().then(() => location.reload())}>
                <Icon name="out" />Log out
              </button>
            </>
          ) : (
            <button className="btn primary full" onClick={signIn}>Sign in with Google</button>
          )}
        </div>
      </div>
    </aside>
  );
}
