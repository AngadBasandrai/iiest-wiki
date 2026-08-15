import { useRegisterSW } from "virtual:pwa-register/react";

export default function UpdateToast() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!offlineReady && !needRefresh) return null;

  return (
    <div className="toast">
      <span>
        {needRefresh
          ? "A new version is available."
          : "Ready to work offline."}
      </span>
      {needRefresh ? (
        <button className="btn small primary" onClick={() => updateServiceWorker(true)}>
          Reload
        </button>
      ) : null}
      <button className="btn small" onClick={() => {
        setOfflineReady(false);
        setNeedRefresh(false);
      }}>
        Dismiss
      </button>
    </div>
  );
}
