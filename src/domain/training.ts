/**
 * The training layer's domain: skills, sessions, the ladder, and the rules
 * that decide what you are allowed to work on. Pure TypeScript — no React, no
 * Firebase, no DOM. See docs/decisions/0011-training-layer.md for the argument.
 *
 * These rules are functions rather than checks inside components on purpose. A
 * WIP cap a screen can forget to apply is not a cap, and the whole mechanism is
 * the cap.
 */

import type { Id } from './types';

// --- The ladder ------------------------------------------------------------

/**
 * Ordinal, low to high. Stored as the string; compared through `ladderIndex`
 * so the ordering lives here and not in whichever component last needed it.
 */
export const LADDER = [
  'wantIt',
  'drilling',
  'uglyRep',
  'cleanRep',
  'filmed',
  'inChoreo',
] as const;

export type LadderState = (typeof LADDER)[number];

export const FIRST_LADDER_STATE: LadderState = 'wantIt';

/**
 * Short enough to fit a meter segment on a phone.
 *
 * `inChoreo` is the one rung whose default wording assumes pole; disciplines
 * override it through `DisciplineProfile.ladderLabels`. The *ordinal* is
 * universal — want it, drilling, ugly, clean, filmed, used for real — which is
 * why the ladder itself needed no change to hold skateboarding.
 */
export const LADDER_LABELS: Record<LadderState, string> = {
  wantIt: 'Want it',
  drilling: 'Drilling',
  uglyRep: 'Ugly rep',
  cleanRep: 'Clean rep',
  filmed: 'Filmed',
  inChoreo: 'In choreo',
};

/**
 * What each rung actually means, so the ladder is a shared definition rather
 * than six words you have to reinterpret every time. `cleanRep` is the one
 * with an objective test — see `holdsForBar` and ADR 0011 §6.
 */
export const LADDER_DESCRIPTIONS: Record<LadderState, string> = {
  wantIt: 'On the list. Not attempted yet.',
  drilling: 'Working the entry. No hold yet.',
  uglyRep: 'You can get into it. It is not pretty and it is not reliable.',
  cleanRep: 'Held for the bar it would occupy, on both sides where that applies.',
  filmed: 'Filmed and watched back. What you feel and what it looks like agree.',
  inChoreo: 'Used in a choreo, in time, without thinking about it.',
};

export function ladderIndex(state: LadderState): number {
  return LADDER.indexOf(state);
}

export function isLadderAtLeast(state: LadderState, minimum: LadderState): boolean {
  return ladderIndex(state) >= ladderIndex(minimum);
}

/** Next rung up, clamped at the top — `inChoreo` is terminal. */
export function advanceLadder(state: LadderState): LadderState {
  return LADDER[Math.min(ladderIndex(state) + 1, LADDER.length - 1)] ?? state;
}

/** Down a rung, clamped at the bottom. Progress is not always one-way. */
export function retreatLadder(state: LadderState): LadderState {
  return LADDER[Math.max(ladderIndex(state) - 1, 0)] ?? state;
}

/**
 * The lowest state in a set — a section's readiness is this over the skills its
 * shapes reference (ADR 0011 §5). Derived on read, never stored.
 */
export function lowestLadder(states: readonly LadderState[]): LadderState | null {
  let lowest: LadderState | null = null;
  for (const state of states) {
    if (lowest === null || ladderIndex(state) < ladderIndex(lowest)) lowest = state;
  }
  return lowest;
}

/**
 * The hold test for `cleanRep`: can you hold it for the bar it occupies? The
 * threshold comes from the discipline's `CleanRepTest`, so the planner and the
 * tracker share one definition of done.
 *
 * Only meaningful where holding is the measure — see `meetsConsistency` in
 * `domain/discipline.ts` for disciplines where landing it is.
 */
export function holdsForBar(heldMs: number, barDurationMs: number, minHoldMs: number): boolean {
  return heldMs >= Math.max(barDurationMs, minHoldMs);
}

// --- Entities --------------------------------------------------------------

/**
 * Two kinds of training, because two kinds exist. A quest is finite and has a
 * terminal state; practice is maintenance and has none. The WIP cap governs
 * quests only — conditioning must not compete for the same three slots.
 *
 * Mutable: a handstand may start as practice and become a quest.
 */
export type SkillKind = 'quest' | 'practice';

export const SKILL_KIND_LABELS: Record<SkillKind, string> = {
  quest: 'Quest',
  practice: 'Practice',
};

export interface Checkpoint {
  id: Id;
  text: string;
  /** Timestamp when ticked, null while open. Ordered; first open one is next. */
  doneAt: number | null;
}

export interface SkillRef {
  /** External reference. Link out; never copy a third party's content. */
  url: string;
  /** Why this link is here — the thing to actually watch for. */
  note?: string;
}

/** Progression for things a ladder cannot express: a hold time, a rep count. */
export interface SkillMetric {
  unit: 'seconds' | 'reps';
  best: number;
  bestAt: number;
}

export interface Skill {
  id: Id;
  name: string;
  kind: SkillKind;
  /** Free-form, seeded from DisciplineProfile.defaultCategories. */
  category?: string;
  discipline: string;
  notes?: string;
  refs: SkillRef[];

  /**
   * Quest only. Retained when a quest is switched to practice, so flipping the
   * kind back does not silently erase months of progress.
   */
  ladder?: LadderState;
  checkpoints: Checkpoint[];
  isActive: boolean;

  /** Practice only. */
  metric?: SkillMetric;

  /** Optional prerequisite chain, e.g. the road to a named goal. */
  requires: Id[];

  /**
   * Manual slot within the node's band on the map, set by dragging.
   *
   * Only the horizontal position is yours to choose: which band a skill sits in
   * is derived from `requires`, and letting a node be dragged above its own
   * prerequisite would make the picture lie. Absent means "wherever the
   * crossing-reduction pass puts it".
   */
  mapOrder?: number;

  createdAt: number;
  lastUsedAt?: number;
}

/** How the session felt. Three options, because five is a decision. */
export const FELT_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Rough',
  2: 'Fine',
  3: 'Good',
};

export interface Session {
  id: Id;
  /** Local calendar date, YYYY-MM-DD — not a timestamp. Sessions are days. */
  date: DateKey;
  durationMin: number;
  felt: 1 | 2 | 3;
  skillIds: Id[];
  /** Per-skill numbers logged this session, for practice metrics. */
  marks?: Record<Id, number>;
  note?: string;
}

/**
 * A picture of the move, stored on its own document rather than on the skill.
 *
 * The skills query loads every skill on every training screen; thirty images
 * embedded in it would be megabytes on mobile data before anything renders.
 * This is read only when a skill is opened.
 *
 * Downscaled on the device to a JPEG data URL. Firestore's document limit is
 * 1 MB and base64 costs about a third on top, so the cap below leaves room to
 * spare — this is for recognising a shape, not for judging your line.
 */
export interface SkillImage {
  /** `data:image/jpeg;base64,…` */
  dataUrl: string;
  updatedAt: number;
}

/** Longest edge, in pixels, after downscaling. */
export const MAX_IMAGE_EDGE = 400;

/** Cap on the stored string, not the original file. */
export const MAX_IMAGE_BYTES = 150_000;

export function isStorableImage(dataUrl: string): boolean {
  return (
    dataUrl.startsWith('data:image/') &&
    dataUrl.length <= MAX_IMAGE_BYTES
  );
}

export interface InboxItem {
  id: Id;
  url: string;
  note?: string;
  createdAt: number;
  resolvedAt?: number;
}

// --- The rules that are the point ------------------------------------------

/**
 * Three, and only quests count. The number is arbitrary; having one is not.
 */
export const MAX_ACTIVE_QUESTS = 3;

/** Six weeks. Long enough that a holiday doesn't flag everything you own. */
export const STALE_AFTER_DAYS = 42;

/**
 * Staleness only applies from here up. A quest sitting at `wantIt` for six
 * weeks isn't rusty — you never had it. `cleanRep` is the first rung with
 * something to lose.
 */
export const STALE_FROM_LADDER: LadderState = 'cleanRep';

/**
 * A prerequisite counts as met at `cleanRep` — the same rung, for a different
 * reason: it is the first state with an objective test behind it, so "is the
 * thing before this one actually there?" has an answer you cannot argue with.
 */
export const PREREQUISITE_MET_AT: LadderState = 'cleanRep';

/** Twice a week. A target to measure against, not a streak to protect. */
export const DEFAULT_WEEKLY_SESSION_TARGET = 2;

export const MAX_SESSION_MINUTES = 480;
export const MAX_SKILL_NAME_LENGTH = 80;
export const MAX_NOTE_LENGTH = 280;

// --- Calendar --------------------------------------------------------------

/** `YYYY-MM-DD`. A calendar date, deliberately not a timestamp. */
export type DateKey = string;

const DAY_MS = 86_400_000;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Monday. Sunday-start weeks are a preference; this is the default. */
export const WEEK_STARTS_ON = 1;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Date keys are arithmetic'd as UTC midnight rather than local time. A calendar
 * date has no timezone, and treating it as local would make "seven days later"
 * wrong twice a year at a DST boundary.
 */
export function dateKeyToUtcMs(key: DateKey): number {
  const match = DATE_KEY_PATTERN.exec(key);
  if (!match) return Number.NaN;

  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function utcKeyOf(ms: number): DateKey {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Local getters on purpose: "today" is the dancer's today, not UTC's. */
export function dateKeyOf(date: Date): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(now: Date = new Date()): DateKey {
  return dateKeyOf(now);
}

/** Round-trips through the calendar, so `2026-02-31` fails rather than sliding. */
export function isDateKey(value: string): boolean {
  const ms = dateKeyToUtcMs(value);
  return Number.isFinite(ms) && utcKeyOf(ms) === value;
}

export function addDays(key: DateKey, days: number): DateKey {
  return utcKeyOf(dateKeyToUtcMs(key) + days * DAY_MS);
}

export function daysBetweenKeys(from: DateKey, to: DateKey): number {
  return Math.round((dateKeyToUtcMs(to) - dateKeyToUtcMs(from)) / DAY_MS);
}

export function startOfWeek(key: DateKey, weekStartsOn: number = WEEK_STARTS_ON): DateKey {
  const dayOfWeek = new Date(dateKeyToUtcMs(key)).getUTCDay();
  const daysIntoWeek = (((dayOfWeek - weekStartsOn) % 7) + 7) % 7;
  return addDays(key, -daysIntoWeek);
}

export function isSameWeek(
  a: DateKey,
  b: DateKey,
  weekStartsOn: number = WEEK_STARTS_ON,
): boolean {
  return startOfWeek(a, weekStartsOn) === startOfWeek(b, weekStartsOn);
}

/**
 * A timestamp for a session's day, pinned to midday UTC so no timezone can push
 * it onto the day before or after. Used for recency, never for display.
 */
export function sessionTimeMs(session: Pick<Session, 'date'>): number {
  return dateKeyToUtcMs(session.date) + DAY_MS / 2;
}

// --- Reading a skill -------------------------------------------------------

export function isQuest(skill: Skill): boolean {
  return skill.kind === 'quest';
}

export function isPractice(skill: Skill): boolean {
  return skill.kind === 'practice';
}

/** A quest's ladder, defaulting for a practice skill that has never had one. */
export function ladderOf(skill: Skill): LadderState {
  return skill.ladder ?? FIRST_LADDER_STATE;
}

export function activeQuests(skills: readonly Skill[]): Skill[] {
  return skills.filter((skill) => isQuest(skill) && skill.isActive);
}

export function openCheckpoints(skill: Skill): Checkpoint[] {
  return skill.checkpoints.filter((checkpoint) => checkpoint.doneAt === null);
}

/** The one thing to do next. Checkpoints are ordered; the first open one wins. */
export function nextCheckpoint(skill: Skill): Checkpoint | null {
  return skill.checkpoints.find((checkpoint) => checkpoint.doneAt === null) ?? null;
}

export function checkpointProgress(skill: Skill): { done: number; total: number } {
  const total = skill.checkpoints.length;
  return { done: total - openCheckpoints(skill).length, total };
}

// --- The WIP cap -----------------------------------------------------------

export type ActivationRefusal =
  'notAQuest' | 'alreadyActive' | 'wipCapReached' | 'noOpenCheckpoint';

export type ActivationCheck =
  { ok: true } | { ok: false; reason: ActivationRefusal; message: string };

/**
 * Whether a quest may be made active. Both refusals are load-bearing:
 *
 * - The cap is the entire mechanism. Four active quests is the state this was
 *   built to prevent.
 * - Requiring an open checkpoint is what stops a quest being a wish. "Ayesha"
 *   is not a plan; "hold a straight-arm handspring for 5 s" is.
 *
 * Practice skills are uncapped and never activate — they are always available.
 */
export function canActivateQuest(skill: Skill, allSkills: readonly Skill[]): ActivationCheck {
  if (!isQuest(skill)) {
    return {
      ok: false,
      reason: 'notAQuest',
      message: 'Practice skills are always available — there is nothing to activate.',
    };
  }

  if (skill.isActive) {
    return { ok: false, reason: 'alreadyActive', message: 'Already active.' };
  }

  const active = activeQuests(allSkills).filter((other) => other.id !== skill.id);
  if (active.length >= MAX_ACTIVE_QUESTS) {
    return {
      ok: false,
      reason: 'wipCapReached',
      message:
        `${MAX_ACTIVE_QUESTS} quests are already active (${active.map((q) => q.name).join(', ')}). ` +
        'Finish or park one first.',
    };
  }

  if (openCheckpoints(skill).length === 0) {
    return {
      ok: false,
      reason: 'noOpenCheckpoint',
      message: 'Add a checkpoint first — something you could tick this week.',
    };
  }

  return { ok: true };
}

export function activeQuestSlotsLeft(skills: readonly Skill[]): number {
  return Math.max(0, MAX_ACTIVE_QUESTS - activeQuests(skills).length);
}

/**
 * Whether a captured idea may become a quest right now.
 *
 * The cap blocks *promotion*, not just activation. A new quest parked as
 * inactive would satisfy the letter of the cap and defeat its purpose: the
 * inbox is precisely where "a shinier one on Thursday" enters, and admitting it
 * only moves the pile somewhere the cap cannot see.
 *
 * Practice is uncapped, so promoting to practice is always allowed.
 */
export function canPromoteToKind(kind: SkillKind, skills: readonly Skill[]): ActivationCheck {
  if (kind === 'practice') return { ok: true };

  const active = activeQuests(skills);
  if (active.length >= MAX_ACTIVE_QUESTS) {
    return {
      ok: false,
      reason: 'wipCapReached',
      message:
        `${MAX_ACTIVE_QUESTS} quests are already active (${active.map((q) => q.name).join(', ')}). ` +
        'Park one, or save this as practice instead.',
    };
  }

  return { ok: true };
}

/** Prerequisites not yet at `cleanRep` — the reason a goal is still out of reach. */
export function unmetPrerequisites(skill: Skill, byId: ReadonlyMap<Id, Skill>): Skill[] {
  return skill.requires
    .map((id) => byId.get(id))
    .filter((required): required is Skill => required !== undefined)
    .filter((required) => !isLadderAtLeast(ladderOf(required), PREREQUISITE_MET_AT));
}

// --- Staleness -------------------------------------------------------------

/**
 * Days since this skill was last trained; null when it never has been. Clamped
 * at zero, because `sessionTimeMs` puts today's session at midday UTC, which
 * can sit fractionally ahead of `now`.
 */
export function daysSinceUsed(skill: Skill, now: number = Date.now()): number | null {
  if (skill.lastUsedAt === undefined) return null;
  return Math.max(0, Math.floor((now - skill.lastUsedAt) / DAY_MS));
}

/**
 * Flagged as rusty. Never-trained is not stale — it is new, which is a
 * different problem and a different part of the screen.
 *
 * Quests only decay from `cleanRep` up. Practice skills have no ladder, so
 * recency is the whole signal; that is exactly what makes them a menu.
 */
export function isStale(skill: Skill, now: number = Date.now()): boolean {
  const days = daysSinceUsed(skill, now);
  if (days === null || days < STALE_AFTER_DAYS) return false;
  if (!isQuest(skill)) return true;
  return isLadderAtLeast(ladderOf(skill), STALE_FROM_LADDER);
}

/**
 * Sort key for the practice menu, high first. Never-trained sorts to the top:
 * on a "ten minutes spare" list, the thing you have never done is the most
 * interesting thing on it.
 */
export function stalenessRank(skill: Skill, now: number = Date.now()): number {
  return daysSinceUsed(skill, now) ?? Number.POSITIVE_INFINITY;
}

function byStaleness(now: number) {
  return (a: Skill, b: Skill): number => {
    const difference = stalenessRank(b, now) - stalenessRank(a, now);
    // NaN-safe: Infinity - Infinity is NaN, and two never-trained skills must
    // still order deterministically or the list reshuffles on every render.
    if (difference !== 0 && !Number.isNaN(difference)) return difference;
    return a.name.localeCompare(b.name);
  };
}

/** The "ten minutes spare" menu: practice skills, stalest first. */
export function practiceMenu(skills: readonly Skill[], now: number = Date.now()): Skill[] {
  return skills.filter(isPractice).sort(byStaleness(now));
}

export function staleSkills(skills: readonly Skill[], now: number = Date.now()): Skill[] {
  return skills.filter((skill) => isStale(skill, now)).sort(byStaleness(now));
}

// --- Sessions --------------------------------------------------------------

export function sessionsInWeekOf(
  sessions: readonly Session[],
  key: DateKey,
  weekStartsOn: number = WEEK_STARTS_ON,
): Session[] {
  const week = startOfWeek(key, weekStartsOn);
  return sessions.filter((session) => startOfWeek(session.date, weekStartsOn) === week);
}

/**
 * Distinct days trained this week, not sessions logged. Two entries for one
 * Saturday is one day of training, and counting it as two would flatter you.
 */
export function trainingDaysInWeekOf(
  sessions: readonly Session[],
  key: DateKey,
  weekStartsOn: number = WEEK_STARTS_ON,
): number {
  return new Set(sessionsInWeekOf(sessions, key, weekStartsOn).map((s) => s.date)).size;
}

export function sessionsForSkill(sessions: readonly Session[], skillId: Id): Session[] {
  return sessions
    .filter((session) => session.skillIds.includes(skillId))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// --- Metrics ---------------------------------------------------------------

/**
 * A new personal best, or null when this session didn't beat the old one.
 *
 * A skill with no metric configured returns null even for a huge number: the
 * unit is what makes the number mean something, and guessing it would produce
 * a "best" of 40 that is sometimes seconds and sometimes reps.
 */
export function improvedMetric(skill: Skill, value: number, at: number): SkillMetric | null {
  const current = skill.metric;
  if (!current) return null;
  if (!Number.isFinite(value) || value <= current.best) return null;
  return { unit: current.unit, best: value, bestAt: at };
}

/** The write a logged session implies against one skill. */
export interface SkillTouch {
  id: Id;
  lastUsedAt: number;
  /** Present only when this session beat the stored best. */
  metric?: SkillMetric;
}

/**
 * What logging a session does to the skills it names: bumps recency, and raises
 * a metric best where one was beaten.
 *
 * `lastUsedAt` never moves backwards, so back-filling last Tuesday cannot make
 * a skill look staler than the session you logged this morning.
 */
export function touchesForSession(session: Session, skills: readonly Skill[]): SkillTouch[] {
  const at = sessionTimeMs(session);
  const named = new Set(session.skillIds);

  return skills
    .filter((skill) => named.has(skill.id))
    .map((skill) => {
      const lastUsedAt = Math.max(skill.lastUsedAt ?? 0, at);
      const mark = session.marks?.[skill.id];
      const metric = mark === undefined ? null : improvedMetric(skill, mark, at);
      return metric ? { id: skill.id, lastUsedAt, metric } : { id: skill.id, lastUsedAt };
    });
}

// --- Creation and validation -----------------------------------------------

export interface TrainingFieldError {
  field: 'name' | 'url' | 'duration' | 'date' | 'note' | 'checkpoint' | 'metric';
  message: string;
}

export interface NewSkillInput {
  name: string;
  kind: SkillKind;
  discipline: string;
  category?: string;
  notes?: string;
  refs?: readonly SkillRef[];
  /** Ids are minted by the caller — the domain stays free of randomness. */
  checkpoints?: readonly Checkpoint[];
  requires?: readonly Id[];
  metric?: SkillMetric;
}

export function validateSkillName(name: string): TrainingFieldError[] {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return [{ field: 'name', message: 'Give the skill a name.' }];
  }
  if (trimmed.length > MAX_SKILL_NAME_LENGTH) {
    return [
      { field: 'name', message: `Keep the name under ${MAX_SKILL_NAME_LENGTH} characters.` },
    ];
  }
  return [];
}

export function validateNewSkill(input: Pick<NewSkillInput, 'name'>): TrainingFieldError[] {
  return validateSkillName(input.name);
}

export function createSkill(input: NewSkillInput, now: number = Date.now()): Omit<Skill, 'id'> {
  const category = input.category?.trim();
  const notes = input.notes?.trim();

  return {
    name: input.name.trim(),
    kind: input.kind,
    discipline: input.discipline,
    // Spread rather than `category: undefined` — exactOptionalPropertyTypes
    // rejects the latter and Firestore would store an explicit null.
    ...(category ? { category } : {}),
    ...(notes ? { notes } : {}),
    refs: [...(input.refs ?? [])],
    // Every skill gets a ladder value, quest or not: switching kind must not
    // have to invent one, and `ladderOf` would otherwise report a lie.
    ladder: FIRST_LADDER_STATE,
    checkpoints: [...(input.checkpoints ?? [])],
    // Never active on creation. Activating is a decision with a cap attached,
    // and it goes through `canActivateQuest`.
    isActive: false,
    ...(input.metric ? { metric: input.metric } : {}),
    requires: [...(input.requires ?? [])],
    createdAt: now,
  };
}

export function createCheckpoint(text: string, id: Id): Checkpoint {
  return { id, text: text.trim(), doneAt: null };
}

export interface NewSessionInput {
  date: DateKey;
  durationMin: number;
  felt: 1 | 2 | 3;
  skillIds: readonly Id[];
  marks?: Record<Id, number>;
  note?: string;
}

export function validateSession(input: NewSessionInput): TrainingFieldError[] {
  const errors: TrainingFieldError[] = [];

  if (!isDateKey(input.date)) {
    errors.push({ field: 'date', message: 'Pick a date.' });
  }

  if (!Number.isFinite(input.durationMin) || input.durationMin <= 0) {
    errors.push({ field: 'duration', message: 'How long did you train?' });
  } else if (input.durationMin > MAX_SESSION_MINUTES) {
    errors.push({
      field: 'duration',
      message: `${MAX_SESSION_MINUTES} minutes is the cap — that is a typo, not a session.`,
    });
  }

  if ((input.note?.trim().length ?? 0) > MAX_NOTE_LENGTH) {
    errors.push({ field: 'note', message: `One line — under ${MAX_NOTE_LENGTH} characters.` });
  }

  for (const value of Object.values(input.marks ?? {})) {
    if (!Number.isFinite(value) || value < 0) {
      errors.push({ field: 'metric', message: 'Numbers only, and not negative.' });
      break;
    }
  }

  return errors;
}

/**
 * Sessions with no skills attached are allowed. "I trained for 40 minutes and
 * nothing in particular" is a true and common statement, and refusing to record
 * it is how a log stops being trusted.
 */
export function createSession(input: NewSessionInput): Omit<Session, 'id'> {
  const note = input.note?.trim();
  const marks = Object.fromEntries(
    Object.entries(input.marks ?? {}).filter(([id]) => input.skillIds.includes(id)),
  );

  return {
    date: input.date,
    durationMin: Math.round(input.durationMin),
    felt: input.felt,
    skillIds: [...input.skillIds],
    ...(Object.keys(marks).length > 0 ? { marks } : {}),
    ...(note ? { note } : {}),
  };
}

/**
 * Accepts only http(s). A `javascript:` ref would be rendered as a link, and
 * this is a field you paste into from a phone without looking.
 */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
}

export function validateInboxItem(input: { url: string; note?: string }): TrainingFieldError[] {
  const errors: TrainingFieldError[] = [];

  if (normalizeUrl(input.url) === null) {
    errors.push({ field: 'url', message: 'Paste a link — http or https.' });
  }
  if ((input.note?.trim().length ?? 0) > MAX_NOTE_LENGTH) {
    errors.push({ field: 'note', message: `Under ${MAX_NOTE_LENGTH} characters.` });
  }

  return errors;
}

export function createInboxItem(
  input: { url: string; note?: string },
  now: number = Date.now(),
): Omit<InboxItem, 'id'> {
  const note = input.note?.trim();
  return {
    url: normalizeUrl(input.url) ?? input.url.trim(),
    ...(note ? { note } : {}),
    createdAt: now,
  };
}

/** Promoting an inbox item to a skill: the URL becomes the skill's first ref. */
export function skillFromInboxItem(
  item: InboxItem,
  input: Pick<NewSkillInput, 'name' | 'kind' | 'discipline'> & {
    checkpoints?: readonly Checkpoint[];
  },
  now: number = Date.now(),
): Omit<Skill, 'id'> {
  return createSkill(
    {
      ...input,
      refs: [item.note ? { url: item.url, note: item.note } : { url: item.url }],
    },
    now,
  );
}
