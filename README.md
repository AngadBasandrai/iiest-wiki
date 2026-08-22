# IIEST Shibpur portal

A fast, dark, static front end over the public IIEST Shibpur data sets, plus
attendance tracking for signed-in students.

| Section | What you get |
| --- | --- |
| Daily Overview | the home page: attendance stat cards, a colour coded month calendar, and a day panel where you mark each class present, absent or cancelled |
| Weekly Schedule | your timetable as a five day grid, with rooms and staff |
| Course Attendance | per course breakdown with present, absent and cancelled counts and a percentage against the 75% line |
| Faculty | 368 people (270 teaching faculty, 85 staff, 13 officers), searchable by name, department, designation and course taught |
| Notices | all 1,144 student notifications, full text search, year filter, direct attachment links |
| Syllabus | the B.Tech NEP course structure parsed out of 7 departments' syllabus PDFs into semester tables, 511 courses, searchable by name or code, plus all 51 programme documents |
| Fees | 74 admission and fee documents grouped by programme, plus the M.Tech, M.Sc and M.Plan fee structures parsed out of their PDFs into tables |
| Student guide | a mirror of the student wiki at iiest-town.github.io, all 27 pages, browsed the same way the original is with in-page links, plus full text search |
| Campus map | sidebar link out to maps.grafitelab.in |

Faculty, notices, syllabus and fees are fully static and need no backend. The three
attendance pages need a database and Google sign-in, both on free tiers. See
[Switching on accounts](#switching-on-accounts).

Your timetable is chosen from your roll number alone. `2025CSB044` loads
`CSB-2025.ics`; there is no picker.

Your semester is derived the same way, from the joining year in the roll and today's
date, on the rule that July onwards is an odd semester and January onwards is even.
`2025CSB044` in August 2026 is semester 3, second year. In January 2026 the same roll
is semester 2. The value is clamped to 1 to 10, so five year B.Arch works too.

That semester then picks which term, exam windows and holidays apply, because first
years and senior years run on different dates. See
[Session, holidays and exams](#session-holidays-and-exams).

## Layout

React on Vite. The Python scraper is untouched by that: it still writes JSON into
`public/data/`, and Vite copies `public/` into the build verbatim.

```
scraper/scrape.py    fetches and parses every source
supabase/schema.sql  tables, row level security and the sign-up trigger
index.html           Vite entry point
src/
  main.jsx           mounts React, runs auth init
  App.jsx            shell, hash router, view switch
  styles.css
  components/        Sidebar, Icon, Gate
  views/             Overview, Weekly, Courses, Faculty, Notices,
                     Syllabus, Fees, Guide
  lib/
    config.js        your Supabase URL and anon key go here
    auth.js          Google sign-in and the REST helper
    useAttendance.js attendance state, marking and the percentage maths
    calendar.js      session, holiday, exam and day state logic
    data.js          JSON fetch and cache hooks
    router.js        hash routing
    util.js
public/              copied into the build as-is
  CNAME              your custom domain
  data/*.json        generated, commit it so the site works without a backend
  data/timetables/   your .ics timetables, one per department and year
  data/schedule.json session start and end dates
  data/holidays.json holidays, single dates or ranges
  data/exams.json    exam windows
  data/groups.json   lab group ranges by roll number
  data/guide.json    generated from the student wiki
dist/                build output, git-ignored
.cache/              downloaded PDFs, reused between runs (git-ignored)
```

Routing is hash based (`#weekly`, `#guide/hostels`). On a static host that means a
refresh or a shared link never 404s, with no rewrite rules to configure.

## Installable app and offline

`vite-plugin-pwa` generates a manifest and a Workbox service worker at build time, so
the site installs to a phone home screen and keeps working without signal.

What is cached, and why it is split that way:

| Content | Strategy | Reason |
| --- | --- | --- |
| App shell, JS, CSS, icons | precache, 266 KB | must be there the moment you open it |
| `data/*.json` | stale while revalidate | 1.3 MB total, too big to force on install, but fine to keep once fetched |
| Google Fonts files | cache first, 1 year | immutable, never worth refetching |
| Faculty photos | cache first, 30 days | hundreds of small images from a slow host |

The data files are deliberately **not** precached. Precaching them would make the first
install download 1.3 MB before the app was usable. Instead each one is cached the first
time a page needs it, then served instantly from cache while a fresh copy is fetched in
the background.

Offline, the shell, faculty, notices, syllabus, fees and the guide all work from cache.

Marking attendance works offline too. A mark is applied locally straight away and queued
in `localStorage` under `iiest.pending`, then flushed when the connection returns or on
the next load. The queue is keyed by course, date and slot, so changing your mind while
offline overwrites the pending entry rather than queueing a second one, and only the
final state is ever sent. There is no pending indicator by design.

A single in-flight guard in `lib/queue.js` stops a mount and an `online` event from
flushing concurrently and sending everything twice.

Two devices marking the same class offline is last write wins, whichever syncs second.

`registerType: "autoUpdate"` plus the toast in `components/UpdateToast.jsx` means a
student on a stale cached copy is told a new version exists rather than silently keeping
old notices forever. Worth keeping given the nightly data refresh.

The service worker is off in `npm run dev` on purpose, since a cache layer in front of
hot reload only produces confusing stale-asset bugs. To exercise it, use
`npm run build && npm run preview`.

Icons in `public/` are generated, not hand drawn. To regenerate them from a different
mark, edit the SVG path and rerun the icon script.

### Clubs

`public/data/clubs.json` drives the Clubs page. Each club has a slug, a description,
meeting time, links and a list of events, and gets its own page at `#club/<slug>`. The
sidebar has a single Clubs entry; the individual clubs are buttons on that page.

Following a club marks it on the Clubs page and nothing else. It is written to
`localStorage` under `iiest.follows` so it works signed out, and mirrored into the
`club_follows` table when signed in, with the two merged on sign-in.

**The three clubs ship with placeholder copy.** Names and slugs are real, everything else
is invented and should be replaced by whoever runs each club. Reges Belli in particular
has a guessed description; do not leave it as is.

### The install page

`public/download/index.html` is a standalone page at `/download/`, reachable from
"Get the app" in the sidebar. It is one button, and what the button does depends on what
the platform allows:

| Platform | Button | Behaviour |
| --- | --- | --- |
| Android, Windows, Chrome on Mac | Install | fires the real browser install prompt |
| iPhone and iPad | Show me how | reveals the three Safari taps |
| Safari on Mac | Show me how | File, then Add to Dock |
| Any browser that never offers a prompt | Show me how | says to use Chrome or Edge |
| Already installed | none | says so and hides the button |

The one click path uses `beforeinstallprompt`, captured in an inline script in `<head>`
because the event fires before any deferred script would run. **iOS cannot ever be one
click.** Apple exposes no install API, so Safari has to be Share, then Add to Home
Screen, and pretending otherwise would just produce a button that does nothing.

For the prompt to be offered at all the page needs its own `manifest` link and a service
worker registration, which is why this page carries both even though it is not part of
the React app.

It is deliberately a real file rather than a route in the React app. The app is hash
routed, so `iiest.wiki/download` would otherwise 404 on GitHub Pages. That also means
the service worker's `navigateFallback` would happily serve the app shell in its place,
which is what `navigateFallbackDenylist: [/^\/download\//]` prevents.

There is no store listing and nothing to download. Installing the PWA gives the same
result on all four platforms: an icon, its own window, offline access and a route to
notifications, at about 300 KB and self updating.

## Running it locally

```sh
npm install
npm run dev
```

Then open <http://localhost:8765>, with hot reload.

To check exactly what gets deployed:

```sh
npm run build     # writes dist/
npm run preview
```

`npm run build` is what CI runs too, so if it passes locally the deploy will pass.

## Refreshing the data

```sh
pip install -r requirements.txt
python scraper/scrape.py                  # everything
python scraper/scrape.py notices fees     # just these sections
```

Sections are `faculty`, `notices`, `fees`, `syllabus`, `timetables`, `courses` and
`guide`.
Order matters for the last two: `timetables` reads your `.ics` files, and `courses`
then rewrites `faculty.json` to attach the courses each professor teaches, so run
`faculty` and `timetables` before `courses`. Running with no arguments does this
in the right order.

Each run rewrites `public/data/*.json` and stamps `meta.json`, which the footer shows.
A full run takes a few minutes, most of it the 23 pages of notices and the syllabus PDFs.

## Timetables

Drop one iCalendar file per department and joining year into `public/data/timetables/`,
named `DEPT-YEAR.ics`, for example `CSB-2025.ics`. The department codes are CSB, ITB,
EEB, ETB, MEB, CEB, MMB, MNB and AEB. A student's roll number picks their timetable
automatically: `2025CSB042` loads `CSB-2025.ics`.

### Changing a timetable mid-term

Replacing an `.ics` outright would rewrite history: attendance already marked would be
recomputed against a timetable that was not in force at the time. So calendars are
versioned by an effective date in the filename:

```
EEB-2025-CX.ics              in force from the start of term
EEB-2025-CX@2026-09-15.ics   takes over on 15 September
```

Each version covers from its own date until the next one starts, and a class on any
given day is resolved against whichever version was in force that day. Keep the old file
rather than editing it; that is what makes past percentages stay correct.

A file with no `@date` is the base version. If that is the only file, nothing changes
from before.

### Lab groups

Where a batch splits into groups for labs, add the group to the filename,
`DEPT-YEAR-GROUP.ics`, and describe the roll number ranges in `groups.json`:

```json
{ "EEB-2025": [
    { "group": "CX", "label": "Cx, group 1", "max": 50 },
    { "group": "CY", "label": "Cy, group 2", "min": 51 } ] }
```

That pairs with `EEB-2025-CX.ics` and `EEB-2025-CY.ics`. The number is the trailing
digits of the roll, so `2025EEB050` gets Cx and `2025EEB051` gets Cy. `min` and `max`
are both inclusive and either can be omitted for an open-ended range. A batch with no
entry in `groups.json` just uses its plain `DEPT-YEAR.ics`.

Shared lectures are duplicated in both group files. Only the lab slots differ, which
keeps each file readable on its own and means a student never sees a class that is not
theirs.

Each class is one `VEVENT`. Put the course code first in `SUMMARY` and the staff in
`DESCRIPTION`:

```
BEGIN:VEVENT
UID:csb2025-cs2171n-mon@iiest.portal
SUMMARY:CS2171N Object Oriented Programming and Design Lab
DESCRIPTION:PROF: Apurba Sarkar; Devleena Ghosh\nTYPE: Lab
LOCATION:Software Lab 1
DTSTART:20260803T140000
DTEND:20260803T170000
RRULE:FREQ=WEEKLY;UNTIL=20261127T235900
END:VEVENT
```

Notes on the format:

- **Multiple professors** go in one `PROF:` line separated by semicolons or commas.
  Every one of them is linked to the course and listed on the faculty card.
- `TYPE:` is optional and accepts anything; leave it out and Lab, Project or Tutorial
  is inferred from the course title, defaulting to Lecture.
- `CODE:` in the description works as an alternative to putting the code in `SUMMARY`.
- Times are read as local Asia/Kolkata. A `TZID` is accepted and ignored, so you do not
  need a `VTIMEZONE` block.
- `RRULE:FREQ=WEEKLY` marks the slot as recurring. **The term dates in `schedule.json`,
  not `DTSTART` and `UNTIL`, decide how far a weekly slot runs.** `DTSTART` only fixes
  the weekday and the time of day. This is deliberate: it means you cannot desync a
  hand-written calendar from the academic calendar, and you do not have to re-date every
  event when the institute shifts a term. Without an `RRULE` the class happens once, on
  its `DTSTART` date.
- `PROF:` names are matched against `faculty.json`. Exact match is tried first, then
  first-plus-last name. Anything unmatched is listed as `unmatched_professors` in
  `faculty.json` and logged by the scraper, so check that after adding a calendar.

Thirty-four real timetables ship:

| Batch | Semester | Files |
| --- | --- | --- |
| All nine B.Tech departments, 2026 | 1 | `DEPT-2026-A.ics` and `DEPT-2026-B.ics`, except AEB and MNB which do not split |
| MCB, PHB, CHB, ESB, APB 2026 | 1 | `DEPT-2026.ics`, no group split |
| CSB 2025 | 3 | `CSB-2025-GX.ics` and `CSB-2025-GY.ics` |
| ITB 2025 | 3 | `ITB-2025-HX.ics` and `ITB-2025-HY.ics` |
| EEB 2025, 2024, 2023 | 3, 5, 7 | `EEB-YEAR-CX.ics` and `EEB-YEAR-CY.ics` |
| ETB 2025, 2024, 2023 | 3, 5, 7 | `ETB-YEAR.ics` |

Among the senior batches, Computer Science splits into Gx and Gy for labs, IT into Hx
and Hy, Electrical into Cx and Cy; Electronics does not, so its files have no group
suffix. Any batch without a file sees "no timetable published yet".

### The 2026 first year

First year is taught in mixed cohorts rather than by department, so the institute
publishes it as three routines that cut across the roll-number codes. Two of them
transcribe cleanly:

- one covers EE, CST, IT and ETCE, which map to EEB, CSB, ITB and ETB
- one covers ME, CE, MET, AE and MIN, which map to MEB, CEB, MMB, AEB and MNB

Civil and Metallurgy share their lectures: the routine rows read `CE: A MET: A` and
`CE: B MET: B`, and only the lab cells, prefixed `CE-A:` or `MET-B:`, are specific to
one department. So `CEB-2026-A.ics` and `MMB-2026-A.ics` hold the same lectures and
differ only in the afternoon lab.

The third routine covers PH, CH and ES. All three rows are merged in the source, so
the three programmes genuinely share one schedule and the three calendars are identical
apart from their name; the generator warns if that ever stops being true. These four
programmes were added to `DEPT_CODES` as `PHB`, `CHB`, `ESB` and `MCB`.

Architecture ships as `APB`. Its routine is much sparser than the rest, seven slots with
nothing at all on Tuesday or Wednesday, and it runs its own course codes: `AM1103`,
`MA1102`, `WS1171` and `HU1103`, without the `N` suffix the B.Tech NEP codes carry. It
also lists no rooms, because the routine notes that the department allocates its own.

Two courses in the PH/CH/ES routine are printed without a code: `Mathematics - I` and
the `MDC` and `Departmental Lab` blocks. They ship with an empty code and are grouped
by title instead. `Mathematics - I` is very likely the same `MA1101N` the B.Tech
routines name, but the routine does not say so, so it is not assumed.

The routines name no staff at all, so these calendars carry no `PROF`. `NSS/NCC/PT/Yoga`
occupies a real period and ships as a slot with `TYPE: Activity` and no course code.
Group A and Group B are split at roll number 50, matching the other batches, which is a
convention rather than something the routines state.

Three things to know about the transcription. Lab cells in the EE routine are merged
across periods 5 to 7, so labs run 13:50 to 16:35 rather than a single period. The
semester label is vertically centred and can sit on either the Cx or the Cy row, so
groups are resolved from the cell geometry rather than the label. And the Tuesday
afternoon lab on the Cy row reads "Cx: EE2171N" in the source PDF, which is a slip,
since Cx already has EE2172N in that slot; it is read as Cy here. Worth confirming.

The IT routine was transcribed from a photograph of the printed 3rd sem notice, which
carries course initials but no codes and leaves the class room line blank, so titles and
codes come from the NEP curriculum in `syllabus.json` and no `LOCATION` is set. Each
course's timetabled periods were checked against its L-T-P credits and all eight match.
`IT2191N` Mini Project carries 3 practical credits but does not appear on the routine.

### Staff names

`faculty-codes.json` maps each routine's initials to full names, per department code:

```json
{ "EEB": { "SAQ": "Syed Abdullah Qasim" },
  "ETB": { "SD": "Santanu Das" } }
```

It has to be per department because the same code means different people in each: `SP`
is Sukanya Parui in Electrical and Soumyajit Poddar in Electronics.

71 codes are filled in, taken from unique initials matches against the scraped directory
plus the PG student and research scholar legend printed in the EE routine. Every code
now appearing in a routine resolves to a name. Anything left bare shows as initials and
does not link to a faculty profile; adding a line to that file is all it takes.

## Session, holidays and exams

Three hand-maintained files drive the calendar, filled in from the institute's own
[academic calendar for 2026-27](https://data.iiests.ac.in/cloud/2026/07/20260710_21490_academic-calender-2026-2027.pdf).

**First year and senior years do not share a timetable window**, which is why every
entry can carry a `semesters` list. Anything without one applies to everybody. From the
official calendar for the odd semester:

| Cohort | Classes | End-semester exam |
| --- | --- | --- |
| First year UG, semester 1 | 24 Aug to 04 Dec 2026 | 07 to 14 Dec 2026 |
| Semester 3 and beyond | 20 Jul to 13 Nov 2026 | 16 to 29 Nov 2026 |

The even semester is uniform, 04 Jan to 23 Apr 2027, with end-semesters 26 Apr to
10 May 2027.

`schedule.json` holds one term per cohort. The term whose `semesters` list contains your
computed semester wins:

```json
{ "session": "2026-2027",
  "terms": [
    { "id": "odd-first-year-ug", "label": "Odd semester, first year UG",
      "semesters": [1], "start": "2026-08-24", "end": "2026-12-04" },
    { "id": "odd-senior", "label": "Odd semester",
      "semesters": [3, 5, 7, 9], "start": "2026-07-20", "end": "2026-11-13" }
  ] }
```

`exams.json` and `holidays.json` take the same optional `semesters` filter. Holidays
accept a single `date` or a `start` and `end` range:

```json
[ { "name": "End-Semester Examinations", "start": "2026-12-07", "end": "2026-12-14",
    "semesters": [1], "note": "First year UG and PG only." } ]
```

```json
[ { "date": "2026-11-24", "name": "Institute Foundation Day" },
  { "start": "2026-12-15", "end": "2026-12-31", "name": "Winter break",
    "semesters": [1] } ]
```

Exam and holiday windows are allowed to fall outside the teaching term, because they
usually do: seniors finish classes on 13 November and sit end-semesters from the 16th.
A holiday beats an exam on the same day, so Foundation Day still shows as a holiday in
the middle of the end-semester window.

The calendar colours each day: green all present, red all absent, amber mixed, orange
cancelled, blue exam window, outlined amber holiday. Weekends are skipped.

Two caveats on the data. The source PDF is a scan and its OCR mangles some years, so
"24 August 2025" for the start of first year classes has been read as 2026, which is
what the surrounding odd semester 2026-27 context requires. And the PDF lists institute
events, not the public holiday list, so Independence Day, Gandhi Jayanti and Republic
Day are filled in from the fixed national dates. Check them against the notice board
before trusting a percentage.

**Classes in the past that you never marked count as absent.** Nothing is written to the
database for them, they are simply treated as absent everywhere until you mark them
otherwise, which is why a day panel showing old classes warns you about it. Marking the
same button twice clears the mark and hands the class back to that rule.

## Student guide

This is a mirror of <https://iiest-town.github.io>, not a reformatting of it. The wiki
is a plain single column prose site that you navigate through links inside the pages
themselves, and the mirror behaves the same way: the index lists "How are the hostels?",
clicking it opens Hostels, and breadcrumbs walk back up.

`python scraper/scrape.py guide` pulls every page in the wiki's `sitemap.xml`, takes the
`article.prose` body, strips the anchor decorations and any tag outside a small
allowlist, and writes `guide.json`. Links that point inside the wiki are turned into
`data-wiki` references so they resolve against the mirror instead of leaving the site;
external links keep `target="_blank"`.

Each page gets its own URL, so `#guide/departments/computer-science` is shareable and
the browser back button works.

Be aware that much of that wiki is still a skeleton: several department pages contain
only prompts like "Add research areas" rather than real content. Hostels, Campus and the
index are the substantial ones today. Re-run the task to pick up later edits.

## Switching on accounts

Attendance needs a database. This runs on free tiers with no server of your own and no
recurring cost.

**1. Create a Supabase project.** Free tier. Note the project URL and the `anon` public
key from Settings, API.

**2. Load the schema.** Paste `supabase/schema.sql` into the SQL editor and run it. It
creates `profiles` and `attendance`, grants them to the `authenticated` role, turns on
row level security, and adds a trigger that parses
`2025CSB042.arjun@students.iiests.ac.in` into a roll number, joining year and department
on first sign-in. The file is safe to re-run.

**3. Enable Google.** In Authentication, Providers, turn on Google and paste in a client
ID and secret from a Google Cloud OAuth client. Set the authorised redirect URI to
`https://<project>.supabase.co/auth/v1/callback`, and add your own domain under
Authentication, URL Configuration, Redirect URLs.

**4. Fill in `src/lib/config.js`:**

```js
export const SUPABASE_URL = "https://xxxx.supabase.co";
export const SUPABASE_ANON_KEY = "eyJ...";
```

`ATTENDANCE_TARGET` in the same file sets the percentage the attendance view treats as
the pass mark. It defaults to 75.

Until those two values are filled in, the site runs fine and simply says sign-in is not
configured. Faculty, notices, syllabus and fees never touch the database.

### How the student-only rule is enforced

An `hd` hint is passed on the sign-in redirect so Google can pre-filter the account
chooser where it honours it, but that is only a convenience and is trivially bypassed.
Enforcement is in Postgres, in two places:

- The `handle_new_user` trigger raises an exception for any email that is not
  `@students.iiests.ac.in`, which aborts account creation.
- Every row level security policy calls `public.is_student()`, which re-checks the email
  claim on the caller's JWT on every single query.

The anon key in `config.js` is public by design and is meant to ship in your JavaScript.
Row level security is therefore the entire security boundary. If you edit the policies,
test them, because a wrong policy is an open table.

Two things that are easy to get wrong:

- **Row level security is not enough on its own.** Postgres checks table privileges
  before it ever evaluates a policy, and creating tables from the SQL editor does not
  necessarily grant them to Supabase's `authenticated` role. Without the `grant`
  statements in the schema, every request fails with `42501 permission denied` no matter
  how correct the policies are. That is why the schema grants explicitly.
- **Attendance is private to each student.** The `attendance_own` policy scopes every
  read and write to `student = auth.uid()`, so no one can see anyone else's marks.

### What it costs

| Piece | Service | Cost |
| --- | --- | --- |
| Site, domain, SSL | Cloudflare Pages | free |
| Postgres, Google auth | Supabase free tier | free |
| OAuth client | Google Cloud | free |

The one caveat: Supabase pauses free projects after about a week with no traffic at all.
A portal in daily use never hits that, and unpausing is one click. Check the current free
limits yourself, they change.

## Where the data comes from

iiests.ac.in is a Next.js app that renders everything client side, so requesting the HTML
returns an empty shell. The scraper calls the same public JSON endpoints the site's own
front end uses:

| Endpoint | Used for |
| --- | --- |
| `/api/faculties?type=faculty\|staff\|officer` | the three directory buckets |
| `/api/backend/announcements_all?type=notifications&sub_type=Student` | notices, `limit` is capped at 50 server side |
| `/api/backend/menus` | the department list under Academic |
| `/api/backend/content/<slug>?leftMenu=<id>` | a department's Academic Programs panel |
| `/api/cms/page?slug=feesstruc` | the fees page body |

Two URL shapes returned by those APIs are wrong and are rewritten before use:

- Notice attachments come back as `data.iiests.ac.in/storage/uploads/...`, which 404s.
  The `/storage` segment is stripped. Note that some filenames contain consecutive
  spaces, so URLs are trimmed but never whitespace-collapsed.
- `profile_url` on a faculty record points at `data.iiests.ac.in/faculty/<id>/<name-slug>`,
  which 404s. Profiles are rebuilt as `www.iiests.ac.in/en/faculty/<nameslug>-<id>`,
  matching the link the official directory itself renders. Officers have no profile page,
  so they get no link.

## Syllabus coverage

Documents are read from each department's Academic Programs panel, which is the same
place you reach through Academic, Departments, a department, then Programmes. Each link
is grouped by the programme named in its table row, classified as Bachelors, Masters or
Doctoral, and flagged NEP when the row, the link text or the filename says so.

12 of the 26 departments, schools and centres publish documents there. Chemistry and
CCSID have no Academic Programs panel at all, Purabi Das School of IT returns a server
error, and the rest describe their programmes in prose with no attached PDFs.

Every document flagged as a Bachelors NEP B.Tech structure is then downloaded and its
course structure is parsed into semester tables. 7 departments yield one: Aerospace,
Civil, Computer Science, Electrical, Information Technology, Mechanical and Metallurgy.
Computer Science publishes only the first four semesters so far, the rest publish all
eight.

Getting usable text out of these took three things worth knowing about:

- Several tables are emitted with a text matrix like `[0.588, -3e-08, -1e-08, 0.587]`,
  which is axis aligned in every practical sense, but the near zero skew makes pdfplumber
  mark every glyph as non-upright. Those tables then extract as one character per line.
  Snapping the flag back to upright when the skew is under `1e-4` fixes them.
- A course name that wraps splits around its own row, so the first half sits on the line
  above the numbers and the rest on the line below. Fragments are assigned by looking at
  whether the following row carries a name of its own.
- Some pages read better through the table grid and others through the text layer, so
  both are parsed and each semester keeps whichever version scores higher. The score
  rewards agreeing with the semester total the PDF itself prints.

The result is checked against those printed totals. Every parsed semester matches except
Metallurgy's seventh, where the computed 14 credits disagrees with the printed 12; the UI
shows both numbers when they differ. Electrical's PDF is a scan, so its text carries OCR
damage (a stray Korean character for zero, a signature bled into a row); it parses, but
it is the least reliable of the seven.

Only the course structure is parsed. These files run to 200 pages and the rest is per
course prose, which stays in the PDF behind the source link.

## Hosting it on your own domain

`public/` is a static directory with no build step, so any static host works. There is
no server side code and routing is hash based, so no rewrite rules are needed.

### 1. Push it to GitHub

```sh
git init -b main
git add .
git commit -m "IIEST Shibpur portal"
gh repo create iiest-portal --public --source=. --push
```

The repo has to be **public** unless you pay for GitHub Pro. GitHub Pages on a private
repo is a paid feature, and a private repo will simply refuse to publish.

`.gitignore` already excludes `.cache/`, which holds about 80 MB of downloaded PDFs and
must not be committed. `public/data/*.json` **should** be committed, that is what makes
the site work without a backend.

Committing `src/lib/config.js` with your Supabase URL and anon key is expected. The anon
key is a public client key and is meant to ship in the browser; row level security is
what protects the data. Never put the `service_role` key in that file.

### 2. Turn on GitHub Pages

`.github/workflows/deploy.yml` publishes `public/` on every push to `main`. Because it
deploys through Actions rather than from a branch, the site stays in `public/` and
nothing has to be moved to the repo root.

In the repo, Settings, Pages, set **Source** to **GitHub Actions**. Push once and the
workflow runs; the deployment URL appears in the Actions summary.

To attach your domain, commit a `CNAME` file into the published directory:

```sh
echo yourdomain.com > public/CNAME
git add public/CNAME && git commit -m "custom domain" && git push
```

Then add the DNS records at your registrar. For an apex domain (`yourdomain.com`), four
`A` records:

```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

For a subdomain (`portal.yourdomain.com`), a single `CNAME` to `<user>.github.io`.
Finally set the same domain under Settings, Pages, Custom domain, and tick Enforce
HTTPS once the certificate is issued.

Without a custom domain the site lives at `https://<user>.github.io/<repo>/`. Every
asset path in the app is relative, so it works from that subpath too.

### 3. Point Supabase and Google at the new domain

Sign-in will fail until you do this, because the callback returns to an origin Supabase
does not trust yet.

In Supabase, Authentication, URL Configuration:

- **Site URL**: `https://yourdomain.com`
- **Redirect URLs**: add `https://yourdomain.com/**`, keep `http://localhost:8000/**`
  for local testing, and add `https://<user>.github.io/<repo>/**` too if you ever open
  the site at its default Pages address, since that is a different origin

In Google Cloud, APIs and Services, Credentials, your OAuth client:

- **Authorised redirect URI** stays `https://<project>.supabase.co/auth/v1/callback`.
  This is Supabase's callback, not your domain, and it does not change when you add a
  custom domain.
- **Authorised JavaScript origins**: add `https://yourdomain.com`

### 4. Keep the data fresh

`.github/workflows/refresh.yml` re-runs the whole scraper daily at 06:30 IST and commits
whatever changed under `public/data`. That commit lands on `main`, which fires
`deploy.yml`, so fresh data publishes itself. Set Settings, Actions, General, Workflow
permissions to "Read and write" or the refresh job cannot push.

The workflow does not have access to your `.cache/`, so it re-downloads the syllabus and
fee PDFs on every run. That is slow but free, and it is why the scraper caches by URL
hash locally.

## Notes

- Always confirm anything that matters against iiests.ac.in.
- Faculty photos are loaded from data.iiests.ac.in. If that host is slow or refuses the
  request the image is dropped and the card renders without it.
- B.Tech and B.Arch have no fee table because the official fees page publishes no UG fee
  PDF. Their admission documents are still listed.
- Notices are limited to the `Student` sub type. To include others, extend
  `NOTICE_SUB_TYPES` in `scraper/scrape.py`. The API also exposes `Faculty/Staff`,
  `Admission`, `Employment`, `Tender`, `Finance` and `CMS`.