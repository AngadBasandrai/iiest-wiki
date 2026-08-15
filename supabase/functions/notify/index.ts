import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = Deno.env.get("SITE_URL") ?? "https://iiest.wiki";
const TARGET = Number(Deno.env.get("ATTENDANCE_TARGET") ?? "75");
const LEAD_MIN = 15;
const WINDOW_MIN = 5;
const IST_OFFSET = 5.5 * 60 * 60 * 1000;

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@iiest.wiki",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const cache = new Map<string, unknown>();
async function data<T>(name: string, fallback: T): Promise<T> {
  if (cache.has(name)) return cache.get(name) as T;
  try {
    const res = await fetch(`${SITE}/data/${name}.json`);
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    cache.set(name, json);
    return json as T;
  } catch {
    return fallback;
  }
}

function istNow() {
  return new Date(Date.now() + IST_OFFSET);
}

function istParts(d: Date) {
  const iso = d.toISOString();
  return {
    date: iso.slice(0, 10),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    weekday: (d.getUTCDay() + 6) % 7,
  };
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function inLeadWindow(startMin: number, nowMin: number) {
  const delta = startMin - nowMin;
  return delta > LEAD_MIN - WINDOW_MIN && delta <= LEAD_MIN;
}

function rollParts(roll: string) {
  const m = /^(\d{4})([A-Z]{3})(\d+)$/.exec(roll ?? "");
  if (!m) return null;
  return { year: Number(m[1]), dept: m[2], number: Number(m[3]),
           batch: `${m[2]}-${m[1]}` };
}

function semesterFor(joinYear: number, on: Date) {
  const elapsed = on.getUTCFullYear() - joinYear;
  const month = on.getUTCMonth() + 1;
  const sem = month >= 7 ? elapsed * 2 + 1 : elapsed * 2;
  return Math.min(10, Math.max(1, sem));
}

const applies = (item: any, sem: number) =>
  !item.semesters || item.semesters.includes(sem);

function pickTable(tables: any[], groups: any, roll: string) {
  const parts = rollParts(roll);
  if (!parts) return null;
  const batch = tables.filter((t) => t.dept === parts.dept && t.year === parts.year);
  if (!batch.length) return null;
  if (batch.length === 1 && !batch[0].group) return batch[0];
  for (const rule of groups[parts.batch] ?? []) {
    const okMin = rule.min == null || parts.number >= rule.min;
    const okMax = rule.max == null || parts.number <= rule.max;
    if (okMin && okMax) {
      const hit = batch.find((t: any) => t.group === rule.group);
      if (hit) return hit;
    }
  }
  return batch.find((t: any) => !t.group) ?? null;
}

function sessionFor(schedule: any, joinYear: number, on: Date) {
  const sem = semesterFor(joinYear, on);
  const terms = schedule.terms ?? [];
  const term = terms.find((t: any) => applies(t, sem) && t.semesters) ?? terms[0];
  return term ? { ...term, semester: sem } : null;
}

function slotsOn(table: any, iso: string) {
  const versions = table.versions ?? [{ from: "", until: "", slots: table.slots }];
  const hit = versions.find((v: any) =>
    (!v.from || iso >= v.from) && (!v.until || iso < v.until));
  return (hit ?? versions[versions.length - 1]).slots ?? [];
}

type Job = { endpoint: string; tag: string; payload: Record<string, unknown> };

async function classJobs(subs: any[], now: Date): Promise<Job[]> {
  const { date, minutes, weekday } = istParts(now);
  const [tables, groups, schedule, holidays, exams] = await Promise.all([
    data<any>("timetables", { timetables: [] }),
    data<any>("groups", {}),
    data<any>("schedule", { terms: [] }),
    data<any[]>("holidays", []),
    data<any[]>("exams", []),
  ]);

  const jobs: Job[] = [];
  for (const sub of subs) {
    const roll = sub.profiles?.roll ?? "";
    const parts = rollParts(roll);
    if (!parts) continue;

    const table = pickTable(tables.timetables ?? [], groups, roll);
    if (!table) continue;
    const session = sessionFor(schedule, parts.year, now);
    if (!session) continue;
    if (date < session.start || date > session.end) continue;

    const sem = session.semester;
    if (holidays.some((h) => applies(h, sem) &&
        (h.date === date || (h.start && h.end && date >= h.start && date <= h.end)))) continue;
    if (exams.some((e) => applies(e, sem) && date >= e.start && date <= e.end)) continue;

    for (const slot of slotsOn(table, date)) {
      if (slot.day !== weekday || !slot.start) continue;
      if (!inLeadWindow(toMinutes(slot.start), minutes)) continue;
      jobs.push({
        endpoint: sub.endpoint,
        tag: `class:${date}:${slot.code}:${slot.start}`,
        payload: {
          title: `${slot.code || "Class"} in ${LEAD_MIN} minutes`,
          body: [slot.title, slot.room].filter(Boolean).join(" | ") + ` at ${slot.start}`,
          tag: `class:${date}:${slot.code}:${slot.start}`,
          url: "/#overview",
        },
      });
    }
  }
  return jobs;
}

async function clubJobs(subs: any[], now: Date): Promise<Job[]> {
  const { date, minutes } = istParts(now);
  const clubs = await data<any>("clubs", { clubs: [] });
  const { data: follows } = await admin.from("club_follows").select("student, club");
  if (!follows?.length) return [];

  const byStudent = new Map<string, string[]>();
  for (const f of follows) {
    byStudent.set(f.student, [...(byStudent.get(f.student) ?? []), f.club]);
  }

  const jobs: Job[] = [];
  for (const sub of subs) {
    const mine = byStudent.get(sub.student) ?? [];
    if (!mine.length) continue;
    for (const club of clubs.clubs ?? []) {
      if (!mine.includes(club.slug)) continue;
      for (const ev of club.events ?? []) {
        if (ev.date !== date || !ev.start) continue;
        if (!inLeadWindow(toMinutes(ev.start), minutes)) continue;
        const tag = `club:${club.slug}:${ev.date}:${ev.title}`;
        jobs.push({
          endpoint: sub.endpoint,
          tag,
          payload: {
            title: `${club.name} in ${LEAD_MIN} minutes`,
            body: [ev.title, ev.venue].filter(Boolean).join(" | ") + ` at ${ev.start}`,
            tag,
            url: `/#club/${club.slug}`,
          },
        });
      }
    }
  }
  return jobs;
}

async function attendanceJobs(subs: any[], now: Date): Promise<Job[]> {
  const { date } = istParts(now);
  const { data: marks } = await admin
    .from("attendance").select("student, course_code, status");
  if (!marks?.length) return [];

  const byStudent = new Map<string, Map<string, { p: number; a: number }>>();
  for (const m of marks) {
    if (m.status !== "present" && m.status !== "absent") continue;
    const courses = byStudent.get(m.student) ?? new Map();
    const row = courses.get(m.course_code) ?? { p: 0, a: 0 };
    if (m.status === "present") row.p += 1; else row.a += 1;
    courses.set(m.course_code, row);
    byStudent.set(m.student, courses);
  }

  const jobs: Job[] = [];
  for (const sub of subs) {
    const courses = byStudent.get(sub.student);
    if (!courses) continue;
    const low: string[] = [];
    for (const [code, r] of courses) {
      const held = r.p + r.a;
      if (held < 4) continue;
      if ((r.p / held) * 100 < TARGET) low.push(code);
    }
    if (!low.length) continue;
    const tag = `attendance:${date}`;
    jobs.push({
      endpoint: sub.endpoint,
      tag,
      payload: {
        title: `${low.length} course${low.length > 1 ? "s" : ""} below ${TARGET}%`,
        body: low.slice(0, 4).join(", ") +
          (low.length > 4 ? ` and ${low.length - 4} more` : ""),
        tag,
        url: "/#courses",
      },
    });
  }
  return jobs;
}

async function noticeJobs(subs: any[], now: Date): Promise<Job[]> {
  const { date } = istParts(now);
  const notices = await data<any>("notices", { records: [] });
  const fresh = (notices.records ?? []).filter((n: any) => n.date === date);
  if (!fresh.length) return [];

  const tag = `notices:${date}:${fresh.length}`;
  return subs.map((sub) => ({
    endpoint: sub.endpoint,
    tag,
    payload: {
      title: fresh.length === 1 ? "New student notice" : `${fresh.length} new notices`,
      body: fresh[0].title.slice(0, 140),
      tag,
      url: "/#notices",
    },
  }));
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("NOTIFY_SECRET");
  if (secret && req.headers.get("x-notify-secret") !== secret) {
    return new Response("forbidden", { status: 403 });
  }

  const now = istNow();
  const { minutes } = istParts(now);

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, student, p256dh, auth, profiles(roll)");
  if (!subs?.length) {
    return Response.json({ sent: 0, note: "no subscriptions" });
  }

  const jobs: Job[] = [];
  jobs.push(...await classJobs(subs, now));
  jobs.push(...await clubJobs(subs, now));
  if (minutes >= 20 * 60 && minutes < 20 * 60 + WINDOW_MIN) {
    jobs.push(...await attendanceJobs(subs, now));
  }
  if (minutes >= 7 * 60 && minutes < 7 * 60 + WINDOW_MIN) {
    jobs.push(...await noticeJobs(subs, now));
  }
  if (!jobs.length) return Response.json({ sent: 0 });

  const { data: already } = await admin
    .from("push_sent")
    .select("tag, endpoint")
    .in("tag", [...new Set(jobs.map((j) => j.tag))]);
  const seen = new Set((already ?? []).map((r) => `${r.tag}|${r.endpoint}`));

  const byEndpoint = new Map(subs.map((s) => [s.endpoint, s]));
  let sent = 0;
  let gone = 0;
  const record: { tag: string; endpoint: string }[] = [];

  for (const job of jobs) {
    if (seen.has(`${job.tag}|${job.endpoint}`)) continue;
    const sub = byEndpoint.get(job.endpoint);
    if (!sub) continue;
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(job.payload),
      );
      record.push({ tag: job.tag, endpoint: job.endpoint });
      sent += 1;
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await admin.from("push_subscriptions").delete().eq("endpoint", job.endpoint);
        gone += 1;
      }
    }
  }

  if (record.length) await admin.from("push_sent").upsert(record);
  await admin.from("push_sent")
    .delete()
    .lt("sent_at", new Date(Date.now() - 7 * 864e5).toISOString());

  return Response.json({ sent, gone, considered: jobs.length });
});
