import { useMemo, useState } from "react";
import { useJson } from "../lib/data.js";
import { norm, count } from "../lib/util.js";

export default function Faculty({ query, setQuery }) {
  const { data, error } = useJson("faculty");
  const [dept, setDept] = useState("");
  const [kind, setKind] = useState("faculty");

  const people = useMemo(() => (data?.people || []).map((p) => ({
    ...p,
    hay: norm([p.name, p.department, p.designation, p.role, p.email,
               ...(p.courses || []).map((c) => `${c.code} ${c.title}`)].join(" ")),
  })), [data]);

  const q = norm(query.trim());
  const rows = people.filter((p) =>
    (!kind || p.kind === kind) && (!dept || p.department === dept) &&
    (!q || p.hay.includes(q)));

  if (error) return <p className="empty">Could not load faculty: {error.message}</p>;

  return (
    <section className="view">
      <div className="page-head">
        <h1>Faculty</h1>
        <p className="sub">
          {data ? count(rows.length, "person", "people") + (dept ? `, ${dept}` : "") : ""}
        </p>
      </div>
      <div className="controls">
        <input type="search" className="input wide" placeholder="Search name, department, course"
               value={query} onChange={(e) => setQuery(e.target.value)}
               autoComplete="off" spellCheck="false" />
        <select className="input select" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All departments</option>
          {(data?.departments || []).map((d) => <option key={d}>{d}</option>)}
        </select>
        <select className="input select" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="faculty">Teaching faculty</option>
          <option value="staff">Staff</option>
          <option value="officer">Officers</option>
          <option value="">Everyone</option>
        </select>
      </div>
      <div className="grid">
        {rows.map((p) => (
          <article className="card" key={`${p.kind}-${p.id}`}>
            <div className="card-top">
              {p.photo ? (
                <img className="avatar" loading="lazy" alt="" src={p.photo}
                     onError={(e) => e.currentTarget.remove()} />
              ) : null}
              <div className="card-body">
                <div className="card-name">{p.name}</div>
                <div className="card-role">{p.designation}</div>
                {p.department ? <div className="card-dept">{p.department}</div> : null}
              </div>
            </div>
            <div className="card-links">
              {p.email ? <a className="chip" href={`mailto:${p.email}`}>{p.email}</a> : null}
              {p.phone ? <a className="chip" href={`tel:${p.phone.replace(/\s/g, "")}`}>{p.phone}</a> : null}
              {p.profile ? <a className="chip" href={p.profile} target="_blank" rel="noreferrer">Profile</a> : null}
              {p.scholar ? <a className="chip" href={p.scholar} target="_blank" rel="noreferrer">Scholar</a> : null}
              {p.role ? <span className="chip tag">{p.role}</span> : null}
            </div>
            {(p.courses || []).length ? (
              <div className="card-courses">
                <span className="course-label">Teaches</span>
                {p.courses.map((c) => (
                  <span className="chip course" key={`${c.code}-${c.title}`}>{c.code} {c.title}</span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {data && !rows.length ? <p className="empty">No one matches that search.</p> : null}
    </section>
  );
}
