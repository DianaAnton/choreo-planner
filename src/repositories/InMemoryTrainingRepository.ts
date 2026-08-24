import {
  createInboxItem,
  createSession,
  createSkill,
  skillFromInboxItem,
  touchesForSession,
  type InboxItem,
  type Session,
  type Skill,
} from '../domain/training';
import type { DateKey } from '../domain/training';
import type { Id } from '../domain/types';
import type {
  NewInboxItem,
  NewSession,
  NewSkill,
  SkillPatch,
  TrainingRepository,
  Unsubscribe,
} from './types';

/**
 * Test double and offline development target. Mirrors the Firestore
 * implementation's observable behaviour — ordering, live updates, and the fact
 * that logging a session also touches the skills it names — so tests written
 * against it stay honest.
 */
export class InMemoryTrainingRepository implements TrainingRepository {
  #skills = new Map<Id, Skill>();
  #sessions = new Map<Id, Session>();
  #inbox = new Map<Id, InboxItem>();

  #skillListeners = new Set<{ discipline: string; notify: (skills: Skill[]) => void }>();
  #sessionListeners = new Set<{ since: DateKey; notify: (sessions: Session[]) => void }>();
  #inboxListeners = new Set<(items: InboxItem[]) => void>();

  #nextId = 1;

  constructor(private readonly clock: () => number = Date.now) {}

  #id(prefix: string): Id {
    return `${prefix}${this.#nextId++}`;
  }

  // --- Skills --------------------------------------------------------------

  #skillsFor(discipline: string): Skill[] {
    return [...this.#skills.values()]
      .filter((skill) => skill.discipline === discipline)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  #emitSkills(): void {
    for (const listener of this.#skillListeners) {
      listener.notify(this.#skillsFor(listener.discipline));
    }
  }

  subscribeSkills(discipline: string, onChange: (skills: Skill[]) => void): Unsubscribe {
    const listener = { discipline, notify: onChange };
    this.#skillListeners.add(listener);
    onChange(this.#skillsFor(discipline));
    return () => this.#skillListeners.delete(listener);
  }

  #putSkill(built: Omit<Skill, 'id'>): Skill {
    const id = this.#id('sk');
    const skill: Skill = { ...built, id };

    this.#skills.set(id, skill);
    this.#emitSkills();
    return skill;
  }

  async createSkill(input: NewSkill): Promise<Skill> {
    return this.#putSkill(createSkill(input, this.clock()));
  }

  newSkillId(): Id {
    return this.#id('sk');
  }

  async createSkills(inputs: readonly (NewSkill & { id: Id })[]): Promise<Skill[]> {
    const created = inputs.map(({ id, ...input }) => {
      const skill: Skill = { ...createSkill(input, this.clock()), id };
      this.#skills.set(id, skill);
      return skill;
    });

    // One emit, not one per skill: the Firestore batch lands as a single
    // snapshot, and a test that saw thirty would be testing a fiction.
    this.#emitSkills();
    return created;
  }

  async updateSkill(id: Id, patch: SkillPatch): Promise<void> {
    const existing = this.#skills.get(id);
    if (!existing) throw new Error(`No skill ${id}`);

    this.#skills.set(id, { ...existing, ...patch });
    this.#emitSkills();
  }

  async removeSkill(id: Id): Promise<void> {
    this.#skills.delete(id);
    // A deleted skill must not linger as a dangling prerequisite on another.
    for (const [otherId, skill] of this.#skills) {
      if (skill.requires.includes(id)) {
        this.#skills.set(otherId, {
          ...skill,
          requires: skill.requires.filter((r) => r !== id),
        });
      }
    }
    this.#emitSkills();
  }

  // --- Sessions ------------------------------------------------------------

  #sessionsSince(since: DateKey): Session[] {
    return [...this.#sessions.values()]
      .filter((session) => session.date >= since)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  #emitSessions(): void {
    for (const listener of this.#sessionListeners) {
      listener.notify(this.#sessionsSince(listener.since));
    }
  }

  subscribeSessions(sinceDate: DateKey, onChange: (sessions: Session[]) => void): Unsubscribe {
    const listener = { since: sinceDate, notify: onChange };
    this.#sessionListeners.add(listener);
    onChange(this.#sessionsSince(sinceDate));
    return () => this.#sessionListeners.delete(listener);
  }

  async logSession(input: NewSession, skills: readonly Skill[]): Promise<Session> {
    const id = this.#id('se');
    const session: Session = { ...createSession(input), id };

    this.#sessions.set(id, session);

    for (const touch of touchesForSession(session, skills)) {
      const existing = this.#skills.get(touch.id);
      if (!existing) continue;
      this.#skills.set(touch.id, {
        ...existing,
        lastUsedAt: touch.lastUsedAt,
        ...(touch.metric ? { metric: touch.metric } : {}),
      });
    }

    this.#emitSessions();
    this.#emitSkills();
    return session;
  }

  async removeSession(id: Id): Promise<void> {
    // Recency is deliberately left where it was. Deleting a mistyped entry
    // should not resurrect a six-week staleness flag on everything it touched.
    this.#sessions.delete(id);
    this.#emitSessions();
  }

  // --- Inbox ---------------------------------------------------------------

  #openInbox(): InboxItem[] {
    return [...this.#inbox.values()]
      .filter((item) => item.resolvedAt === undefined)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  #emitInbox(): void {
    for (const listener of this.#inboxListeners) listener(this.#openInbox());
  }

  subscribeInbox(onChange: (items: InboxItem[]) => void): Unsubscribe {
    this.#inboxListeners.add(onChange);
    onChange(this.#openInbox());
    return () => this.#inboxListeners.delete(onChange);
  }

  async addInboxItem(input: NewInboxItem): Promise<InboxItem> {
    const id = this.#id('in');
    const item: InboxItem = { ...createInboxItem(input, this.clock()), id };

    this.#inbox.set(id, item);
    this.#emitInbox();
    return item;
  }

  async promoteInboxItem(item: InboxItem, input: NewSkill): Promise<Skill> {
    // Through the domain helper, so the captured link always survives as the
    // new skill's first ref — the whole reason the item was saved.
    const skill = this.#putSkill(skillFromInboxItem(item, input, this.clock()));

    const stored = this.#inbox.get(item.id);
    if (stored) this.#inbox.set(item.id, { ...stored, resolvedAt: this.clock() });
    this.#emitInbox();

    return skill;
  }

  async removeInboxItem(id: Id): Promise<void> {
    this.#inbox.delete(id);
    this.#emitInbox();
  }
}
