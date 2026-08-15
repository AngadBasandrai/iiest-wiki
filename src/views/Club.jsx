import Icon from "../components/Icon.jsx";
import { useJson } from "../lib/data.js";
import { fmtDate, isoDate } from "../lib/util.js";
import { LEAD_MINUTES } from "../lib/notify.js";
import { go } from "../lib/router.js";

function EventRow({ ev, past }) {
  return (
    <article className={`club-event${past ? " past" : ""}`}>
      <div className="club-when">
        <strong>{fmtDate(ev.date)}</strong>
        <span>{ev.start}{ev.end ? ` to ${ev.end}` : ""}</span>
      </div>
      <div className="club-what">
        <div className="club-title">{ev.title}</div>
        {ev.about ? <p>{ev.about}</p> : null}
        {ev.venue ? <span className="club-venue">{ev.venue}</span> : null}
      </div>
    </article>
  );
}

export default function Club({ slug, follows, onToggle, perm, onAsk }) {
  const { data, error } = useJson("clubs", { clubs: [] });
  if (error) return <p className="empty">Could not load clubs: {error.message}</p>;

  const clubs = data?.clubs || [];
  const club = clubs.find((c) => c.slug === slug) || clubs[0];
  if (!club) return <p className="empty">No clubs listed yet.</p>;

  const following = follows.includes(club.slug);
  const today = isoDate(new Date());
  const events = [...(club.events || [])].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = events.filter((e) => e.date >= today);
  const past = events.filter((e) => e.date < today);

  return (
    <section className="view">
      <nav className="wiki-crumbs">
        <button className="wiki-crumb" onClick={() => go("clubs")}>Clubs</button>
        <span className="sep">/</span>
        <span className="dim">{club.name}</span>
      </nav>
      <div className="page-head">
        <h1>{club.name}</h1>
        <p className="sub">{club.tagline}</p>
      </div>

      <div className="card-plain club-head">
        <div className="club-intro">
          <p>{club.about}</p>
          {club.meets ? (
            <p className="club-meets"><Icon name="cal" />{club.meets}</p>
          ) : null}
          {(club.links || []).length ? (
            <div className="club-links">
              {club.links.map((l) => (
                <a className="chip" key={l.url} href={l.url}
                   target="_blank" rel="noreferrer">{l.label}</a>
              ))}
            </div>
          ) : null}
        </div>
        <div className="club-follow">
          <button className={`btn${following ? "" : " primary"}`}
                  onClick={() => onToggle(club.slug)}>
            {following ? "Following" : "Follow"}
          </button>
          <p className="club-note">
            {following
              ? `You will be reminded ${LEAD_MINUTES} minutes before each event.`
              : "Follow to get a reminder before each event."}
          </p>
          {following && perm !== "granted" ? (
            <button className="link-inline" onClick={onAsk}>
              Turn on notifications
            </button>
          ) : null}
        </div>
      </div>

      <p className="section-label">Upcoming</p>
      {upcoming.length ? (
        <div className="club-events">
          {upcoming.map((e) => <EventRow ev={e} key={e.date + e.title} />)}
        </div>
      ) : <p className="dim">Nothing scheduled right now.</p>}

      {past.length ? (
        <>
          <p className="section-label">Past</p>
          <div className="club-events">
            {past.reverse().map((e) => <EventRow ev={e} past key={e.date + e.title} />)}
          </div>
        </>
      ) : null}
    </section>
  );
}
