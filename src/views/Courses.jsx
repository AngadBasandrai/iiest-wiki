import Gate, { Alert } from "../components/Gate.jsx";
import { ATTENDANCE_TARGET } from "../lib/config.js";

export default function Courses({ att, onFaculty }) {
  const rows = att.rows;
  const session = att.session;

  return (
    <section className="view">
      <div className="page-head">
        <h1>Course Attendance</h1>
        <p className="sub">
          {session ? `Semester ${session.semester} of the ${session.session} session.` : ""}
        </p>
      </div>
      {att.error ? <Alert title="Attendance problem. " detail={att.error.message} /> : null}
      <Gate who={att.who} table={att.table} parts={att.parts}>
        <div className="card-plain">
          <div className="block-head"><h2>Detailed Analysis</h2></div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Course</th><th>Status</th><th>Presence</th>
                  <th className="num">Attendance %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const face = r.held === 0 ? "" : r.pct >= ATTENDANCE_TARGET ? "good" : "bad";
                  return (
                    <tr key={r.code || r.title}>
                      <td>
                        <div className="course-name">{r.title}</div>
                        <div className="course-code">{r.code}</div>
                        {r.profs.length ? (
                          <div className="course-profs">
                            {r.profs.map((p, i) => (
                              <span key={p}>
                                {i ? ", " : ""}
                                <button className="linkish" onClick={() => onFaculty(p)}>{p}</button>
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="nowrap">
                        <span className="tag good">P {r.present}</span>
                        <span className="tag bad">A {r.absent}</span>
                        {r.cancelled ? <span className="tag warn">C {r.cancelled}</span> : null}
                      </td>
                      <td className="grow">
                        <div className={`bar ${face}`}><i style={{ width: `${r.pct}%` }} /></div>
                      </td>
                      <td className={`num pct-cell ${face}`}>{r.pct}%</td>
                    </tr>
                  );
                })}
                {!rows.length ? (
                  <tr><td colSpan={4} className="dim">No classes in this timetable.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </Gate>
    </section>
  );
}
