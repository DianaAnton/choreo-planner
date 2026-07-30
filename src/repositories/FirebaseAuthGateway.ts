import {
  type AuthCredential,
  type User,
  GoogleAuthProvider,
  linkWithPopup,
  linkWithRedirect,
  getRedirectResult,
  onIdTokenChanged,
  signInAnonymously,
  signInWithCredential,
  signOut as fbSignOut,
} from 'firebase/auth';

import { getFirebaseAuth } from '../lib/firebase';
import type { AuthGateway, AuthUser, LinkGoogleResult, Unsubscribe } from './types';

function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    isAnonymous: user.isAnonymous,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
  };
}

/** Firebase error codes we branch on. Anything else propagates. */
const CODE = {
  alreadyLinked: 'auth/provider-already-linked',
  credentialInUse: 'auth/credential-already-in-use',
  emailInUse: 'auth/email-already-in-use',
  popupBlocked: 'auth/popup-blocked',
  popupClosed: 'auth/popup-closed-by-user',
  cancelled: 'auth/cancelled-popup-request',
  operationNotSupported: 'auth/operation-not-supported-in-this-environment',
} as const;

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
}

export class FirebaseAuthGateway implements AuthGateway {
  /**
   * Held from a `credential-already-in-use` failure so the user can choose to
   * switch to that account afterwards. Cleared once consumed — a stale
   * credential would silently sign someone into the wrong account later.
   */
  #pendingCredential: AuthCredential | null = null;

  #redirectChecked = false;

  /**
   * De-duplicates concurrent sign-in attempts. React StrictMode invokes effects
   * twice in development, and two overlapping calls would each find no session
   * and each create an anonymous account — one of which immediately becomes
   * orphaned along with anything written under it.
   */
  #signIn: Promise<AuthUser> | null = null;

  /**
   * Deliberately `onIdTokenChanged`, not `onAuthStateChanged`.
   *
   * Linking Google to an anonymous account keeps the same uid, so the *auth
   * state* never changes and `onAuthStateChanged` stays silent — the UI would
   * keep showing "signed in anonymously" until the next page load. Linking does
   * mint a new ID token, which this fires on, along with sign-in and sign-out.
   */
  subscribe(onChange: (user: AuthUser | null) => void): Unsubscribe {
    return onIdTokenChanged(getFirebaseAuth(), (user) => {
      onChange(user ? toAuthUser(user) : null);
    });
  }

  ensureSignedIn(): Promise<AuthUser> {
    this.#signIn ??= this.#resolveSignIn().catch((error: unknown) => {
      // Don't cache a failure — a transient network error must not permanently
      // wedge the app into a signed-out state.
      this.#signIn = null;
      throw error;
    });
    return this.#signIn;
  }

  async #resolveSignIn(): Promise<AuthUser> {
    const auth = getFirebaseAuth();

    // Firebase restores a persisted session asynchronously, so `currentUser` is
    // null for the first moments after getAuth() even when an account exists.
    // Reading it before this resolves makes the anonymous sign-in below fire on
    // every page load, replacing the restored account with a fresh one — the
    // user's projects are still in Firestore, but under a uid nothing is
    // looking at any more. Covered by FirebaseAuthGateway.test.ts.
    await auth.authStateReady();

    // A redirect-based link (the popup-blocked fallback) completes on the next
    // page load, not in the call that started it. Drain it before deciding
    // whether an anonymous account is needed, or we would create a second one.
    if (!this.#redirectChecked) {
      this.#redirectChecked = true;
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) return toAuthUser(result.user);
      } catch (error) {
        if (errorCode(error) === CODE.credentialInUse) {
          this.#pendingCredential = GoogleAuthProvider.credentialFromError(
            error as Parameters<typeof GoogleAuthProvider.credentialFromError>[0],
          );
        }
        // Any other redirect failure is not fatal: fall through to anonymous
        // sign-in so the app still opens.
      }
    }

    if (auth.currentUser) return toAuthUser(auth.currentUser);

    const credential = await signInAnonymously(auth);
    return toAuthUser(credential.user);
  }

  async linkGoogle(): Promise<LinkGoogleResult> {
    const auth = getFirebaseAuth();
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;

    const provider = new GoogleAuthProvider();
    // Force the chooser: without it a browser with one Google session silently
    // links that account, which is surprising when it is the wrong one.
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const result = await linkWithPopup(user, provider);
      return { status: 'linked', user: toAuthUser(result.user) };
    } catch (error) {
      const code = errorCode(error);

      if (code === CODE.alreadyLinked) {
        return { status: 'alreadyLinked', user: toAuthUser(user) };
      }

      if (code === CODE.credentialInUse || code === CODE.emailInUse) {
        // Do not resolve this for them: linking here would mean discarding
        // either the local anonymous work or the remote account's data.
        this.#pendingCredential = GoogleAuthProvider.credentialFromError(
          error as Parameters<typeof GoogleAuthProvider.credentialFromError>[0],
        );
        return { status: 'credentialInUse' };
      }

      if (code === CODE.popupClosed || code === CODE.cancelled) {
        return { status: 'cancelled' };
      }

      // Popups are routinely blocked in iOS standalone PWAs — the studio case.
      if (code === CODE.popupBlocked || code === CODE.operationNotSupported) {
        await linkWithRedirect(user, provider);
        return { status: 'redirecting' };
      }

      throw error;
    }
  }

  async switchToGoogleAccount(): Promise<AuthUser> {
    const credential = this.#pendingCredential;
    if (!credential) {
      throw new Error('No pending Google credential — call linkGoogle() first.');
    }
    this.#pendingCredential = null;

    const result = await signInWithCredential(getFirebaseAuth(), credential);
    return toAuthUser(result.user);
  }

  async signOut(): Promise<void> {
    this.#pendingCredential = null;
    // Drop the memoised sign-in, or the next ensureSignedIn() would hand back
    // the account that was just signed out.
    this.#signIn = null;
    await fbSignOut(getFirebaseAuth());
  }
}
