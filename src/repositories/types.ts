/**
 * Persistence and identity interfaces. Feature code depends on these, never on
 * Firebase — that rule is what keeps the app testable offline and the storage
 * decision reversible. See docs/AGENTS.md.
 */

import type {
  DateKey,
  InboxItem,
  NewSessionInput,
  NewSkillInput,
  Session,
  Skill,
} from '../domain/training';
import type { AudioMeta, Id, Project, ProjectSummary } from '../domain/types';

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

// --- Training ---------------------------------------------------------------

/** The repository builds the document; the domain decides what a valid one is. */
export type NewSkill = NewSkillInput;
export type NewSession = NewSessionInput;
export interface NewInboxItem {
  url: string;
  note?: string;
}

/** `id` and `createdAt` are set once, at creation, and never patched. */
export type SkillPatch = Partial<Omit<Skill, 'id' | 'createdAt'>>;

/**
 * Skills, sessions and the capture inbox — all under `users/{uid}`, all
 * private. Subsumes the `PresetRepository` this used to be: a preset is a
 * skill now, one entity behind two surfaces (ADR 0011 §1).
 */
export interface TrainingRepository {
  /**
   * Live, because the skill list is what every training screen renders and a
   * phone next to the pole should reflect an edit made on the laptop.
   */
  subscribeSkills(
    discipline: string,
    onChange: (skills: Skill[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;
  createSkill(input: NewSkill): Promise<Skill>;
  updateSkill(id: Id, patch: SkillPatch): Promise<void>;
  removeSkill(id: Id): Promise<void>;

  /**
   * History from `sinceDate` forward. Sessions accumulate without bound, so
   * nothing ever asks for all of them — the screens want this week and one
   * skill's recent history, not a lifetime.
   */
  subscribeSessions(
    sinceDate: DateKey,
    onChange: (sessions: Session[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;

  /**
   * Writes the session *and* the recency bumps and metric bests it implies, in
   * one batch. `skills` is passed in rather than re-read: the caller already
   * holds the live list, and `touchesForSession` in `domain/training.ts` is the
   * single definition of what a logged session does.
   */
  logSession(input: NewSession, skills: readonly Skill[]): Promise<Session>;
  removeSession(id: Id): Promise<void>;

  subscribeInbox(
    onChange: (items: InboxItem[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;
  addInboxItem(input: NewInboxItem): Promise<InboxItem>;
  /** Creates the skill and resolves the item together — never one without the other. */
  promoteInboxItem(item: InboxItem, input: NewSkill): Promise<Skill>;
  removeInboxItem(id: Id): Promise<void>;
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
