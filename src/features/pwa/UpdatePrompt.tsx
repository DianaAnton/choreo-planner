import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * How often an already-running app re-checks for a new build. A browser only
 * looks for an updated service worker on navigation, which for an installed
 * PWA can be days — it is launched once and then lives in the background.
 */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * `registerType: 'prompt'` in vite.config.ts means a new build waits rather
 * than swapping itself in. That is the right default here: reloading the app
 * mid-session, on a phone, mid-log, would lose what is on the screen.
 *
 * The cost of `prompt` is that a waiting build stays waiting until something
 * releases it — and if the running build has no prompt, nothing ever does. That
 * is exactly what stranded the first deploy of the training layer: the previous
 * build registered a worker but shipped no UI to update it, so every returning
 * visitor kept being served the old shell and had to clear site data by hand.
 * Hence the periodic check below: a prompt nobody is around to see is the same
 * as no prompt at all.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      // Never cleared: it is meant to live as long as the tab does, and the
      // callback fires once per registration.
      setInterval(() => {
        // Rejects when offline, which is the normal state in a studio. Ignore
        // it — the next tick, or the next launch, will pick the build up.
        void registration.update().catch(() => {});
      }, UPDATE_CHECK_MS);
    },
  });

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
