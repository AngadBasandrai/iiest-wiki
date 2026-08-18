import { useEffect, useState } from "react";

// Ticks once a minute so anything clock-driven drifts on its own, and re-syncs
// on focus because background tabs get their timers throttled.
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const sync = () => setNow(new Date());
    const id = setInterval(sync, 60000);
    const wake = () => { if (!document.hidden) sync(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", sync);
    };
  }, []);
  return now;
}
