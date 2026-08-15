import { useEffect, useRef, useState } from "react";
import { useJson } from "../lib/data.js";
import { norm, count } from "../lib/util.js";
import { go } from "../lib/router.js";

export default function Guide({ path }) {
  const { data, error } = useJson("guide");
  const [query, setQuery] = useState("");
  const body = useRef(null);

  const find = (p) => (p ? data?.pages.find((x) => x.path === p) : data?.index);
  const page = find(path) || data?.index;

  useEffect(() => {
    const root = body.current;
    if (!root) return;
    const on = (e) => {
      const el = e.target.closest("[data-wiki]");
      if (!el || !root.contains(el)) return;
      const target = el.dataset.wiki;
      if (target !== "" && !find(target)) return;
      e.preventDefault();
      setQuery("");
      go("guide", target);
      window.scrollTo({ top: 0 });
    };
    root.addEventListener("click", on);
    return () => root.removeEventListener("click", on);
  }, [data, path]);

  if (error) return <p className="empty">Could not load the guide: {error.message}</p>;

  const q = norm(query.trim());
  const hits = q ? data.pages.filter((p) =>
    norm(`${p.title} ${p.lede} ${p.html}`).includes(q)) : [];

  const parent = page?.path?.includes("/") ? page.path.split("/")[0] : "";
  const up = parent ? find(parent) : null;

  return (
    <section className="view">
      <div className="page-head">
        <h1>Student guide</h1>
        <p className="sub">
          {data ? <>A mirror of the student wiki at{" "}
            <a href={data.source} target="_blank" rel="noreferrer">iiest-town.github.io</a>,{" "}
            {data.pages.length} pages.</> : ""}
        </p>
      </div>
      <div className="controls">
        <input type="search" className="input wide" placeholder="Search the guide"
               value={query} onChange={(e) => setQuery(e.target.value)}
               autoComplete="off" spellCheck="false" />
      </div>

      <div className="guide-body" ref={body}>
        {!data ? null : q ? (
          <article className="prose">
            <h1>Search</h1>
            <p className="lede">{count(hits.length, "page", "pages")} matching "{query.trim()}".</p>
            <ul>
              {hits.length ? hits.map((p) => (
                <li key={p.path}>
                  <a data-wiki={p.path} href={p.url}>{p.title}</a>
                  {p.lede ? <span className="dim"> {p.lede}</span> : null}
                </li>
              )) : <li>Nothing found.</li>}
            </ul>
          </article>
        ) : (
          <>
            {page?.path ? (
              <nav className="wiki-crumbs">
                <button className="wiki-crumb" data-wiki="">Wiki</button>
                {up ? (
                  <>
                    <span className="sep">/</span>
                    <button className="wiki-crumb" data-wiki={parent}>{up.title}</button>
                  </>
                ) : null}
              </nav>
            ) : null}
            <article className="prose">
              <h1>{page?.title}</h1>
              {page?.lede ? <p className="lede">{page.lede}</p> : null}
              {page?.html
                ? <div dangerouslySetInnerHTML={{ __html: page.html }} />
                : <p className="dim">This page is still empty on the wiki.</p>}
              <p className="wiki-source">
                <a href={page?.url || data.source} target="_blank" rel="noreferrer">
                  View source page
                </a>
              </p>
            </article>
          </>
        )}
      </div>
    </section>
  );
}
