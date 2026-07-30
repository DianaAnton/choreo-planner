/**
 * Persistence and identity interfaces. Feature code depends on these, never on
 * Firebase — that rule is what keeps the app testable offline and the storage
 * decision reversible. See docs/AGENTS.md.
 */

import type { AudioMeta, Id, Project, ProjectSummary, ShapePreset } from '../domain/types';

export type Unsubscribe = () => void;

export interface NewProject {
  title: string;
  artist?: string;
  discipline: string;
  bpm: number;
}

/** Partial update; `id`, `ownerId`, `members` and `schemaVersion` are not client-writable. */
export type ProjectPatch = Partial<
  Omit<Project, 'id' | 'ownerId' | 'members' | 'schemaVersion' | 'createdAt'>
>;

export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  /**
   * Live list for the current user. The project list is the screen most likely
   * to be open on a laptop while a phone edits the same account, so it streams
   * rather than polling.
   */
  subscribeList(
    onChange: (projects: ProjectSummary[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;
  get(id: Id): Promise<Project | null>;
  subscribe(id: Id, onChange: (project: Project | null) => void): Unsubscribe;
  create(input: NewProject): Promise<Project>;
  update(id: Id, patch: ProjectPatch): Promise<void>;
  remove(id: Id): Promise<void>;
}

export interface PresetRepository {
  list(discipline: string): Promise<ShapePreset[]>;
  subscribe(discipline: string, onChange: (presets: ShapePreset[]) => void): Unsubscribe;
  create(input: Omit<ShapePreset, 'id' | 'createdAt'>): Promise<ShapePreset>;
  update(id: Id, patch: Partial<ShapePreset>): Promise<void>;
  remove(id: Id): Promise<void>;
}

/**
 * Device-local audio cache. There is deliberately no cloud implementation of
 * this interface and there must never be one — audio is copyrighted and
 * user-supplied (ADR 0005).
 */
export interface AudioStore {
  /** Keyed by project id, so re-opening a project finds its song. */
  put(projectId: Id, file: File): Promise<AudioMeta>;
  get(projectId: Id): Promise<File | null>;
  forget(projectId: Id): Promise<void>;
  /** Whether this browser can persist a file handle rather than copying bytes. */
  supportsHandles(): boolean;
}

// --- Identity --------------------------------------------------------------

/**
 * A framework-free view of the signed-in user. Deliberately not Firebase's
 * `User`: features render this, and swapping the auth provider should not
 * ripple into components.
 */
export interface AuthUser {
  uid: string;
  isAnonymous: boolean;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

/**
 * Outcome of trying to attach Google to the current anonymous account.
 *
 * `credentialInUse` is the case that matters: that Google account already owns
 * data elsewhere, so linking would have to discard one side. We never choose
 * for the user — see ADR 0003.
 */
export type LinkGoogleResult =
  | { status: 'linked'; user: AuthUser }
  | { status: 'alreadyLinked'; user: AuthUser }
  | { status: 'credentialInUse' }
  | { status: 'redirecting' }
  | { status: 'cancelled' };

export interface AuthGateway {
  /**
   * Current user, streamed. Emits `null` until the first sign-in resolves, so
   * callers can distinguish "still starting up" from "signed out".
   */
  subscribe(onChange: (user: AuthUser | null) => void): Unsubscribe;
  /** Silent anonymous sign-in. Safe to call repeatedly; resolves to the existing user. */
  ensureSignedIn(): Promise<AuthUser>;
  /** Upgrade the anonymous account to Google in place, preserving the uid. */
  linkGoogle(): Promise<LinkGoogleResult>;
  /**
   * Abandon the local anonymous account and sign in as the Google account that
   * already holds data. Only meaningful after `credentialInUse`.
   */
  switchToGoogleAccount(): Promise<AuthUser>;
  signOut(): Promise<void>;
}
