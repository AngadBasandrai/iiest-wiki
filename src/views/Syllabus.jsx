import { useState } from "react";
import { useJson } from "../lib/data.js";
import { norm, count } from "../lib/util.js";

const COLS = [
  ["code", "Code", "code"], ["type", "Type", "code"], ["course", "Course", "name"],
  ["L", "L", "num"], ["T", "T", "num"], ["P", "P", "num"],
  ["credit", "Credit", "num"], ["marks", "Marks", "num"],
];

function SemTable({ sem }) {
  const used = COLS.filter(([key]) => sem.courses.some((c) => c[key]));
  const off = sem.printed_credits != null && sem.printed_credits !== sem.credits;
  return (
    <div className="block">
      <div className="block-head">
        <h3>{sem.name}</h3>
        <span className="meta">
          {sem.credits} credits{off ? `, PDF prints ${sem.printed_credits}` : ""}
        </span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>{used.map(([, label, cls]) => (
              <th key={label} className={cls === "num" ? "num" : ""}>{label}</th>
            ))}</tr>
          </thead>
          <tbody>
            {sem.courses.map((c, i) => (
              <tr key={i} className={c.summary ? "sum" : ""}>
                {used.map(([key, , cls]) => (
                  <td key={key} className={cls}>{c[key] || ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Syllabus() {
  const { data, error } = useJson("syllabus");
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("");
  const [showDocs, setShowDocs] = useState(false);

  if (error) return <p className="empty">Could not load syllabus: {error.message}</p>;
  const depts = (data?.departments || []).filter((d) => !dept || d.name === dept);
  const q = norm(query.trim());

  const hits = [];
  if (q) {
    for (const d of depts) {
      for (const st of d.structures) {
        for (const sem of st.semesters) {
          for (const c of sem.courses) {
            if (!c.summary && norm(`${c.course} ${c.code}`).includes(q)) {
              hits.push({ dept: d.name, sem: sem.name, c });
            }
          }
        }
      }
    }
  }

  const withStructure = depts.filter((d) => d.structures.length);
  const courses = withStructure.reduce((a, d) => a + d.structures.reduce(
    (b, s) => b + s.semesters.reduce((c, m) =>
      c + m.courses.filter((x) => !x.summary).length, 0), 0), 0);

  return (
    <section className="view">
      <div className="page-head">
        <h1>Syllabus</h1>
        <p className="sub">
          {!data ? "" : q ? count(hits.length, "course", "courses")
            : showDocs ? count(depts.reduce((a, d) => a + d.docs.length, 0), "document", "documents")
            : `${count(courses, "course", "courses")} across ${count(withStructure.length, "department", "departments")}, B.Tech NEP structure`}
        </p>
      </div>
      <div className="controls">
        <input type="search" className="input wide" placeholder="Search a course or code"
               value={query} onChange={(e) => setQuery(e.target.value)}
               autoComplete="off" spellCheck="false" />
        <select className="input select" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All departments</option>
          {(data?.departments || []).map((d) => <option key={d.name}>{d.name}</option>)}
        </select>
        <button className="toggle" aria-pressed={showDocs}
                onClick={() => setShowDocs(!showDocs)}>Documents</button>
      </div>

      <div className="notice-banner">
        <strong>These tables are machine-read from PDFs and some rows will be wrong.</strong>
        <span>Course codes, credits and L-T-P values were extracted automatically from each
        department's own syllabus PDF. Layout quirks, scanned pages and OCR errors all survive
        into the output. Before you rely on anything here, open the source PDF linked in each
        department heading below and check it. Where our credit total disagrees with the total
        the PDF prints, both numbers are shown.</span>
      </div>

      {q ? (
        hits.length ? (
          <div className="table-scroll">
            <table>
              <thead><tr>
                <th>Code</th><th>Course</th><th>Department</th><th>Semester</th>
                <th className="num">Credit</th>
              </tr></thead>
              <tbody>
                {hits.map((h, i) => (
                  <tr key={i}>
                    <td className="code">{h.c.code}</td>
                    <td className="name">{h.c.course}</td>
                    <td className="dim">{h.dept}</td>
                    <td className="dim">{h.sem}</td>
                    <td className="num">{h.c.credit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">No courses match those filters.</p>
      ) : depts.map((d) => {
        const structures = showDocs ? [] : d.structures;
        if (!structures.length && !showDocs) return null;
        const source = structures[0]?.source;
        return (
          <section className="dept" key={d.name}>
            <div className="dept-head">
              <h2>{d.name}</h2>
              <span className="head-links">
                {source ? (
                  <a className="meta strong" href={source} target="_blank" rel="noreferrer">source PDF</a>
                ) : null}
                <a className="meta" href={d.page} target="_blank" rel="noreferrer">department page</a>
              </span>
            </div>
            {structures.map((s) => (
              <div key={s.source}>
                <div className="block-head">
                  <p className="section-label">{s.title}</p>
                  <a className="meta" href={s.source} target="_blank" rel="noreferrer">open source PDF</a>
                </div>
                <div className="stack">
                  {s.semesters.map((sem) => <SemTable sem={sem} key={sem.name} />)}
                </div>
              </div>
            ))}
            {showDocs ? (
              <ul className="doc-list">
                {d.docs.map((doc) => (
                  <li key={doc.url + doc.programme}>
                    <a className={`doc ${doc.broken ? "dead" : ""}`} href={doc.url}
                       target="_blank" rel="noreferrer">
                      <span className="doc-main">
                        <span className="doc-title">{doc.title}</span>
                        {doc.context ? <span className="doc-ctx">{doc.context}</span> : null}
                      </span>
                      <span className="doc-tags">
                        {doc.nep ? <span className="badge nep">NEP</span> : null}
                        <span className="badge">{doc.programme}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </section>
  );
}
