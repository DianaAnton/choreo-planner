import {
  type DocumentData,
  type QueryDocumentSnapshot,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import {
  createInboxItem,
  createSession,
  createSkill,
  isStorableImage,
  skillFromInboxItem,
  touchesForSession,
  type DateKey,
  type InboxItem,
  type Session,
  type Skill,
  type SkillImage,
} from '../domain/training';
import type { Id } from '../domain/types';
import { getDb } from '../lib/firebase';
import type {
  NewInboxItem,
  NewSession,
  NewSkill,
  SkillPatch,
  TrainingRepository,
  Unsubscribe,
  UserSettings,
} from './types';

/**
 * Skills, sessions and the inbox, all under `users/{uid}` — ownership is the
 * document path, so there is no `where('ownerId', ...)` to keep in step with
 * the rules the way `projects` needs one.
 *
 * Sessions are a subcollection rather than an array on the user document. ADR
 * 0008's single-document argument depends on the data being bounded; training
 * history is not, so the same reasoning gives the opposite answer (ADR 0011 §7).
 *
 * Timestamps are client-side `Date.now()`, for the reason set out in
 * FirestoreProjectRepository: a `serverTimestamp()` reads back as null until
 * the write lands, and the studio case is offline.
 */
/** Firestore refuses a batch larger than this. The seed is well under it. */
const MAX_BATCH_WRITES = 500;

export class FirestoreTrainingRepository implements TrainingRepository {
  constructor(private readonly uid: string) {}

  #skills() {
    return collection(getDb(), 'users', this.uid, 'skills');
  }

  #sessions() {
    return collection(getDb(), 'users', this.uid, 'sessions');
  }

  #inbox() {
    return collection(getDb(), 'users', this.uid, 'inbox');
  }

  #settings() {
    return doc(getDb(), 'users', this.uid);
  }

  #images() {
    return collection(getDb(), 'users', this.uid, 'skillImages');
  }

  // --- Skills --------------------------------------------------------------

  subscribeSkills(
    discipline: string,
    onChange: (skills: Skill[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    // Matches the composite index in firestore.indexes.json. Changing the
    // fields or their order here means updating that file too, or the listener
    // fails with "the query requires an index" and the screen renders empty.
    const owned = query(this.#skills(), where('discipline', '==', discipline), orderBy('name'));

    return onSnapshot(
      owned,
      (snapshot) => onChange(snapshot.docs.map(toEntity<Skill>)),
      onError,
    );
  }

  async createSkill(input: NewSkill): Promise<Skill> {
    const ref = doc(this.#skills());
    const data = createSkill(input);

    await setDoc(ref, data);
    return { ...data, id: ref.id };
  }

  newSkillId(): Id {
    // `doc()` with no path mints an id locally — no round trip, works offline.
    return doc(this.#skills()).id;
  }

  async createSkills(inputs: readonly (NewSkill & { id: Id })[]): Promise<Skill[]> {
    if (inputs.length === 0) return [];
    if (inputs.length > MAX_BATCH_WRITES) {
      throw new Error(
        `${inputs.length} skills exceeds Firestore's ${MAX_BATCH_WRITES}-write batch limit.`,
      );
    }

    const batch = writeBatch(getDb());
    const created = inputs.map(({ id, ...input }) => {
      const data = createSkill(input);
      batch.set(doc(this.#skills(), id), data);
      return { ...data, id };
    });

    await batch.commit();
    return created;
  }

  async updateSkill(id: Id, patch: SkillPatch): Promise<void> {
    await updateDoc(doc(this.#skills(), id), patch);
  }

  async removeSkill(id: Id): Promise<void> {
    const batch = writeBatch(getDb());
    batch.delete(doc(this.#skills(), id));
    // Otherwise the picture outlives the skill and nothing will ever read it.
    batch.delete(doc(this.#images(), id));
    await batch.commit();
    // Dangling prerequisites are tolerated rather than swept: `unmetPrerequisites`
    // skips ids it cannot resolve, and a fan-out write on delete would be a
    // second failure mode for a case that resolves itself on the next edit.
  }

  subscribeSkillImage(
    skillId: Id,
    onChange: (image: SkillImage | null) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    return onSnapshot(
      doc(this.#images(), skillId),
      (snapshot) => onChange(snapshot.exists() ? (snapshot.data() as SkillImage) : null),
      onError,
    );
  }

  async setSkillImage(skillId: Id, dataUrl: string): Promise<void> {
    if (!isStorableImage(dataUrl)) {
      throw new Error('That image is too large to store.');
    }
    await setDoc(doc(this.#images(), skillId), { dataUrl, updatedAt: Date.now() });
  }

  async removeSkillImage(skillId: Id): Promise<void> {
    await deleteDoc(doc(this.#images(), skillId));
  }

  subscribeSettings(
    onChange: (settings: UserSettings) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    return onSnapshot(
      this.#settings(),
      (snapshot) => onChange(snapshot.exists() ? (snapshot.data() as UserSettings) : {}),
      onError,
    );
  }

  async setActiveDiscipline(disciplineId: string): Promise<void> {
    // Merge: the user document is shared with anything else that lands on it.
    await setDoc(this.#settings(), { activeDiscipline: disciplineId }, { merge: true });
  }

  // --- Sessions ------------------------------------------------------------

  subscribeSessions(
    sinceDate: DateKey,
    onChange: (sessions: Session[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    // Range and sort on the same field, so this needs only the single-field
    // index Firestore maintains automatically.
    const recent = query(
      this.#sessions(),
      where('date', '>=', sinceDate),
      orderBy('date', 'desc'),
    );

    return onSnapshot(
      recent,
      (snapshot) => onChange(snapshot.docs.map(toEntity<Session>)),
      onError,
    );
  }

  async logSession(input: NewSession, skills: readonly Skill[]): Promise<Session> {
    const ref = doc(this.#sessions());
    const data = createSession(input);
    const session: Session = { ...data, id: ref.id };

    // One batch: a session that recorded itself but failed to move any ladder
    // is the exact failure that makes a log untrustworthy. The cost is that a
    // skill deleted on another device since this list was subscribed takes the
    // whole write down — visible, retryable, and preferable to half of it
    // landing silently.
    const batch = writeBatch(getDb());
    batch.set(ref, data);

    for (const touch of touchesForSession(session, skills)) {
      batch.update(doc(this.#skills(), touch.id), {
        lastUsedAt: touch.lastUsedAt,
        ...(touch.metric ? { metric: touch.metric } : {}),
      });
    }

    await batch.commit();
    return session;
  }

  async removeSession(id: Id): Promise<void> {
    // Recency stays where it is — see InMemoryTrainingRepository.removeSession.
    await deleteDoc(doc(this.#sessions(), id));
  }

  // --- Inbox ---------------------------------------------------------------

  subscribeInbox(
    onChange: (items: InboxItem[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    // Resolved items are filtered in memory rather than in the query. The inbox
    // is small by design — anything else means it is being used as a to-do
    // list — and this keeps it off a second composite index.
    const captured = query(this.#inbox(), orderBy('createdAt', 'desc'));

    return onSnapshot(
      captured,
      (snapshot) =>
        onChange(
          snapshot.docs
            .map(toEntity<InboxItem>)
            .filter((item) => item.resolvedAt === undefined),
        ),
      onError,
    );
  }

  async addInboxItem(input: NewInboxItem): Promise<InboxItem> {
    const ref = doc(this.#inbox());
    const data = createInboxItem(input);

    await setDoc(ref, data);
    return { ...data, id: ref.id };
  }

  async promoteInboxItem(item: InboxItem, input: NewSkill): Promise<Skill> {
    const ref = doc(this.#skills());
    // Through the domain helper, so the captured link always survives as the
    // new skill's first ref — the whole reason the item was saved.
    const data = skillFromInboxItem(item, input);

    // Batched, so an item can never be marked handled without the skill it
    // became actually existing.
    const batch = writeBatch(getDb());
    batch.set(ref, data);
    batch.update(doc(this.#inbox(), item.id), { resolvedAt: Date.now() });
    await batch.commit();

    return { ...data, id: ref.id };
  }

  async removeInboxItem(id: Id): Promise<void> {
    await deleteDoc(doc(this.#inbox(), id));
  }
}

function toEntity<T extends { id: Id }>(snapshot: QueryDocumentSnapshot<DocumentData>): T {
  return { ...(snapshot.data() as Omit<T, 'id'>), id: snapshot.id } as T;
}
