import { useEffect, useState } from 'react';

/**
 * Not in lib.dom — `beforeinstallprompt` is Chromium-only and unstandardised.
 * Typed here rather than cast to `any`, per the repo's no-`any` rule.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'choreo:install-dismissed';

function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari does not implement display-mode: standalone; it sets this instead.
  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

/**
 * The training screens are used in a basement with no signal. Uninstalled, that
 * means a Safari tab that has been evicted from memory since Tuesday — so this
 * is not a nicety, it is the difference between the tool existing and not.
 *
 * Chromium hands us an event to defer and fire on a tap. iOS gives us nothing,
 * so it gets the one sentence of instructions that actually works there.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Reading storage can throw outright in a locked-down browser.
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === 'true');
    } catch {
      setDismissed(false);
    }

    if (isStandalone()) return;

    const onPrompt = (event: Event) => {
      // Chromium shows its own mini-infobar unless we take the event.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);

    // iOS Safari: no event ever fires, so detect the platform instead.
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setShowIosHint(isIos && !isStandalone());

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // A browser that refuses storage just asks again next time. Harmless.
    }
  }

  if (dismissed || (!deferred && !showIosHint)) return null;

  return (
    <div className="notice install-prompt">
      {deferred ? (
        <>
          <p>Install this so it opens without a browser — and works with no signal.</p>
          <div className="notice__actions">
            <button
              type="button"
              onClick={async () => {
                await deferred.prompt();
                await deferred.userChoice;
                setDeferred(null);
                dismiss();
              }}
            >
              Install
            </button>
            <button type="button" className="ghost" onClick={dismiss}>
              Not now
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            To use this in the studio with no signal: tap <strong>Share</strong>, then{' '}
            <strong>Add to Home Screen</strong>.
          </p>
          <div className="notice__actions">
            <button type="button" className="ghost" onClick={dismiss}>
              Got it
            </button>
          </div>
        </>
      )}
    </div>
  );
}
