import { useState } from 'react';

import { useAuth } from './useAuth';

type Notice =
  | { kind: 'none' }
  | { kind: 'credentialInUse' }
  | { kind: 'redirecting' }
  | { kind: 'error'; message: string };

export function AccountBar() {
  const { status, user, linkGoogle, switchToGoogleAccount, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>({ kind: 'none' });

  if (status === 'starting') {
    return (
      <div className="account-bar" aria-busy="true">
        <span className="muted">Signing in…</span>
      </div>
    );
  }

  async function handleLink() {
    setBusy(true);
    setNotice({ kind: 'none' });
    try {
      const result = await linkGoogle();
      if (result.status === 'credentialInUse') setNotice({ kind: 'credentialInUse' });
      else if (result.status === 'redirecting') setNotice({ kind: 'redirecting' });
      // 'linked', 'alreadyLinked' and 'cancelled' need no message — the bar
      // re-renders from auth state, or nothing happened at all.
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  async function handleSwitch() {
    setBusy(true);
    try {
      await switchToGoogleAccount();
      setNotice({ kind: 'none' });
    } catch (error) {
      setNotice({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  const isAnonymous = user?.isAnonymous ?? true;

  return (
    <div className="account-bar">
      <div className="account-bar__row">
        {isAnonymous ? (
          <>
            <span className="muted">Saved on this device only</span>
            <button type="button" onClick={handleLink} disabled={busy}>
              {busy ? 'Opening Google…' : 'Sign in to sync'}
            </button>
          </>
        ) : (
          <>
            <span className="account-bar__who">
              {user?.displayName ?? user?.email ?? 'Signed in'}
            </span>
            <button type="button" className="ghost" onClick={signOut} disabled={busy}>
              Sign out
            </button>
          </>
        )}
      </div>

      {notice.kind === 'credentialInUse' && (
        <div className="notice" role="alert">
          <p>
            That Google account already has choreos of its own. Signing into it keeps those, and
            the work on this device stays here, unsynced.
          </p>
          <div className="notice__actions">
            <button type="button" onClick={handleSwitch} disabled={busy}>
              Use that account
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setNotice({ kind: 'none' })}
              disabled={busy}
            >
              Stay on this device
            </button>
          </div>
        </div>
      )}

      {notice.kind === 'redirecting' && (
        <p className="notice" role="status">
          Your browser blocked the popup, so we’re redirecting to Google instead…
        </p>
      )}

      {notice.kind === 'error' && (
        <p className="notice notice--error" role="alert">
          {notice.message}
        </p>
      )}
    </div>
  );
}
