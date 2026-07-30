import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import type { AuthGateway, AuthUser, LinkGoogleResult } from '../../repositories/types';
import { AuthContext, type AuthState } from './AuthContext';

interface Props {
  /** Injected by the composition root so this feature never imports Firebase. */
  gateway: AuthGateway;
  children: ReactNode;
}

export function AuthProvider({ gateway, children }: Props) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('starting');
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Subscribe before signing in, so the account that sign-in produces arrives
    // through the same path as any later change and there is one source of truth.
    const unsubscribe = gateway.subscribe((next) => {
      if (cancelled) return;
      setUser(next);
      if (next) setStatus('ready');
    });

    gateway.ensureSignedIn().catch((cause: unknown) => {
      if (cancelled) return;
      setError(cause instanceof Error ? cause : new Error(String(cause)));
      setStatus('error');
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [gateway]);

  const linkGoogle = useCallback(async (): Promise<LinkGoogleResult> => {
    const result = await gateway.linkGoogle();
    // Apply the result directly rather than waiting for the token-change
    // subscription to catch up: the button should stop saying "Sign in" the
    // moment the popup closes, not a tick later.
    if (result.status === 'linked' || result.status === 'alreadyLinked') {
      setUser(result.user);
    }
    return result;
  }, [gateway]);

  const switchToGoogleAccount = useCallback(async () => {
    setUser(await gateway.switchToGoogleAccount());
  }, [gateway]);

  const signOut = useCallback(async () => {
    await gateway.signOut();
    // Signing out drops us back to no account at all; the provider immediately
    // creates a fresh anonymous one so the app stays usable.
    setStatus('starting');
    await gateway.ensureSignedIn();
  }, [gateway]);

  const value = useMemo<AuthState>(
    () => ({ status, user, error, linkGoogle, switchToGoogleAccount, signOut }),
    [status, user, error, linkGoogle, switchToGoogleAccount, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
