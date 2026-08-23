import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * `registerType: 'prompt'` in vite.config.ts means a new build waits rather
 * than swapping itself in. That is the right default here: reloading the app
 * mid-session, on a phone, mid-log, would lose what is on the screen.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="toast" role="status">
      {needRefresh ? (
        <>
          <span>A new version is ready.</span>
          <button type="button" onClick={() => void updateServiceWorker(true)}>
            Reload
          </button>
          <button type="button" className="ghost" onClick={() => setNeedRefresh(false)}>
            Later
          </button>
        </>
      ) : (
        <>
          <span>Ready to work offline.</span>
          <button type="button" className="ghost" onClick={() => setOfflineReady(false)}>
            OK
          </button>
        </>
      )}
    </div>
  );
}
