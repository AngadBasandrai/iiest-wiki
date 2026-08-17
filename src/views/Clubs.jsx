import Icon from "../components/Icon.jsx";
import { useJson } from "../lib/data.js";
import { count, fmtDate, isoDate } from "../lib/util.js";
import { go } from "../lib/router.js";

export default function Clubs({ follows }) {
  const { data, error } = useJson("clubs", { clubs: [] });
  if (error) return <p className="empty">Could not load clubs: {error.message}</p>;

  const clubs = data?.clubs || [];
  const today = isoDate(new Date());

  return (
    <section className="view">
      <div className="page-head">
        <h1>Clubs</h1>
        <p className="sub">
          {data ? `${count(clubs.length, "club", "clubs")} on campus.` : ""}
        </p>
      </div>

      <div className="club-grid">
        {clubs.map((club) => {
          const events = [...(club.events || [])]
            .filter((e) => e.date >= today)
            .sort((a, b) => a.date.localeCompare(b.date));
          const next = events[0];
          const following = follows.includes(club.slug);
          const inner = (
            <>
              <div className="club-card-top">
                <span className="club-mark"><Icon name="star" /></span>
                {following ? <span className="badge nep">Following</span> : null}
              </div>
              <div className="club-card-name">{club.name}</div>
              <p className="club-card-line">{club.tagline}</p>
              <div className="club-card-foot">
                {club.site ? (
                  <span>{club.site.replace(/^https?:\/\//, "")}</span>
                ) : next ? (
                  <span>Next: {next.title} on {fmtDate(next.date)}</span>
                ) : (
                  <span className="dim">Nothing scheduled</span>
                )}
                <span className="club-card-count">
                  {club.site ? "VISIT" : count(events.length, "event", "events")}
                </span>
              </div>
            </>
          );

          return club.site ? (
            <a className="club-card" key={club.slug} href={club.site}>{inner}</a>
          ) : (
            <button className="club-card" key={club.slug}
                    onClick={() => go("club", club.slug)}>{inner}</button>
          );
        })}
      </div>

      {data && !clubs.length ? (
        <p className="empty">No clubs listed yet.</p>
      ) : null}
    </section>
  );
}
