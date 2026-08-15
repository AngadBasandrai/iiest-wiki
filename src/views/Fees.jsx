import { useState } from "react";
import { useJson } from "../lib/data.js";
import { count } from "../lib/util.js";

function FeeBlock({ block }) {
  const width = Math.max(
    2 + block.columns.length,
    ...block.rows.map((r) => r.filter((c, i) => c || i < 2).length), 3);
  const head = ["", "Particulars", ...block.columns];
  while (head.length < width) head.push("");

  return (
    <div className="block">
      <div className="block-head"><h3>{block.section}. {block.heading}</h3></div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>{head.map((h, i) => (
              <th key={i} className={i > 1 ? "num" : ""}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => {
              const filled = row.filter(Boolean).length;
              if (filled === 1 && row[0] && !/^\d/.test(row[0])) {
                return (
                  <tr className="group-row" key={ri}><td colSpan={width}>{row[0]}</td></tr>
                );
              }
              const label = row[1] || "";
              const cells = [];
              for (let i = 2; i < width; i++) cells.push(row[i] || "");
              return (
                <tr key={ri} className={/total/i.test(label) ? "sum" : ""}>
                  <td className="code">{row[0] || ""}</td>
                  <td className="name">{label}</td>
                  {cells.map((c, i) => <td className="num" key={i}>{c}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Fees() {
  const { data, error } = useJson("fees");
  const [index, setIndex] = useState(0);

  if (error) return <p className="empty">Could not load fees: {error.message}</p>;
  const section = data?.sections?.[index];
  const structures = (data?.structures || []).filter(
    (s) => section && s.programme === section.programme);

  return (
    <section className="view">
      <div className="page-head">
        <h1>Fees</h1>
        <p className="sub">
          {section ? count(section.links.length, "document", "documents") +
            (structures.length ? `, ${count(structures.length, "fee table", "fee tables")}` : "") : ""}
        </p>
      </div>
      <div className="controls">
        <select className="input select" value={index}
                onChange={(e) => setIndex(Number(e.target.value))}>
          {(data?.sections || []).map((s, i) => (
            <option value={i} key={s.programme}>{s.programme}</option>
          ))}
        </select>
      </div>

      {structures.map((s) => (
        <section key={s.source}>
          <div className="block-head">
            <h2>{s.title}</h2>
            <a className="meta" href={s.source} target="_blank" rel="noreferrer">source</a>
          </div>
          {s.blocks.map((b, i) => <FeeBlock block={b} key={i} />)}
        </section>
      ))}

      {section ? (
        <>
          <p className="section-label">Documents</p>
          <ul className="doc-list">
            {section.links.length ? section.links.map((l, i) => (
              <li key={l.url + i}>
                <a className={`doc ${l.broken ? "dead" : ""}`} href={l.url}
                   target="_blank" rel="noreferrer">
                  <span className="doc-main"><span className="doc-title">{l.title}</span></span>
                  <span className="doc-tags">
                    <span className="badge">{l.kind === "pdf" ? "PDF" : "Web"}</span>
                  </span>
                </a>
              </li>
            )) : <li className="dim">Nothing listed.</li>}
          </ul>
          {section.notes.length ? (
            <>
              <p className="section-label">Notes</p>
              <ul className="notes-list">
                {section.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
