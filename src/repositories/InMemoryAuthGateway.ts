import type { AuthGateway, AuthUser, LinkGoogleResult, Unsubscribe } from './types';

/**
 * Test double. Also handy for developing UI without touching Firebase at all —
 * the reason the AuthGateway port exists.
 */
export class InMemoryAuthGateway implements AuthGateway {
  #user: AuthUser | null = null;
  #listeners = new Set<(user: AuthUser | null) => void>();

  /** Scripted outcome for the next linkGoogle() call. */
  nextLinkResult: LinkGoogleResult['status'] = 'linked';

  constructor(private readonly uid = 'test-uid') {}

  subscribe(onChange: (user: AuthUser | null) => void): Unsubscribe {
    this.#listeners.add(onChange);
    onChange(this.#user);
    return () => this.#listeners.delete(onChange);
  }

  #emit(): void {
    for (const listener of this.#listeners) listener(this.#user);
  }

  async ensureSignedIn(): Promise<AuthUser> {
    this.#user ??= {
      uid: this.uid,
      isAnonymous: true,
      displayName: null,
      email: null,
      photoURL: null,
    };
    this.#emit();
    return this.#user;
  }

  async linkGoogle(): Promise<LinkGoogleResult> {
    const user = await this.ensureSignedIn();

    switch (this.nextLinkResult) {
      case 'linked': {
        // uid is preserved on link — that is the whole point of the flow.
        this.#user = {
          ...user,
          isAnonymous: false,
          displayName: 'Test User',
          email: 'test@example.com',
        };
        this.#emit();
        return { status: 'linked', user: this.#user };
      }
      case 'alreadyLinked':
        return { status: 'alreadyLinked', user };
      case 'credentialInUse':
        return { status: 'credentialInUse' };
      case 'redirecting':
        return { status: 'redirecting' };
      case 'cancelled':
        return { status: 'cancelled' };
    }
  }

  async switchToGoogleAccount(): Promise<AuthUser> {
    this.#user = {
      uid: 'existing-google-uid',
      isAnonymous: false,
      displayName: 'Existing User',
      email: 'existing@example.com',
      photoURL: null,
    };
    this.#emit();
    return this.#user;
  }

  async signOut(): Promise<void> {
    this.#user = null;
    this.#emit();
  }
}
