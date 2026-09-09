/**
 * What a discipline is. Pure — the registry that holds them lives in
 * `src/app/registry.ts`, but the *type* is here so features can read a profile
 * without importing from `app/`, which the layering rule forbids.
 *
 * The seam is from ADR 0009. ADR 0013 is what finally exercised it: pole and
 * skateboarding in one app, which turned up the pole assumptions that had
 * quietly settled into the domain.
 */

import { LADDER_DESCRIPTIONS, LADDER_LABELS, type LadderState } from './training';

/**
 * What makes a rep count as clean. This replaces the bare `minHoldMs` that
 * `DisciplineProfile` used to carry.
 *
 * ADR 0011 §6 made "can you hold it for the bar it occupies" the objective test
 * for `cleanRep`, so the dancer never has to invent one. The principle
 * survives; the assumption that every discipline measures in *seconds* does
 * not. An ollie is not a hold — you land it or you don't, and the question is
 * how often. That is a different shape of test, not a different number.
 */
export type CleanRepTest =
  | { kind: 'hold'; minMs: number }
  | { kind: 'consistency'; land: number; outOf: number };

/**
 * How a session in this discipline is built: the lanes it divides into, in the
 * order they are trained.
 *
 * Here rather than in the planner for the same reason `defaultCategories` is:
 * "conditioning last, because it burns out the grip the pole work needs" is a
 * fact about pole, and a planner that knew it would be a planner that only
 * works for pole. The planner does the arithmetic; the profile says what the
 * session is made of.
 */
export type SessionLane = FixedLane | SkillLane;

/**
 * A block with a duration and nothing in it — you already know what to do, and
 * the app has no business listing your warm-up back at you. It is a tick.
 *
 * Fixed minutes rather than a share, because a warm-up does not get shorter
 * because you also want to do spins.
 */
export interface FixedLane {
  kind: 'fixed';
  id: string;
  label: string;
  minutes: number;
  note?: string;
}

/**
 * Where a lane's skills come from.
 *
 * `frontier` is the interesting one: not the goal, but the nearest thing on the
 * way to it that is not clean yet. See `trainableTowards` in `sessionPlan.ts`.
 */
export type LanePick =
  | { from: 'frontier' }
  | { from: 'categories'; categories: readonly string[] };

export interface SkillLane {
  kind: 'skills';
  id: string;
  label: string;
  /** Share of whatever the fixed lanes leave, relative to the other skill lanes. */
  weight: number;
  pick: LanePick;
  /** A lane naming six things is a list, not a plan. */
  maxSkills: number;
  note?: string;
}

export interface DisciplineProfile {
  id: string;
  label: string;
  /** Suggested categories; users can always type their own. */
  defaultCategories: readonly string[];
  /** Display names for those keys. Falls back to the key, capitalised. */
  categoryLabels?: Readonly<Record<string, string>>;
  /** The objective test for `cleanRep` in this discipline. */
  cleanRepTest: CleanRepTest;
  /**
   * Overrides for rungs whose default wording assumes pole. Only `inChoreo`
   * needs one today — a skater's terminal state is "in a line", not "in a
   * choreo" — but the whole set is overridable so the next discipline does not
   * need a code change here.
   */
  ladderLabels?: Partial<Record<LadderState, string>>;
  ladderDescriptions?: Partial<Record<LadderState, string>>;
  /**
   * Whether the choreography planner applies. False hides it entirely: a
   * skateboarder should not be offered a tab for laying out pole routines
   * against a song.
   */
  hasChoreo: boolean;
  /**
   * The shape of a session in this discipline. Required, with no default: a
   * neutral fallback would be a guess at somebody's training order, and a
   * discipline added without thinking about it should not compile.
   */
  sessionShape: readonly SessionLane[];
}

export function describeCleanRep(test: CleanRepTest): string {
  return test.kind === 'hold'
    ? `Held for at least ${(test.minMs / 1000).toFixed(1)}s.`
    : `Landed ${test.land} out of ${test.outOf}.`;
}

/** Did this set of attempts clear the bar? */
export function meetsConsistency(landed: number, attempted: number, test: CleanRepTest): boolean {
  if (test.kind !== 'consistency') return false;
  if (attempted <= 0 || landed < 0 || landed > attempted) return false;
  // A ratio, not the raw count: 4 of 5 passes an 8-of-10 test. Demanding ten
  // attempts to prove a trick you just landed four times running is bookkeeping,
  // not a standard.
  return landed / attempted >= test.land / test.outOf;
}

export function categoryLabel(profile: DisciplineProfile, key: string): string {
  const known = profile.categoryLabels?.[key];
  if (known) return known;
  return key.length === 0 ? key : key[0]!.toUpperCase() + key.slice(1);
}

/** The ladder as this discipline words it. Defaults, with the profile on top. */
export function ladderLabelsFor(profile: DisciplineProfile): Record<LadderState, string> {
  return { ...LADDER_LABELS, ...profile.ladderLabels };
}

export function ladderDescriptionsFor(profile: DisciplineProfile): Record<LadderState, string> {
  return { ...LADDER_DESCRIPTIONS, ...profile.ladderDescriptions };
}
