import { useEffect, useState } from "react";

export const VIEWS = ["overview", "weekly", "courses", "faculty", "notices",
                      "syllabus", "fees", "guide", "clubs", "club"];
export const HOME = "overview";

export function parseHash(hash) {
  const raw = (hash || "").replace(/^#/, "").split("?")[0];
  const [head, ...rest] = raw.split("/");
  return {
    view: VIEWS.includes(head) ? head : HOME,
    param: rest.join("/"),
  };
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(location.hash));

  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  return route;
}

export function go(view, param) {
  location.hash = param ? `${view}/${param}` : view;
}
