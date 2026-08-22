from __future__ import annotations

import hashlib
import html
import html as html_module
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone  # noqa: F401
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data"
CACHE = ROOT / ".cache"

SITE = "https://www.iiests.ac.in"
UA = "iiest-portal-scraper/2.0"

FACULTY_TYPES = ["faculty", "staff", "officer"]
PROFILE_TYPES = {"faculty", "staff"}

NOTICE_TYPE = "notifications"
NOTICE_SUB_TYPES = ["Student"]
NOTICE_PAGE_SIZE = 50

FEES_SLUG = "feesstruc"
FEE_PDF_HINT = re.compile(r"fees?[-_]structure[-_]for", re.I)


def log(msg: str) -> None:
    print(msg, flush=True)


def encode_url(url: str) -> str:
    return urllib.parse.quote(url, safe=":/?#[]@!$&'()*+,;=%~")


def get(url: str, retries: int = 3) -> bytes:
    req = urllib.request.Request(encode_url(url), headers={"User-Agent": UA, "Accept": "*/*"})
    last = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except Exception as exc:
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"GET failed: {url} ({last})")


def get_json(url: str) -> dict:
    return json.loads(get(url).decode("utf-8"))


def fetch_pdf(url: str) -> Path:
    CACHE.mkdir(exist_ok=True)
    path = CACHE / (hashlib.sha1(url.encode()).hexdigest()[:16] + ".pdf")
    if not path.exists():
        path.write_bytes(get(url))
    return path


def write(name: str, payload) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"  wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.0f} KB)")


def clean(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def strip_tags(fragment: str) -> str:
    return clean(re.sub(r"<[^>]+>", " ", fragment))


ANCHOR = re.compile(r"<a[^>]*href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", re.S | re.I)
HEADING = re.compile(r"<h([1-6])[^>]*>(.*?)</h\1>", re.S | re.I)
BLOCK_END = re.compile(r"</(p|div|li|tr|h[1-6]|td)>", re.I)


def raw_url(url: str | None) -> str:
    if not url:
        return ""
    return html.unescape(url).strip()


def storage_url(url: str) -> str:
    return encode_url(re.sub(r"/storage/(?=uploads/)", "/", raw_url(url)))


def profile_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower().replace(" ", ""))


def scrape_faculty() -> dict:
    log("faculty")
    people, departments, designations = [], {}, set()

    for kind in FACULTY_TYPES:
        rows = get_json(f"{SITE}/api/faculties?locale=en&type={kind}").get("data") or []
        log(f"  {kind}: {len(rows)}")
        for row in rows:
            dept = clean((row.get("department") or {}).get("en"))
            desig = clean((row.get("designation") or {}).get("en"))
            name = clean((row.get("name") or {}).get("en"))
            if dept:
                departments[dept] = departments.get(dept, 0) + 1
            if desig:
                designations.add(desig)
            profile = ""
            if kind in PROFILE_TYPES and name and row.get("id"):
                profile = f"{SITE}/en/faculty/{profile_slug(name)}-{row['id']}"
            people.append({
                "id": row.get("id"),
                "name": name,
                "kind": row.get("type") or kind,
                "department": dept,
                "designation": desig,
                "role": clean(row.get("administrative_role")),
                "email": clean(row.get("official_email")),
                "email_alt": clean(row.get("alternate_email")),
                "phone": clean(row.get("mobile")),
                "voip": clean(row.get("voip")),
                "photo": row.get("photo") or "",
                "scholar": row.get("google_scholar_url") or "",
                "profile": profile,
                "bio": clean((row.get("bio") or {}).get("en")),
            })

    people.sort(key=lambda p: (p["department"], p["name"]))
    return {
        "people": people,
        "departments": sorted(departments),
        "designations": sorted(designations),
        "counts": {k: sum(1 for p in people if p["kind"] == k) for k in FACULTY_TYPES},
    }


def notice_files(row: dict) -> list[dict]:
    files = []
    for f in row.get("all_files") or []:
        if f.get("url"):
            files.append({"name": clean(f.get("name")) or "Attachment", "url": storage_url(f["url"])})
    if not files and row.get("file"):
        files.append({"name": "Document", "url": storage_url(str(row["file"]))})
    return files


def scrape_notices() -> dict:
    log("notices")
    records, years, seen = [], {}, set()

    for sub_type in NOTICE_SUB_TYPES:
        page = 1
        while True:
            data = get_json(
                f"{SITE}/api/backend/announcements_all?page={page}&limit={NOTICE_PAGE_SIZE}"
                f"&type={NOTICE_TYPE}&sub_type={urllib.parse.quote(sub_type)}&locale=en"
            )
            for row in data.get("records") or []:
                if row.get("id") in seen:
                    continue
                seen.add(row.get("id"))
                date = clean(row.get("display_date")) or clean(row.get("published_at"))[:10]
                if date[:4].isdigit():
                    years[date[:4]] = years.get(date[:4], 0) + 1
                records.append({
                    "id": row.get("id"),
                    "title": clean(row.get("title_en")) or clean(row.get("title_hi")),
                    "category": clean(row.get("sub_type")) or sub_type,
                    "date": date,
                    "body": strip_tags(row.get("description_en") or ""),
                    "link": clean(row.get("main_link") or row.get("external_url") or ""),
                    "files": notice_files(row),
                })
            last = int((data.get("pagination") or {}).get("last_page") or 1)
            log(f"  {sub_type} page {page}/{last}, {len(records)} records")
            if page >= last:
                break
            page += 1

    records.sort(key=lambda r: r["date"], reverse=True)
    return {
        "records": records,
        "years": [y for y, _ in sorted(years.items(), reverse=True)],
        "categories": NOTICE_SUB_TYPES,
    }


PROGRAMME_H3 = re.compile(r"^(Bachelor|Master|Doctor)\b", re.I)


def section_links(chunk: str) -> list[dict]:
    links: list[dict] = []
    for href, label in ANCHOR.findall(chunk):
        href = raw_url(href)
        title = strip_tags(label)
        if not href or href.startswith(("#", "javascript:")):
            continue
        if links and links[-1]["url"] == href:
            links[-1]["title"] = clean(links[-1]["title"] + " " + title)
            continue
        links.append({
            "title": title or urllib.parse.unquote(href.rsplit("/", 1)[-1]),
            "url": href,
            "kind": "pdf" if ".pdf" in href.lower() else "link",
            "broken": bool(re.match(r"https?://[^/]*%20", href)),
        })
    return links


def section_notes(chunk: str) -> list[str]:
    text = BLOCK_END.sub("\n", ANCHOR.sub(" ", chunk))
    notes = []
    for raw in text.split("\n"):
        line = strip_tags(raw)
        if len(line) < 8 or re.fullmatch(r"[=_\-\s]+", line):
            continue
        notes.append(line)
    return list(dict.fromkeys(notes))


def parse_fee_page(fragment: str) -> list[dict]:
    marks = []
    for m in HEADING.finditer(fragment):
        title = strip_tags(m.group(2))
        if PROGRAMME_H3.match(title):
            marks.append((m.start(), title))

    if not marks:
        return [{
            "programme": "Fees and admission documents",
            "links": section_links(fragment),
            "notes": section_notes(fragment),
        }]

    sections = []
    for i, (start, title) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(fragment)
        chunk = fragment[start:end]
        sections.append({
            "programme": title,
            "links": section_links(chunk),
            "notes": [n for n in section_notes(chunk) if n != title],
        })
    return sections


def fee_tables_from_pdf(path: Path) -> list[dict]:
    blocks: list[dict] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                for raw in table:
                    row = [clean(c) if c else "" for c in raw]
                    if not any(row):
                        continue
                    if re.fullmatch(r"[A-H]", row[0]) and len(row) > 1 and row[1]:
                        blocks.append({
                            "section": row[0],
                            "heading": row[1],
                            "columns": [c for c in row[2:] if c],
                            "rows": [],
                        })
                    elif blocks:
                        blocks[-1]["rows"].append(row)
    return [b for b in blocks if b["rows"]]


def fee_pdf_title(path: Path) -> str:
    with pdfplumber.open(path) as pdf:
        text = pdf.pages[0].extract_text() or ""
    for line in text.splitlines():
        line = clean(line)
        if re.search(r"fee structure", line, re.I):
            return line
    return ""


def scrape_fees() -> dict:
    log("fees")
    page = get_json(f"{SITE}/api/cms/page?slug={FEES_SLUG}&locale=en")["data"]
    sections = parse_fee_page(page.get("sections_en") or "")
    log(f"  {len(sections)} programme sections, {sum(len(s['links']) for s in sections)} links")

    structures, seen_hash = [], set()
    for section in sections:
        for link in section["links"]:
            if link["kind"] != "pdf" or not FEE_PDF_HINT.search(link["url"]):
                continue
            try:
                path = fetch_pdf(link["url"])
            except RuntimeError as exc:
                log(f"  skip {link['url']}: {exc}")
                continue
            digest = hashlib.sha1(path.read_bytes()).hexdigest()
            if digest in seen_hash:
                continue
            seen_hash.add(digest)
            blocks = fee_tables_from_pdf(path)
            if not blocks:
                continue
            structures.append({
                "programme": section["programme"],
                "title": fee_pdf_title(path) or link["title"],
                "source": link["url"],
                "blocks": blocks,
            })
            log(f"  parsed {len(blocks)} fee blocks from {link['url'].rsplit('/', 1)[-1]}")

    return {
        "title": clean(page.get("title_en")) or "Fees Structure",
        "sections": sections,
        "structures": structures,
    }


ACADEMIC_PANEL = re.compile(r"academic\s*program", re.I)
TABLE_ROW = re.compile(r"<tr\b[^>]*>.*?</tr>", re.S | re.I)
LABEL_TAG = re.compile(r"<(h[1-6]|strong|b)\b[^>]*>(.*?)</\1>", re.S | re.I)
NEP_RE = re.compile(r"\bnep\b", re.I)

PROGRAMMES = [
    ("B.Arch", "ug", r"b\.?\s*arch|bachelor of architecture"),
    ("Dual Degree", "ug", r"dual\s*degree|integrated\s+(b\.?\s*tech|m\.?\s*tech)"),
    ("B.Tech", "ug", r"b\.?\s*tech|bachelor of technology|under\s*-?\s*graduate|\bug\b"),
    ("M.Plan", "pg", r"m\.?\s*plan|master of (urban|city)"),
    ("MBA", "pg", r"\bmba\b|master of business"),
    ("M.Sc", "pg", r"m\.?\s*sc|master of science"),
    ("M.Tech", "pg", r"m\.?\s*tech|master of technology"),
    ("Ph.D", "phd", r"ph\.?\s*d|doctor of philosophy|doctoral"),
]
LEVEL_ORDER = {"ug": 0, "pg": 1, "phd": 2, "other": 3}


def classify(text: str) -> tuple[str, str]:
    best = None
    for name, level, pattern in PROGRAMMES:
        m = re.search(pattern, text, re.I)
        if m and (best is None or m.start() < best[0]):
            best = (m.start(), name, level)
    return (best[1], best[2]) if best else ("Other", "other")


def normalise_href(href: str) -> str:
    href = raw_url(href)
    if href.startswith(("http://", "https://")):
        return encode_url(href)
    if href.startswith("/"):
        return encode_url(SITE + href)
    return ""


def parse_programme_docs(fragment: str) -> list[dict]:
    rows = [(m.start(), m.end(), m.group(0)) for m in TABLE_ROW.finditer(fragment)]
    labels = []
    for m in LABEL_TAG.finditer(fragment):
        text = strip_tags(m.group(2))
        if text:
            labels.append((m.start(), text))

    docs, seen = [], set()
    for m in ANCHOR.finditer(fragment):
        url = normalise_href(m.group(1))
        title = strip_tags(m.group(2))
        if not url or ".pdf" not in url.lower():
            continue

        context = ""
        for start, end, row in rows:
            if start <= m.start() < end:
                context = strip_tags(ANCHOR.sub(" ", row))[:180]
                break
        if classify(context)[0] == "Other":
            for pos, text in labels:
                if pos < m.start() and classify(text)[0] != "Other":
                    context = text
        if not context:
            context = next((t for p, t in labels if p < m.start()), "")[:180]

        programme, level = classify(context + " " + title + " " + url)
        key = (url, programme)
        if key in seen:
            continue
        seen.add(key)
        if not title or re.search(r"^[/\\]|\.pdf$", title, re.I):
            title = "Course structure and syllabus"
        docs.append({
            "title": title,
            "url": url,
            "programme": programme,
            "level": level,
            "nep": bool(NEP_RE.search(context + " " + title + " " + url)),
            "broken": bool(re.match(r"https?://[^/]*%20", url)),
            "context": context,
        })

    docs.sort(key=lambda d: (LEVEL_ORDER[d["level"]], not d["nep"], d["programme"], d["title"]))
    return docs


ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"]
SEM_HEAD = re.compile(r"^(" + "|".join(ORDINALS) + r")\s+Semester\b", re.I)
COURSE_CODE = re.compile(r"\b([A-Z]{2,3})\s?(\d{3,4}[A-Z]?)\b")
COURSE_TYPE = re.compile(r"^(BSC|ESC|HSC|HSS|VAC|PC|PE|PSE|OE|MC|DE|P|S)\d*$", re.I)
VALUE_TOKEN = re.compile(r"^(\d{1,4}(?:\.\d+)?|R\*?|R\$|NIL|-{1,2})$", re.I)
SL_TOKEN = re.compile(r"^\d{1,2}\.?$")
SUMMARY_RE = re.compile(r"sub-?total|subtotal|\btotal\b", re.I)
FOOTNOTE = re.compile(r"\s*[*$#]?\s*R\s*[:$]\s*Required.*$", re.I)
NUMERIC_RUN = re.compile(r"\b\d+\s+\d+\s+\d+\b")
NOISE_LINE = re.compile(
    r"^(page\s+\d+|.*\|\s*page\s*$|\d+\s*$|\*?R[:$].*|tiderC|skraM|"
    r"class\s*load.*|sl\.?\s*no.*|s[1il]\.?\s*$|no\.?\s*$|type\s*$|"
    r"course\s*(name|code)?\s*$|code\s*$|credit.*|marks?\s*$|week\s*$|"
    r"[LT]\s+T\s+P\s*$|load/?\s*week\s*$|.*course structure.*|"
    r"indian institute.*|department of.*|contents?\s*$)", re.I)
HEADER_WORDS = {
    "class", "load", "week", "sl", "si", "s1", "no", "no.", "type", "course",
    "name", "code", "credit", "cre", "dit", "marks", "mark", "ma", "rks", "mks",
    "l", "t", "p", "per", "hrs", "hour", "sem", "of", "/", "and",
}
OCR_MAP = str.maketrans({"이": "0", "ㅡ": "0", "Ο": "0", "О": "0", "ο": "0", "о": "0", "ı": "1"})
VALUE_KEYS = ("L", "T", "P", "credit", "load", "marks")
VALUE_LAYOUT = {
    6: ["L", "T", "P", "credit", "load", "marks"],
    5: ["L", "T", "P", "credit", "marks"],
    4: ["L", "T", "P", "credit"],
    3: ["credit", "load", "marks"],
    2: ["credit", "marks"],
    1: ["credit"],
}
UPRIGHT_EPS = 1e-4


def snap_upright(page) -> None:
    for char in page.chars:
        if char.get("upright"):
            continue
        m = char.get("matrix")
        if m and abs(m[1]) < UPRIGHT_EPS and abs(m[2]) < UPRIGHT_EPS and m[0] > 0 and m[3] > 0:
            char["upright"] = True


def fix_ocr(line: str) -> str:
    return line.translate(OCR_MAP)


def is_header_noise(line: str) -> bool:
    words = [w.strip(".:|") for w in re.split(r"[\s/]+", line.lower()) if w.strip(".:|")]
    if not words or len(words) > 12:
        return False
    return sum(1 for w in words if w in HEADER_WORDS) >= max(2, len(words) * 0.6)


def blank_course() -> dict:
    row = {"sl": "", "type": "", "code": "", "course": "", "summary": False}
    row.update({k: "" for k in VALUE_KEYS})
    return row


def split_tail(tokens: list[str]) -> tuple[list[str], list[str]]:
    tail: list[str] = []
    while tokens and len(tail) < 6 and VALUE_TOKEN.match(tokens[-1]):
        tail.insert(0, tokens.pop())
    return tokens, tail


def tokenize_rows(lines: list[str]) -> list[tuple[str, object]]:
    items: list[tuple[str, object]] = []
    for raw in lines:
        line = fix_ocr(re.sub(r"\s+", " ", raw)).strip()
        if not line or NOISE_LINE.match(line) or is_header_noise(line):
            continue

        code = ""
        m = COURSE_CODE.search(line)
        if m:
            code = f"{m.group(1)}{m.group(2)}"
            line = COURSE_CODE.sub(" ", line, count=1)

        head, tail = split_tail(line.split())
        if not tail and not code:
            items.append(("frag", line))
            continue

        row = blank_course()
        row["code"] = code
        if head and SL_TOKEN.match(head[0]):
            row["sl"] = head.pop(0).rstrip(".")
        if head and COURSE_TYPE.match(head[0]):
            row["type"] = head.pop(0).upper()
        row["course"] = " ".join(head).strip()
        if tail:
            keys = VALUE_LAYOUT.get(len(tail), VALUE_LAYOUT[6])
            values = tail[-len(keys):] if len(tail) >= len(keys) else tail
            for key, value in zip(keys, values):
                row[key] = value
        items.append(("row", row))
    return items


def parse_course_rows(lines: list[str]) -> list[dict]:
    items = tokenize_rows(lines)
    rows = [payload for kind, payload in items if kind == "row"]
    if not rows:
        return []

    blocks, current = [], []
    for kind, payload in items:
        if kind == "frag":
            current.append(payload)
        else:
            blocks.append(current)
            current = []
    blocks.append(current)

    for i, row in enumerate(rows):
        before, after = blocks[i], blocks[i + 1]
        nxt = rows[i + 1] if i + 1 < len(rows) else None
        if after and nxt is not None and not nxt["course"]:
            suffix = after[:-1]
            blocks[i + 1] = [after[-1]]
        else:
            suffix = after
            blocks[i + 1] = []
        parts = [p for p in (" ".join(before), row["course"], " ".join(suffix)) if p]
        row["course"] = re.sub(r"\s+", " ", " ".join(parts)).strip()

    for row in rows:
        row["course"] = FOOTNOTE.sub("", row["course"]).strip(" -/|")
        row["summary"] = bool(SUMMARY_RE.search(row["course"]))
        if row["summary"]:
            row["code"] = row["type"] = row["sl"] = ""

    def orphan(row: dict) -> bool:
        return bool(row["code"]) and not row["course"] and not any(row[k] for k in VALUE_KEYS)

    final = []
    for i, row in enumerate(rows):
        if orphan(row):
            nxt = next((r for r in rows[i + 1:] if not orphan(r)), None)
            target = nxt if nxt and not nxt["code"] else (final[-1] if final else None)
            if target and not target["code"]:
                target["code"] = row["code"]
            continue
        if not row["course"] and not any(row[k] for k in VALUE_KEYS):
            continue
        final.append(row)
    return final


def table_lines(page) -> list[str]:
    lines = []
    for table in page.extract_tables():
        for raw in table:
            cells = [" ".join(c.split()) if c else "" for c in raw]
            if any(cells):
                lines.append(" ".join(c for c in cells if c))
    return lines


def structure_pages(pdf, limit: int = 32) -> list[tuple[list[str], list[str]]]:
    pages, started, misses = [], False, 0
    for page in pdf.pages[:limit]:
        snap_upright(page)
        lines = (page.extract_text() or "").splitlines()
        hits = sum(1 for l in lines if NUMERIC_RUN.search(fix_ocr(l)))
        has_sem = any(SEM_HEAD.match(l.strip()) for l in lines)
        if hits >= 3 or (started and has_sem):
            pages.append((lines, table_lines(page)))
            started, misses = True, 0
        elif started:
            misses += 1
            if misses >= 2:
                break
    return pages


def split_semesters(lines: list[str]) -> list[dict]:
    semesters, current, buffer = [], None, []

    def flush():
        if current is not None:
            current["courses"].extend(parse_course_rows(buffer))
        buffer.clear()

    for line in lines:
        stripped = re.sub(r"\s+", " ", line).strip()
        head = SEM_HEAD.match(stripped)
        if head and not re.search(r"total", stripped, re.I):
            flush()
            label = head.group(1).title() + " Semester"
            found = next((s for s in semesters if s["name"] == label), None)
            current = found or {"name": label, "courses": []}
            if found is None:
                semesters.append(current)
            continue
        buffer.append(line)
    flush()
    return [s for s in semesters if s["courses"]]


def course_credit(row: dict) -> float | None:
    m = re.match(r"^(\d+(?:\.\d+)?)$", row["credit"])
    if m and float(m.group(1)) <= 12:
        return float(m.group(1))
    return None


def summarise_semester(sem: dict) -> dict:
    total = sum(c for c in (course_credit(r) for r in sem["courses"] if not r["summary"]) if c)
    printed = None
    for row in sem["courses"]:
        if row["summary"] and re.search(r"semester\s+total", row["course"], re.I):
            m = re.match(r"^(\d+)$", row["credit"])
            if m:
                printed = int(m.group(1))
    sem["credits"] = int(total) if total == int(total) else round(total, 1)
    sem["printed_credits"] = printed
    return sem


def semester_score(sem: dict) -> int:
    real = [r for r in sem["courses"] if not r["summary"]]
    named = sum(1 for r in real if len(r["course"]) > 3)
    valued = sum(1 for r in real if course_credit(r) is not None)
    exact = 40 if sem["printed_credits"] == sem["credits"] else 0
    return exact + valued * 2 + named


def parse_structure(path: Path) -> list[dict]:
    with pdfplumber.open(path) as pdf:
        pages = structure_pages(pdf)

    candidates = split_semesters([l for lines, _ in pages for l in lines])
    candidates += split_semesters([l for _, tl in pages for l in tl])
    for sem in candidates:
        summarise_semester(sem)

    best: dict[str, dict] = {}
    for sem in candidates:
        if sem["name"] not in best or semester_score(sem) > semester_score(best[sem["name"]]):
            best[sem["name"]] = sem

    return [best[o + " Semester"] for o in ORDINALS if o + " Semester" in best]


def usable_structure(semesters: list[dict]) -> bool:
    full = [s for s in semesters if s["credits"] >= 18]
    return len(semesters) >= 4 and len(full) >= 4


def academic_menu_id(payload: dict) -> int | None:
    for menu in payload.get("left_menus") or []:
        if ACADEMIC_PANEL.search((menu.get("text") or {}).get("en", "")):
            return menu.get("id")
    return None


def scrape_syllabus() -> dict:
    log("syllabus")
    menus = get_json(f"{SITE}/api/backend/menus?locale=en")["data"]

    def find(nodes, want):
        for node in nodes:
            if clean(node.get("title")).lower() == want:
                return node
            hit = find(node.get("children") or [], want)
            if hit:
                return hit
        return None

    academic = find(menus, "academic") or {}
    targets = []
    for group in academic.get("children") or []:
        if clean(group.get("title")) not in ("Departments", "Schools", "Centers"):
            continue
        for child in group.get("children") or []:
            url = clean(child.get("url"))
            if url.startswith("content/"):
                targets.append({"group": clean(group["title"]), "name": clean(child["title"]), "slug": url})

    departments = []
    for target in targets:
        base = f"{SITE}/api/backend/{target['slug']}"
        payload = None
        for probe in (2, 1):
            try:
                payload = get_json(f"{base}?leftMenu={probe}&locale=en")
                break
            except RuntimeError:
                continue
        if payload is None:
            log(f"  {target['name']}: unreachable")
            continue

        menu_id = academic_menu_id(payload)
        if menu_id is None:
            log(f"  {target['name']}: no academic programs panel")
            continue
        if menu_id != (payload.get("page") or {}).get("left_menu_id"):
            payload = get_json(f"{base}?leftMenu={menu_id}&locale=en")

        page = payload.get("page") or {}
        fragment = ((page.get("sections") or {}).get("en")) or ""
        docs = parse_programme_docs(fragment)
        if not docs:
            log(f"  {target['name']}: no documents")
            continue

        structures = []
        for doc in docs:
            if not (doc["nep"] and doc["level"] == "ug" and doc["programme"] == "B.Tech"):
                continue
            if doc["broken"]:
                continue
            try:
                path = fetch_pdf(doc["url"])
                semesters = parse_structure(path)
            except Exception as exc:
                log(f"  {target['name']}: cannot parse {doc['url'].rsplit('/', 1)[-1]} ({exc})")
                continue
            if not usable_structure(semesters):
                log(f"  {target['name']}: {doc['url'].rsplit('/', 1)[-1]} is not a full structure")
                continue
            mismatch = [s["name"] for s in semesters
                        if s["printed_credits"] not in (None, s["credits"])]
            structures.append({
                "title": doc["title"],
                "source": doc["url"],
                "semesters": semesters,
                "mismatch": mismatch,
            })
            doc["parsed"] = True
            log(f"  {target['name']}: parsed {len(semesters)} semesters, "
                f"{sum(len(s['courses']) for s in semesters)} rows")

        departments.append({
            "name": target["name"],
            "group": target["group"],
            "slug": target["slug"],
            "page": f"{SITE}/en/{target['slug']}",
            "docs": docs,
            "structures": structures,
        })
        nep = sum(1 for d in docs if d["nep"])
        log(f"  {target['name']}: {len(docs)} documents, {nep} NEP")

    departments.sort(key=lambda d: (d["group"] != "Departments", d["name"]))
    return {
        "departments": departments,
        "levels": [
            {"key": "ug", "label": "Bachelors"},
            {"key": "pg", "label": "Masters"},
            {"key": "phd", "label": "Doctoral"},
        ],
    }


TIMETABLE_DIR = ROOT / "public" / "data" / "timetables"
DEPT_CODES = {
    "CSB": "Computer Science and Technology",
    "ITB": "Information Technology",
    "EEB": "Electrical Engineering",
    "ETB": "Electronics and Telecommunication Engineering",
    "MEB": "Mechanical Engineering",
    "CEB": "Civil Engineering",
    "MMB": "Metallurgy and Materials Engineering",
    "MNB": "Mining Engineering",
    "AEB": "Aerospace Engineering and Applied Mechanics",
    "MCB": "Mathematics and Computing",
    "PHB": "Physics",
    "CHB": "Chemistry",
    "ESB": "Earth Sciences",
    "APB": "Architecture and Planning",
}
ICS_CODE = re.compile(r"^\s*([A-Z]{2,4}\s?\d{3,4}[A-Z]?)\b")
ICS_FIELD = re.compile(r"^\s*(PROF|CODE|TYPE|TEACHER)\s*:\s*(.+)$", re.I)
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def unfold_ics(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return lines


def ics_unescape(value: str) -> str:
    return (value.replace("\\n", "\n").replace("\\N", "\n")
            .replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\"))


def parse_ics(text: str) -> list[dict]:
    events, current = [], None
    for line in unfold_ics(text):
        stripped = line.strip()
        if stripped == "BEGIN:VEVENT":
            current = {}
            continue
        if stripped == "END:VEVENT":
            if current:
                events.append(current)
            current = None
            continue
        if current is None or ":" not in line:
            continue
        name, value = line.split(":", 1)
        current[name.split(";")[0].strip().upper()] = ics_unescape(value.strip())
    return events


def ics_datetime(value: str) -> tuple[str, str]:
    m = re.match(r"(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?", value or "")
    if not m:
        return "", ""
    date = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    time = f"{m.group(4)}:{m.group(5)}" if m.group(4) else ""
    return date, time


def event_fields(description: str) -> dict[str, list[str]]:
    fields: dict[str, list[str]] = {}
    for line in (description or "").split("\n"):
        m = ICS_FIELD.match(line)
        if not m:
            continue
        key = m.group(1).upper()
        key = "PROF" if key == "TEACHER" else key
        values = [v.strip() for v in re.split(r"[;,]", m.group(2)) if v.strip()]
        fields.setdefault(key, []).extend(values)
    return fields


def slot_kind(title: str, declared: str) -> str:
    if declared:
        return declared.title()
    if re.search(r"\blab\b|laboratory|practice|sessional", title, re.I):
        return "Lab"
    if re.search(r"project", title, re.I):
        return "Project"
    if re.search(r"tutorial", title, re.I):
        return "Tutorial"
    return "Lecture"


def load_codes() -> dict:
    path = OUT / "faculty-codes.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_profs(raw: list[str], rules: dict, hide_scholars: bool) -> list[str]:
    names = rules.get("names", {})
    hidden = set(rules.get("hide", []))
    out = []
    for code in raw:
        if code in hidden:
            continue
        if hide_scholars and code.startswith("#"):
            continue
        out.append(names.get(code, code))
    return out


def parse_timetable(path: Path, rules: dict | None = None,
                    hide_scholars: bool = False) -> dict:
    rules = rules or {}
    events = parse_ics(path.read_text(encoding="utf-8"))
    slots = []
    for ev in events:
        summary = clean(ev.get("SUMMARY"))
        if not summary:
            continue
        fields = event_fields(ev.get("DESCRIPTION", ""))
        code = ""
        m = ICS_CODE.match(summary)
        if m:
            code = m.group(1).replace(" ", "")
            summary = summary[m.end():].strip(" -:")
        elif fields.get("CODE"):
            code = fields["CODE"][0].replace(" ", "")

        start_date, start_time = ics_datetime(ev.get("DTSTART", ""))
        _, end_time = ics_datetime(ev.get("DTEND", ""))
        if not start_date:
            continue
        until = ""
        rrule = ev.get("RRULE", "")
        weekly = "FREQ=WEEKLY" in rrule.upper()
        m = re.search(r"UNTIL=(\d{8})", rrule)
        if m:
            until = f"{m.group(1)[:4]}-{m.group(1)[4:6]}-{m.group(1)[6:]}"

        year, month, day = (int(x) for x in start_date.split("-"))
        weekday = datetime(year, month, day, tzinfo=timezone.utc).weekday()

        slots.append({
            "code": code,
            "title": summary,
            "profs": resolve_profs(fields.get("PROF", []), rules, hide_scholars),
            "kind": slot_kind(summary, (fields.get("TYPE") or [""])[0]),
            "room": clean(ev.get("LOCATION")),
            "day": weekday,
            "day_name": DAYS[weekday],
            "start": start_time,
            "end": end_time,
            "from": start_date,
            "until": until or start_date,
            "weekly": weekly,
        })

    slots.sort(key=lambda s: (s["day"], s["start"]))
    courses: dict[str, dict] = {}
    for slot in slots:
        key = slot["code"] or slot["title"]
        course = courses.setdefault(key, {
            "code": slot["code"], "title": slot["title"], "profs": [], "kinds": [],
        })
        for prof in slot["profs"]:
            if prof not in course["profs"]:
                course["profs"].append(prof)
        if slot["kind"] not in course["kinds"]:
            course["kinds"].append(slot["kind"])

    return {"slots": slots, "courses": sorted(courses.values(), key=lambda c: c["code"] or c["title"])}


def scrape_timetables() -> dict:
    log("timetables")
    all_codes = load_codes()
    found: dict[tuple, list] = {}

    for path in sorted(TIMETABLE_DIR.glob("*.ics")):
        m = re.match(r"^([A-Z]{3})-(\d{4})(?:-([A-Z0-9]+))?(?:@(\d{4}-\d{2}-\d{2}))?$",
                     path.stem, re.I)
        if not m:
            log(f"  skip {path.name}: expected <DEPT>-<YEAR>[-<GROUP>][@<YYYY-MM-DD>].ics")
            continue
        dept, year = m.group(1).upper(), int(m.group(2))
        group = (m.group(3) or "").upper()
        effective = m.group(4) or ""
        parsed = parse_timetable(path, all_codes.get(dept, {}),
                                 bool(all_codes.get("hide_scholars")))
        found.setdefault((dept, year, group), []).append({
            "from": effective,
            "file": f"data/timetables/{path.name}",
            "slots": parsed["slots"],
            "courses": parsed["courses"],
        })
        tag = f" group {group}" if group else ""
        when = f" from {effective}" if effective else ""
        log(f"  {path.stem}: {len(parsed['slots'])} slots, "
            f"{len(parsed['courses'])} courses{tag}{when}")

    tables = []
    for (dept, year, group), versions in sorted(found.items()):
        versions.sort(key=lambda v: v["from"])
        for i, v in enumerate(versions):
            v["until"] = versions[i + 1]["from"] if i + 1 < len(versions) else ""

        courses: dict[str, dict] = {}
        for v in versions:
            for c in v["courses"]:
                key = c["code"] or c["title"]
                seen = courses.setdefault(key, {**c, "profs": list(c["profs"])})
                for p in c["profs"]:
                    if p not in seen["profs"]:
                        seen["profs"].append(p)

        key = f"{dept}-{year}" + (f"-{group}" if group else "")
        tables.append({
            "key": key,
            "dept": dept,
            "department": DEPT_CODES.get(dept, dept),
            "year": year,
            "group": group,
            "batch": f"{dept}-{year}",
            "versions": versions,
            "slots": versions[-1]["slots"],
            "courses": sorted(courses.values(), key=lambda c: c["code"] or c["title"]),
        })
        if len(versions) > 1:
            spans = ", ".join(f"{v['from'] or 'start'} to {v['until'] or 'end'}"
                              for v in versions)
            log(f"  {key}: {len(versions)} versions ({spans})")

    return {"departments": DEPT_CODES, "timetables": tables}


TITLES = re.compile(r"^(prof|dr|mr|mrs|ms|shri|smt|sri)\.?\s+", re.I)


def name_key(name: str) -> str:
    name = TITLES.sub("", clean(name).lower())
    return re.sub(r"[^a-z ]", "", name).strip()


def short_key(name: str) -> str:
    parts = name_key(name).split()
    return f"{parts[0]} {parts[-1]}" if len(parts) > 1 else " ".join(parts)


def link_faculty_courses() -> dict:
    log("faculty courses")
    faculty = json.loads((OUT / "faculty.json").read_text(encoding="utf-8"))
    timetables = json.loads((OUT / "timetables.json").read_text(encoding="utf-8"))

    exact: dict[str, list[dict]] = {}
    loose: dict[str, list[dict]] = {}
    for person in faculty["people"]:
        exact.setdefault(name_key(person["name"]), []).append(person)
        loose.setdefault(short_key(person["name"]), []).append(person)
    for person in faculty["people"]:
        person["courses"] = []

    unmatched: dict[str, int] = {}
    for table in timetables["timetables"]:
        for course in table["courses"]:
            for prof in course["profs"]:
                people = exact.get(name_key(prof)) or loose.get(short_key(prof)) or []
                if len(people) > 1:
                    same_dept = [p for p in people if p["department"] == table["department"]]
                    teaching = [p for p in people if p["kind"] == "faculty"]
                    people = same_dept or teaching or people
                if len(people) != 1:
                    unmatched[prof] = unmatched.get(prof, 0) + 1
                    continue
                entry = {
                    "code": course["code"],
                    "title": course["title"],
                    "kinds": course["kinds"],
                    "dept": table["dept"],
                    "year": table["year"],
                }
                if entry not in people[0]["courses"]:
                    people[0]["courses"].append(entry)

    taught = sum(1 for p in faculty["people"] if p["courses"])
    log(f"  linked {taught} people to courses, {len(unmatched)} names unmatched")
    for name in sorted(unmatched):
        log(f"  unmatched: {name}")

    faculty["unmatched_professors"] = sorted(unmatched)
    return faculty


WIKI = "https://iiest-town.github.io"
ARTICLE = re.compile(r'<article class="prose">(.*?)</article>', re.S | re.I)
HEADING_LINK = re.compile(r'<a class="heading-link"[^>]*>(.*?)</a>', re.S | re.I)
LEDE = re.compile(r'<p class="lede">(.*?)</p>', re.S | re.I)
H1 = re.compile(r"<h1[^>]*>(.*?)</h1>", re.S | re.I)
ALLOWED = re.compile(
    r"</?(?:h[2-6]|p|ul|ol|li|strong|em|b|i|code|pre|blockquote|br|hr|"
    r"table|thead|tbody|tr|th|td|a)(?:\s[^>]*)?>", re.I)
HREF = re.compile(r'<a\s[^>]*href="([^"]*)"[^>]*>', re.I)
WIKI_SECTIONS = {
    "campus": "Campus",
    "departments": "Departments",
    "hostels": "Hostels",
    "misc": "Student life",
    "gallery": "Gallery",
    "about": "About",
    "contribute": "Contribute",
}


def sanitize_wiki(html: str) -> str:
    html = HEADING_LINK.sub(lambda m: m.group(1), html)
    html = H1.sub("", html, count=1)
    html = LEDE.sub("", html, count=1)
    html = re.sub(r"<(script|style)\b.*?</\1>", "", html, flags=re.S | re.I)

    def keep(m: re.Match) -> str:
        tag = m.group(0)
        if tag.lower().startswith("<a"):
            href = HREF.match(tag)
            url = href.group(1) if href else ""
            if url.startswith("#"):
                return ""
            if url.startswith("/"):
                path = url.strip("/")
                full = html_module.escape(f"{WIKI}/{path}/" if path else WIKI, quote=True)
                return f'<a data-wiki="{html_module.escape(path, quote=True)}" href="{full}">'
            if not url.startswith(("http://", "https://", "mailto:", "tel:")):
                return ""
            return f'<a href="{html_module.escape(url, quote=True)}" target="_blank" rel="noreferrer noopener">'
        return tag

    out = []
    pos = 0
    for m in re.finditer(r"<[^>]+>", html):
        out.append(html[pos:m.start()])
        if ALLOWED.fullmatch(m.group(0)):
            out.append(keep(m))
        pos = m.end()
    out.append(html[pos:])
    text = "".join(out)
    text = re.sub(r"<p>\s*#+\s*</p>", "", text)
    text = re.sub(r"<p>\s*[-*]?\s*</p>", "", text)
    text = re.sub(r"<li>\s*</li>", "", text)
    text = re.sub(r"(<(?:ul|ol)>)\s*(</(?:ul|ol)>)", "", text)
    return re.sub(r"\n{2,}", "\n", text).strip()


def scrape_wiki() -> dict:
    log("guide")
    sitemap = get(f"{WIKI}/sitemap.xml").decode("utf-8")
    urls = re.findall(r"<loc>([^<]+)</loc>", sitemap)
    pages = []

    for url in urls:
        path = url[len(WIKI):].strip("/")
        if path in ("search", ""):
            continue
        try:
            body = get(url).decode("utf-8")
        except RuntimeError as exc:
            log(f"  skip {path}: {exc}")
            continue
        m = ARTICLE.search(body)
        if not m:
            log(f"  {path}: no article")
            continue
        raw = m.group(1)
        title = strip_tags((H1.search(raw) or [None, ""])[1]) if H1.search(raw) else ""
        lede = strip_tags((LEDE.search(raw) or [None, ""])[1]) if LEDE.search(raw) else ""
        content = sanitize_wiki(raw)
        section = path.split("/")[0]
        pages.append({
            "title": title or path.replace("-", " ").title(),
            "lede": lede,
            "section": section,
            "group": WIKI_SECTIONS.get(section, "Other"),
            "path": path,
            "url": url,
            "html": content,
            "words": len(strip_tags(content).split()),
        })
        log(f"  {path}: {len(content)} chars, {pages[-1]['words']} words")

    order = list(WIKI_SECTIONS)
    pages.sort(key=lambda p: (order.index(p["section"]) if p["section"] in order else 99,
                              p["path"].count("/"), p["title"]))

    home = get(f"{WIKI}/").decode("utf-8")
    m = ARTICLE.search(home)
    index = {
        "title": strip_tags(H1.search(m.group(1)).group(1)) if m and H1.search(m.group(1)) else "IIEST Student Wiki",
        "lede": strip_tags(LEDE.search(m.group(1)).group(1)) if m and LEDE.search(m.group(1)) else "",
        "html": sanitize_wiki(m.group(1)) if m else "",
        "path": "",
    }
    log(f"  index: {len(index['html'])} chars")
    log(f"  {len(pages)} pages")
    return {"source": WIKI, "index": index, "pages": pages}


TASKS = {
    "faculty": ("faculty.json", scrape_faculty),
    "notices": ("notices.json", scrape_notices),
    "fees": ("fees.json", scrape_fees),
    "syllabus": ("syllabus.json", scrape_syllabus),
    "timetables": ("timetables.json", scrape_timetables),
    "courses": ("faculty.json", link_faculty_courses),
    "guide": ("guide.json", scrape_wiki),
}


def main(argv: list[str]) -> int:
    wanted = argv[1:] or list(TASKS)
    unknown = [w for w in wanted if w not in TASKS]
    if unknown:
        print(f"unknown section(s): {', '.join(unknown)}", file=sys.stderr)
        print(f"available: {', '.join(TASKS)}", file=sys.stderr)
        return 2

    meta_path = OUT / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    meta["sections"] = {k: v for k, v in (meta.get("sections") or {}).items() if k in TASKS}

    for name in wanted:
        filename, fn = TASKS[name]
        write(filename, fn())
        meta["sections"][name] = datetime.now(timezone.utc).isoformat(timespec="seconds")

    meta["updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    write("meta.json", meta)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
