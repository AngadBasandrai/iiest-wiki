import Icon from "../components/Icon.jsx";
import { useJson } from "../lib/data.js";
import { count, fmtDate, isoDate } from "../lib/util.js";
import { go } from "../lib/router.js";

export default function Clubs({ follows, onToggle }) {
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

          return (
            <article
              className={`club-card${club.logo ? " has-art" : ""}`}
              key={club.slug}
              style={club.logo ? { "--club-art": `url("${club.logo}")` } : undefined}
            >
              {club.logo ? <span className="club-art" aria-hidden="true" /> : null}
              <span className="club-sheen" aria-hidden="true" />

              <div className="club-card-body">
                <div className="club-card-top">
                  <span className="club-mark">
                    {club.logo
                      ? <img src={club.logo} alt="" loading="lazy" />
                      : <Icon name="star" />}
                  </span>
                  <button
                    className={`follow${following ? " on" : ""}`}
                    aria-pressed={following}
                    title={following ? `Unfollow ${club.name}` : `Follow ${club.name}`}
                    onClick={() => onToggle(club.slug)}
                  >
                    <Icon name="star" />
                    {following ? "Following" : "Follow"}
                  </button>
                </div>

                {club.site ? (
                  <a className="club-card-name club-hit" href={club.site}>{club.name}</a>
                ) : (
                  <button className="club-card-name club-hit"
                          onClick={() => go("club", club.slug)}>{club.name}</button>
                )}

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
              </div>
            </article>
          );
        })}
      </div>

      {data && !clubs.length ? (
        <p className="empty">No clubs listed yet.</p>
      ) : null}
    </section>
  );
}
