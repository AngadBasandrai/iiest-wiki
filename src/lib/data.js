import { useEffect, useState } from "react";

const cache = new Map();

export function loadJson(name, fallback) {
  if (!cache.has(name)) {
    cache.set(name, fetch(`data/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`${name}.json returned ${r.status}`);
      return r.json();
    }).catch((err) => {
      if (fallback !== undefined) return fallback;
      throw err;
    }));
  }
  return cache.get(name);
}

export function useJson(name, fallback) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  useEffect(() => {
    let alive = true;
    setState({ data: null, error: null, loading: true });
    loadJson(name, fallback)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => { alive = false; };
  }, [name]);

  return state;
}

export function useJsonAll(names) {
  const key = names.join(",");
  const [state, setState] = useState({ data: null, error: null, loading: true });

  useEffect(() => {
    let alive = true;
    setState({ data: null, error: null, loading: true });
    Promise.all(names.map((n) => loadJson(n.name ?? n, n.fallback)))
      .then((all) => {
        if (!alive) return;
        const out = {};
        names.forEach((n, i) => { out[n.name ?? n] = all[i]; });
        setState({ data: out, error: null, loading: false });
      })
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => { alive = false; };
  }, [key]);

  return state;
}
