import { useCallback, useEffect, useState } from "react";
import Icon from "./components/Icon.jsx";
import Sidebar from "./components/Sidebar.jsx";
import UpdateToast from "./components/UpdateToast.jsx";
import Overview from "./views/Overview.jsx";
import Weekly from "./views/Weekly.jsx";
import Courses from "./views/Courses.jsx";
import Faculty from "./views/Faculty.jsx";
import Notices from "./views/Notices.jsx";
import Syllabus from "./views/Syllabus.jsx";
import Fees from "./views/Fees.jsx";
import Guide from "./views/Guide.jsx";
import Club from "./views/Club.jsx";
import Clubs from "./views/Clubs.jsx";
import { useRoute, go } from "./lib/router.js";
import { useAttendance } from "./lib/useAttendance.js";
import { useFollows, useReminders } from "./lib/useNotify.js";
import { authError } from "./lib/auth.js";
import { loadJson } from "./lib/data.js";

const TITLES = {
  overview: "Daily Overview", weekly: "Weekly Schedule", courses: "Course Attendance",
  faculty: "Faculty", notices: "Notices", syllabus: "Syllabus", fees: "Fees",
  guide: "Student guide", clubs: "Clubs",
};

export default function App() {
  const { view, param } = useRoute();
  const att = useAttendance();
  const [open, setOpen] = useState(false);
  const [facultyQuery, setFacultyQuery] = useState("");
  const [updated, setUpdated] = useState("");
  const [clubs, setClubs] = useState([]);
  const { follows, toggle } = useFollows();
  const reminders = useReminders(att.classesFor, follows, Boolean(att.table));

  useEffect(() => {
    const club = clubs.find((c) => c.slug === param);
    document.title = view === "club" && club
      ? `${club.name} | IIEST Shibpur`
      : `${TITLES[view] || "IIEST Shibpur"} | IIEST Shibpur`;
  }, [view, param, clubs]);

  useEffect(() => {
    loadJson("clubs", { clubs: [] })
      .then((d) => setClubs(d.clubs || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadJson("meta", {}).then((meta) => {
      const when = new Date(meta.updated);
      if (!Number.isNaN(+when)) {
        setUpdated(when.toLocaleDateString(undefined,
          { day: "numeric", month: "short", year: "numeric" }));
      }
    }).catch(() => {});
  }, []);

  const openFaculty = useCallback((name) => {
    setFacultyQuery(name);
    go("faculty");
    window.scrollTo({ top: 0 });
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="shell">
      <Sidebar view={view} who={att.who} session={att.session} table={att.table}
               open={open} onNavigate={close} />
      {open ? <div className="side-scrim" onClick={close} /> : null}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn" aria-label="Toggle navigation"
                  onClick={() => setOpen(!open)}>
            <Icon name="panel" />
          </button>
          <span className="topbar-title">IIEST Shibpur Student Hub</span>
          <span className="pill">UNOFFICIAL COMMUNITY PORTAL</span>
        </header>

        <main className="content">
          {authError ? (
            <p className="empty">Sign-in failed: {authError}</p>
          ) : null}

          {view === "overview" ? (
            <Overview att={att} onFaculty={openFaculty} reminders={reminders} />
          ) : null}
          {view === "clubs" ? <Clubs follows={follows} /> : null}
          {view === "club" ? (
            <Club slug={param} follows={follows} onToggle={toggle}
                  perm={reminders.perm} onAsk={reminders.ask} />
          ) : null}
          {view === "weekly" ? <Weekly att={att} onFaculty={openFaculty} /> : null}
          {view === "courses" ? <Courses att={att} onFaculty={openFaculty} /> : null}
          {view === "faculty" ? (
            <Faculty query={facultyQuery} setQuery={setFacultyQuery} />
          ) : null}
          {view === "notices" ? <Notices /> : null}
          {view === "syllabus" ? <Syllabus /> : null}
          {view === "fees" ? <Fees /> : null}
          {view === "guide" ? <Guide path={param} /> : null}

          <footer className="footer">
            <a href="https://www.iiests.ac.in" target="_blank" rel="noreferrer">iiests.ac.in</a>
            <span className="dot" />
            <span>{updated ? `Updated ${updated}` : ""}</span>
          </footer>
        </main>
      </div>
      <UpdateToast />
    </div>
  );
}
