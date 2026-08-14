import { $, esc, norm, debounce, fmtDate, count, highlight } from "./util.js";
import { configured } from "./config.js";
import { init, onChange, signIn, signOut, user, authError } from "./auth.js";
import { showAttendance } from "./attendance.js";

const VIEWS = ["overview", "weekly", "courses", "faculty", "notices",
               "syllabus", "fees", "guide"];
const ATTENDANCE_VIEWS = ["overview", "weekly", "courses"];
const HOME = "overview";
const cache = new Map();

async function load(name) {
  if (!cache.has(name)) {
    cache.set(name, fetch(`data/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`${name}.json returned ${r.status}`);
      return r.json();
    }));
  }
  return cache.get(name);
}

function fail(err) {
  const box = $("#load-error");
  box.hidden = false;
  box.textContent = `Could not load data: ${err.message}. Run the scraper, then reload.`;
}

const facultyView = (() => {
  let people = [];
  let ready = false;

  function render() {
    const q = norm($("#faculty-q").value.trim());
    const dept = $("#faculty-dept").value;
    const kind = $("#faculty-kind").value;

    const rows = people.filter((p) =>
      (!kind || p.kind === kind) &&
      (!dept || p.department === dept) &&
      (!q || p._hay.includes(q)));

    $("#faculty-count").textContent = count(rows.length, "person", "people") +
      (dept ? `, ${dept}` : "");
    $("#faculty-empty").hidden = rows.length > 0;

    $("#faculty-list").innerHTML = rows.map((p) => {
      const photo = p.photo
        ? `<img class="avatar" loading="lazy" alt="" src="${esc(p.photo)}" onerror="this.remove()">`
        : "";
      const links = [];
      if (p.email) links.push(`<a class="chip" href="mailto:${esc(p.email)}">${esc(p.email)}</a>`);
      if (p.phone) links.push(`<a class="chip" href="tel:${esc(p.phone.replace(/\s/g, ""))}">${esc(p.phone)}</a>`);
      if (p.profile) links.push(`<a class="chip" href="${esc(p.profile)}" target="_blank" rel="noreferrer noopener">Profile</a>`);
      if (p.scholar) links.push(`<a class="chip" href="${esc(p.scholar)}" target="_blank" rel="noreferrer noopener">Scholar</a>`);
      if (p.role) links.push(`<span class="chip tag">${esc(p.role)}</span>`);

      const courses = (p.courses || []).map((c) =>
        `<span class="chip course">${esc(c.code)} ${esc(c.title)}</span>`).join("");

      return `<article class="card">
        <div class="card-top">${photo}
          <div class="card-body">
            <div class="card-name">${esc(p.name)}</div>
            <div class="card-role">${esc(p.designation)}</div>
            ${p.department ? `<div class="card-dept">${esc(p.department)}</div>` : ""}
          </div>
        </div>
        ${links.length ? `<div class="card-links">${links.join("")}</div>` : ""}
        ${courses ? `<div class="card-courses"><span class="course-label">Teaches</span>${courses}</div>` : ""}
      </article>`;
    }).join("");
  }

  return async function show() {
    if (!ready) {
      const data = await load("faculty");
      people = data.people.map((p) => ({
        ...p,
        _hay: norm([p.name, p.department, p.designation, p.role, p.email,
                    ...(p.courses || []).map((c) => `${c.code} ${c.title}`)].join(" ")),
      }));
      $("#faculty-dept").insertAdjacentHTML("beforeend",
        data.departments.map((d) => `<option>${esc(d)}</option>`).join(""));
      $("#faculty-q").addEventListener("input", debounce(render));
      $("#faculty-dept").addEventListener("change", render);
      $("#faculty-kind").addEventListener("change", render);
      ready = true;
    }
    render();
  };
})();

const noticesView = (() => {
  const PAGE = 60;
  let records = [];
  let shown = PAGE;
  let ready = false;

  function render() {
    const raw = $("#notices-q").value.trim();
    const q = norm(raw);
    const year = $("#notices-year").value;

    const rows = records.filter((n) =>
      (!year || n.date.startsWith(year)) && (!q || n._hay.includes(q)));
    const slice = rows.slice(0, shown);

    $("#notices-count").textContent =
      `${count(rows.length, "notice", "notices")}, showing ${slice.length}`;
    $("#notices-empty").hidden = rows.length > 0;
    $("#notices-more").hidden = rows.length <= shown;

    $("#notices-list").innerHTML = slice.map((n) => {
      const files = n.files.map((f) =>
        `<a class="chip" href="${esc(f.url)}" target="_blank" rel="noreferrer noopener">${esc(f.name)}</a>`).join("");
      const link = n.link
        ? `<a class="chip" href="${esc(n.link)}" target="_blank" rel="noreferrer noopener">Link</a>` : "";
      return `<li class="notice">
        <div class="notice-date">${esc(fmtDate(n.date))}</div>
        <div class="notice-main">
          <div class="notice-title">${highlight(n.title, raw)}</div>
          ${n.body ? `<div class="notice-body">${highlight(n.body.slice(0, 320), raw)}</div>` : ""}
          ${files || link ? `<div class="notice-files">${files}${link}</div>` : ""}
        </div></li>`;
    }).join("");
  }

  const reset = () => { shown = PAGE; render(); };

  return async function show() {
    if (!ready) {
      const data = await load("notices");
      records = data.records.map((n) => ({ ...n, _hay: norm(n.title + " " + n.body) }));
      $("#notices-year").insertAdjacentHTML("beforeend",
        data.years.map((y) => `<option>${esc(y)}</option>`).join(""));
      $("#notices-q").addEventListener("input", debounce(reset));
      $("#notices-year").addEventListener("change", reset);
      $("#notices-more").addEventListener("click", () => { shown += PAGE; render(); });
      ready = true;
    }
    render();
  };
})();

const syllabusView = (() => {
  let data = null;
  let ready = false;
  let showDocs = false;

  const COLS = [
    ["code", "Code", "code"],
    ["type", "Type", "code"],
    ["course", "Course", "name"],
    ["L", "L", "num"], ["T", "T", "num"], ["P", "P", "num"],
    ["credit", "Credit", "num"], ["marks", "Marks", "num"],
  ];

  function semTable(sem) {
    const used = COLS.filter(([key]) => sem.courses.some((c) => c[key]));
    const body = sem.courses.map((c) => {
      const cells = used.map(([key, , cls]) => `<td class="${cls}">${esc(c[key] || "")}</td>`).join("");
      return `<tr class="${c.summary ? "sum" : ""}">${cells}</tr>`;
    }).join("");
    const off = sem.printed_credits != null && sem.printed_credits !== sem.credits;
    return `<div class="block">
      <div class="block-head">
        <h3>${esc(sem.name)}</h3>
        <span class="meta">${sem.credits} credits${off ? `, PDF prints ${sem.printed_credits}` : ""}</span>
      </div>
      <div class="table-scroll"><table>
        <thead><tr>${used.map(([, label, cls]) =>
          `<th class="${cls === "num" ? "num" : ""}">${esc(label)}</th>`).join("")}</tr></thead>
        <tbody>${body}</tbody></table></div></div>`;
  }

  function docRow(doc) {
    const badges = [
      doc.nep ? `<span class="badge nep">NEP</span>` : "",
      `<span class="badge">${esc(doc.programme)}</span>`,
    ].join("");
    return `<li><a class="doc ${doc.broken ? "dead" : ""}"
         href="${esc(doc.url)}" target="_blank" rel="noreferrer noopener">
      <span class="doc-main">
        <span class="doc-title">${esc(doc.title)}</span>
        ${doc.context ? `<span class="doc-ctx">${esc(doc.context)}</span>` : ""}
      </span>
      <span class="doc-tags">${badges}</span>
    </a></li>`;
  }

  function searchTable(q, depts) {
    const hits = [];
    for (const d of depts) {
      for (const st of d.structures) {
        for (const sem of st.semesters) {
          for (const c of sem.courses) {
            if (c.summary) continue;
            if (norm(c.course + " " + c.code).includes(q)) hits.push({ dept: d.name, sem: sem.name, c });
          }
        }
      }
    }
    $("#syllabus-count").textContent = count(hits.length, "course", "courses");
    $("#syllabus-empty").hidden = hits.length > 0;
    if (!hits.length) return "";
    return `<div class="table-scroll"><table>
      <thead><tr><th>Code</th><th>Course</th><th>Department</th><th>Semester</th><th class="num">Credit</th></tr></thead>
      <tbody>${hits.map((h) => `<tr>
        <td class="code">${esc(h.c.code)}</td>
        <td class="name">${esc(h.c.course)}</td>
        <td class="dim">${esc(h.dept)}</td>
        <td class="dim">${esc(h.sem)}</td>
        <td class="num">${esc(h.c.credit)}</td></tr>`).join("")}
      </tbody></table></div>`;
  }

  function render() {
    const q = norm($("#syllabus-q").value.trim());
    const name = $("#syllabus-dept").value;
    const depts = data.departments.filter((d) => !name || d.name === name);

    if (q) {
      $("#syllabus-body").innerHTML = searchTable(q, depts);
      return;
    }

    const withStructure = depts.filter((d) => d.structures.length);
    const courses = withStructure.reduce((a, d) => a + d.structures.reduce(
      (b, s) => b + s.semesters.reduce((c, m) => c + m.courses.filter((x) => !x.summary).length, 0), 0), 0);

    $("#syllabus-count").textContent = showDocs
      ? count(depts.reduce((a, d) => a + d.docs.length, 0), "document", "documents")
      : `${count(courses, "course", "courses")} across ` +
        `${count(withStructure.length, "department", "departments")}, B.Tech NEP structure`;
    $("#syllabus-empty").hidden = showDocs || courses > 0;

    $("#syllabus-body").innerHTML = depts.map((d) => {
      const structures = showDocs ? [] : d.structures;
      if (!structures.length && !showDocs) return "";
      const source = structures[0]?.source;
      const tables = structures.map((s) => `
        <div class="block-head">
          <p class="section-label">${esc(s.title)}</p>
          <a class="meta" href="${esc(s.source)}" target="_blank" rel="noreferrer noopener">open source PDF</a>
        </div>
        <div class="stack">${s.semesters.map(semTable).join("")}</div>`).join("");
      const docs = showDocs ? `<ul class="doc-list">${d.docs.map(docRow).join("")}</ul>` : "";
      return `<section class="dept">
        <div class="dept-head">
          <h2>${esc(d.name)}</h2>
          <span class="head-links">
            ${source ? `<a class="meta strong" href="${esc(source)}" target="_blank" rel="noreferrer noopener">source PDF</a>` : ""}
            <a class="meta" href="${esc(d.page)}" target="_blank" rel="noreferrer noopener">department page</a>
          </span>
        </div>
        ${tables}${docs}
      </section>`;
    }).join("");
  }

  return async function show() {
    if (!ready) {
      data = await load("syllabus");
      $("#syllabus-dept").insertAdjacentHTML("beforeend",
        data.departments.map((d) => `<option>${esc(d.name)}</option>`).join(""));
      $("#syllabus-q").addEventListener("input", debounce(render));
      $("#syllabus-dept").addEventListener("change", render);
      $("#syllabus-docs").addEventListener("click", (e) => {
        showDocs = !showDocs;
        e.currentTarget.setAttribute("aria-pressed", String(showDocs));
        render();
      });
      ready = true;
    }
    render();
  };
})();

const feesView = (() => {
  let data = null;
  let ready = false;

  function feeBlock(block) {
    const width = Math.max(2 + block.columns.length,
      ...block.rows.map((r) => r.filter((c, i) => c || i < 2).length), 3);
    const head = ["", "Particulars", ...block.columns];
    while (head.length < width) head.push("");

    const body = block.rows.map((row) => {
      const filled = row.filter(Boolean).length;
      if (filled === 1 && row[0] && !/^\d/.test(row[0])) {
        return `<tr class="group-row"><td colspan="${width}">${esc(row[0])}</td></tr>`;
      }
      const label = row[1] || "";
      const cells = [`<td class="code">${esc(row[0] || "")}</td>`,
                     `<td class="name">${esc(label)}</td>`];
      for (let i = 2; i < width; i++) cells.push(`<td class="num">${esc(row[i] || "")}</td>`);
      return `<tr class="${/total/i.test(label) ? "sum" : ""}">${cells.join("")}</tr>`;
    }).join("");

    return `<div class="block">
      <div class="block-head"><h3>${esc(block.section)}. ${esc(block.heading)}</h3></div>
      <div class="table-scroll"><table>
        <thead><tr>${head.map((h, i) =>
          `<th class="${i > 1 ? "num" : ""}">${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${body}</tbody></table></div></div>`;
  }

  function render() {
    const section = data.sections[+$("#fees-prog").value];
    const structures = data.structures.filter((s) => s.programme === section.programme);

    $("#fees-sub").textContent = count(section.links.length, "document", "documents") +
      (structures.length ? `, ${count(structures.length, "fee table", "fee tables")}` : "");

    const docs = section.links.map((l) => `<li>
      <a class="doc ${l.broken ? "dead" : ""}" href="${esc(l.url)}"
         target="_blank" rel="noreferrer noopener">
        <span class="doc-main"><span class="doc-title">${esc(l.title)}</span></span>
        <span class="doc-tags"><span class="badge">${l.kind === "pdf" ? "PDF" : "Web"}</span></span>
      </a></li>`).join("");

    const tables = structures.map((s) => `<section>
      <div class="block-head">
        <h2>${esc(s.title)}</h2>
        <a class="meta" href="${esc(s.source)}" target="_blank" rel="noreferrer noopener">source</a>
      </div>
      ${s.blocks.map(feeBlock).join("")}
    </section>`).join("");

    $("#fees-body").innerHTML = `
      ${tables}
      <p class="section-label">Documents</p>
      <ul class="doc-list">${docs || '<li class="dim">Nothing listed.</li>'}</ul>
      ${section.notes.length
        ? `<p class="section-label">Notes</p>
           <ul class="notes-list">${section.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`
        : ""}`;
  }

  return async function show() {
    if (!ready) {
      data = await load("fees");
      $("#fees-prog").innerHTML = data.sections
        .map((s, i) => `<option value="${i}">${esc(s.programme)}</option>`).join("");
      $("#fees-prog").addEventListener("change", render);
      ready = true;
    }
    render();
  };
})();

const guideView = (() => {
  let data = null;
  let ready = false;
  let current = "";

  const find = (path) => (path ? data.pages.find((p) => p.path === path) : data.index);

  function crumbs(p) {
    if (!p.path) return "";
    const parent = p.path.includes("/") ? p.path.split("/")[0] : "";
    const links = [`<button class="wiki-crumb" data-wiki="">Wiki</button>`];
    if (parent) {
      const up = find(parent);
      if (up) links.push(`<button class="wiki-crumb" data-wiki="${esc(parent)}">${esc(up.title)}</button>`);
    }
    return `<nav class="wiki-crumbs">${links.join('<span class="sep">/</span>')}</nav>`;
  }

  function results(q) {
    const hits = data.pages.filter((p) =>
      norm(`${p.title} ${p.lede} ${p.html}`).includes(q));
    return `<article class="prose">
      <h1>Search</h1>
      <p class="lede">${count(hits.length, "page", "pages")} matching "${esc(q)}".</p>
      <ul>${hits.map((p) => `<li><a data-wiki="${esc(p.path)}" href="${esc(p.url)}">${esc(p.title)}</a>
        ${p.lede ? ` <span class="dim">${esc(p.lede)}</span>` : ""}</li>`).join("")
        || "<li>Nothing found.</li>"}</ul>
    </article>`;
  }

  function render() {
    const q = norm($("#guide-q").value.trim());
    const body = $("#guide-body");

    if (q) {
      body.innerHTML = results(q);
    } else {
      const p = find(current) || data.index;
      body.innerHTML = `${crumbs(p)}<article class="prose">
        <h1>${esc(p.title)}</h1>
        ${p.lede ? `<p class="lede">${esc(p.lede)}</p>` : ""}
        ${p.html || '<p class="dim">This page is still empty on the wiki.</p>'}
        <p class="wiki-source">
          <a href="${esc(p.url || data.source)}" target="_blank" rel="noreferrer noopener">View source page</a>
        </p>
      </article>`;
    }

    body.querySelectorAll("[data-wiki]").forEach((el) => {
      el.onclick = (e) => {
        const target = el.dataset.wiki;
        if (target !== "" && !find(target)) return;
        e.preventDefault();
        $("#guide-q").value = "";
        location.hash = target ? `guide/${target}` : "guide";
        window.scrollTo({ top: 0 });
      };
    });
  }

  return async function show(path = "") {
    if (!ready) {
      data = await load("guide");
      $("#guide-sub").innerHTML =
        `A mirror of the student wiki at ` +
        `<a href="${esc(data.source)}" target="_blank" rel="noreferrer noopener">iiest-town.github.io</a>, ` +
        `${data.pages.length} pages.`;
      $("#guide-q").addEventListener("input", debounce(render));
      ready = true;
    }
    current = find(path) ? path : "";
    render();
  };
})();

const SHOW = {
  faculty: facultyView,
  notices: noticesView,
  syllabus: syllabusView,
  fees: feesView,
  guide: guideView,
};

const TITLES = {
  overview: "Daily Overview", weekly: "Weekly Schedule", courses: "Course Attendance",
  faculty: "Faculty", notices: "Notices", syllabus: "Syllabus", fees: "Fees",
  guide: "Student guide",
};

const ICONS = {
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  table: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  bell: '<path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/><path d="M3.3 17h17.4a1 1 0 0 0 .7-1.7L19 13V9a7 7 0 1 0-14 0v4l-2.4 2.3a1 1 0 0 0 .7 1.7"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="M9 13h6M9 17h6"/>',
  rupee: '<path d="M6 3h12M6 8h12M6 13h6a5 5 0 0 0 0-10"/><path d="M6 13l7 8"/>',
  panel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
};

function paintIcons() {
  for (const el of document.querySelectorAll(".ico[data-ico]")) {
    const path = ICONS[el.dataset.ico];
    if (path) {
      el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
    }
  }
}

function renderUserCard(who) {
  const box = $("#user-card");
  if (!configured()) {
    box.innerHTML = `<p class="micro">Sign-in not configured</p>`;
    return;
  }
  if (!who) {
    box.innerHTML = `<button class="btn primary block" id="sign-in">Sign in with Google</button>`;
    $("#sign-in").onclick = signIn;
    return;
  }
  const initial = (who.roll || "?").slice(-2);
  box.innerHTML = `<div class="user-row">
      <span class="avatar-dot">${esc(initial)}</span>
      <span class="user-text">
        <strong>${esc(who.roll)}</strong>
        <span class="micro">${esc(who.email.split("@")[0].split(".").slice(1).join(".") || "student")}</span>
      </span>
    </div>
    <button class="btn danger block" id="sign-out">Log out</button>`;
  $("#sign-out").onclick = async () => {
    await signOut();
    location.hash = HOME;
    location.reload();
  };
}

function closeSide() {
  document.body.classList.remove("side-open");
  $("#scrim").hidden = true;
}

async function route() {
  const hash = (location.hash.slice(1) || "").split("?")[0];
  const [head, ...rest] = hash.split("/");
  const name = VIEWS.includes(head) ? head : HOME;
  const param = rest.join("/");
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== name;
  for (const a of $("#nav").querySelectorAll("a")) {
    if (a.dataset.view === name) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  document.title = `${TITLES[name]} | IIEST Shibpur`;
  closeSide();
  try {
    if (ATTENDANCE_VIEWS.includes(name)) await showAttendance(name);
    else await SHOW[name](param);
  } catch (err) {
    fail(err);
  }
}

window.addEventListener("hashchange", route);

document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) {
    const box = $(`#view-${location.hash.slice(1) || HOME} input[type=search]`);
    if (box) {
      e.preventDefault();
      box.focus();
    }
  }
});

$("#side-toggle").onclick = () => {
  const open = document.body.classList.toggle("side-open");
  $("#scrim").hidden = !open;
};
$("#scrim").onclick = closeSide;

load("meta").then((meta) => {
  const when = new Date(meta.updated);
  if (!Number.isNaN(+when)) {
    $("#footer-meta").textContent = `Updated ${when.toLocaleDateString(undefined,
      { day: "numeric", month: "short", year: "numeric" })}`;
  }
}).catch(() => {});

paintIcons();
init();
onChange(renderUserCard);
if (authError) {
  const box = $("#load-error");
  box.hidden = false;
  box.textContent = `Sign-in failed: ${authError}`;
}
route();
