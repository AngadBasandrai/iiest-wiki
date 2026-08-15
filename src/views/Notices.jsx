import { useMemo, useState } from "react";
import { useJson } from "../lib/data.js";
import { norm, count, fmtDate, splitMatch } from "../lib/util.js";

const PAGE = 60;

function Marked({ text, query }) {
  return splitMatch(text, query).map((part, i) =>
    part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>);
}

export default function Notices() {
  const { data, error } = useJson("notices");
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("");
  const [shown, setShown] = useState(PAGE);

  const records = useMemo(() => (data?.records || []).map((n) => ({
    ...n, hay: norm(`${n.title} ${n.body}`),
  })), [data]);

  const q = norm(query.trim());
  const rows = records.filter((n) =>
    (!year || n.date.startsWith(year)) && (!q || n.hay.includes(q)));
  const slice = rows.slice(0, shown);

  if (error) return <p className="empty">Could not load notices: {error.message}</p>;

  return (
    <section className="view">
      <div className="page-head">
        <h1>Student notices</h1>
        <p className="sub">
          {data ? `${count(rows.length, "notice", "notices")}, showing ${slice.length}` : ""}
        </p>
      </div>
      <div className="controls">
        <input type="search" className="input wide" placeholder="Search notices"
               value={query} autoComplete="off" spellCheck="false"
               onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
        <select className="input select" value={year}
                onChange={(e) => { setYear(e.target.value); setShown(PAGE); }}>
          <option value="">All years</option>
          {(data?.years || []).map((y) => <option key={y}>{y}</option>)}
        </select>
      </div>
      <ul className="notices">
        {slice.map((n) => (
          <li className="notice" key={n.id}>
            <div className="notice-date">{fmtDate(n.date)}</div>
            <div className="notice-main">
              <div className="notice-title"><Marked text={n.title} query={query.trim()} /></div>
              {n.body ? (
                <div className="notice-body">
                  <Marked text={n.body.slice(0, 320)} query={query.trim()} />
                </div>
              ) : null}
              {n.files.length || n.link ? (
                <div className="notice-files">
                  {n.files.map((f) => (
                    <a className="chip" key={f.url} href={f.url} target="_blank" rel="noreferrer">
                      {f.name}
                    </a>
                  ))}
                  {n.link ? (
                    <a className="chip" href={n.link} target="_blank" rel="noreferrer">Link</a>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {data && !rows.length ? <p className="empty">No notices match that search.</p> : null}
      {rows.length > shown ? (
        <div className="more-wrap">
          <button className="btn" onClick={() => setShown(shown + PAGE)}>Show more</button>
        </div>
      ) : null}
    </section>
  );
}
