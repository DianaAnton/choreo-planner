import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * These tests exist for one bug in particular: signing in anonymously before
 * Firebase has finished restoring the persisted session, which silently
 * abandons the user's real account on every page load. It presents as "my work
 * didn't save" even though the documents are sitting in Firestore untouched.
 */

interface MockUser {
  uid: string;
  isAnonymous: boolean;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

const mockAuth = {
  currentUser: null as MockUser | null,
  authStateReady: vi.fn(async () => {}),
};

const signInAnonymously = vi.fn<() => Promise<{ user: MockUser }>>();
const getRedirectResult = vi.fn<() => Promise<{ user: MockUser } | null>>(async () => null);
const onIdTokenChanged = vi.fn(() => () => {});

vi.mock('../lib/firebase', () => ({
  getFirebaseAuth: () => mockAuth,
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {
    static credentialFromError = vi.fn(() => null);
    setCustomParameters = vi.fn();
  },
  linkWithPopup: vi.fn(),
  linkWithRedirect: vi.fn(),
  signInWithCredential: vi.fn(),
  signOut: vi.fn(),
  get signInAnonymously() {
    return signInAnonymously;
  },
  get getRedirectResult() {
    return getRedirectResult;
  },
  get onIdTokenChanged() {
    return onIdTokenChanged;
  },
}));

const { FirebaseAuthGateway } = await import('./FirebaseAuthGateway');

const user = (uid: string, isAnonymous = true) => ({
  uid,
  isAnonymous,
  displayName: null,
  email: null,
  photoURL: null,
});

describe('FirebaseAuthGateway.subscribe', () => {
  it('listens for token changes, so linking Google updates the UI immediately', () => {
    // onAuthStateChanged does NOT fire on link (the uid is unchanged), which
    // left the account bar stale until the next page load.
    vi.clearAllMocks();
    new FirebaseAuthGateway().subscribe(() => {});
    expect(onIdTokenChanged).toHaveBeenCalledTimes(1);
  });
});

describe('FirebaseAuthGateway.ensureSignedIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.currentUser = null;
    mockAuth.authStateReady = vi.fn(async () => {});
    getRedirectResult.mockResolvedValue(null);
    signInAnonymously.mockResolvedValue({ user: user('new-anon') });
  });

  it('waits for the persisted session before deciding to sign in', async () => {
    // Mirrors real Firebase: currentUser is null until authStateReady resolves.
    mockAuth.authStateReady = vi.fn(async () => {
      mockAuth.currentUser = user('restored-uid', false);
    });

    const result = await new FirebaseAuthGateway().ensureSignedIn();

    expect(result.uid).toBe('restored-uid');
    // The whole point: no throwaway account gets created over the real one.
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('creates an anonymous account only when there genuinely is no session', async () => {
    const result = await new FirebaseAuthGateway().ensureSignedIn();

    expect(mockAuth.authStateReady).toHaveBeenCalled();
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    expect(result.uid).toBe('new-anon');
  });

  it('reuses the existing session on repeat calls', async () => {
    mockAuth.authStateReady = vi.fn(async () => {
      mockAuth.currentUser = user('stable-uid');
    });
    const gateway = new FirebaseAuthGateway();

    const first = await gateway.ensureSignedIn();
    const second = await gateway.ensureSignedIn();

    expect(first.uid).toBe(second.uid);
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('prefers a completed redirect sign-in over creating an anonymous account', async () => {
    // The popup-blocked fallback finishes on the next page load; missing it
    // would strand the user on a new anonymous account instead.
    getRedirectResult.mockResolvedValue({ user: user('redirected-uid', false) });

    const result = await new FirebaseAuthGateway().ensureSignedIn();

    expect(result.uid).toBe('redirected-uid');
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('still opens the app when the redirect check fails', async () => {
    getRedirectResult.mockRejectedValue(new Error('network'));

    const result = await new FirebaseAuthGateway().ensureSignedIn();

    expect(result.uid).toBe('new-anon');
  });

  it('creates one account when called twice concurrently', async () => {
    // React StrictMode double-invokes effects in development. Two overlapping
    // calls previously produced two anonymous accounts milliseconds apart, one
    // of which was immediately orphaned.
    const gateway = new FirebaseAuthGateway();
    const [a, b] = await Promise.all([gateway.ensureSignedIn(), gateway.ensureSignedIn()]);

    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    expect(a.uid).toBe(b.uid);
  });

  it('does not cache a failed sign-in', async () => {
    signInAnonymously.mockRejectedValueOnce(new Error('offline'));
    const gateway = new FirebaseAuthGateway();

    await expect(gateway.ensureSignedIn()).rejects.toThrow('offline');
    // A transient failure must not wedge the app signed-out forever.
    await expect(gateway.ensureSignedIn()).resolves.toMatchObject({ uid: 'new-anon' });
  });

  it('checks the redirect result only once per session', async () => {
    const gateway = new FirebaseAuthGateway();
    await gateway.ensureSignedIn();
    // signOut clears the memoised sign-in, so this genuinely re-runs the
    // sign-in path rather than returning the cached promise.
    await gateway.signOut();
    mockAuth.currentUser = null;
    await gateway.ensureSignedIn();

    expect(signInAnonymously).toHaveBeenCalledTimes(2);
    expect(getRedirectResult).toHaveBeenCalledTimes(1);
  });
});
