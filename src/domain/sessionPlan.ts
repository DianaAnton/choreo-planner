/**
 * Turning "I have fifty minutes" into a written plan. Pure TypeScript — no
 * React, no Firebase, no DOM.
 *
 * Two ideas do the work here.
 *
 * **You do not train the goal, you train the nearest thing on the way to it
 * that is not clean yet.** The app already knows what "clean" means
 * (`PREREQUISITE_MET_AT`) and already stores the chain (`requires`), so
 * "I want an Ayesha, where do I start" has a computable answer, and it is
 * almost never "the Ayesha". That is `trainableTowards`.
 *
 * **The minutes always add up.** A plan that comes to 47 minutes when you asked
 * for 50 is a suggestion; the point of writing it down is that you can follow
 * it without doing arithmetic next to a pole. See `largestRemainder`.
 *
 * Nothing here is stored. A plan is derived from the skills you have and the
 * time you have, the same way the Today list is — see ADR 0015.
 */

import type { DisciplineProfile, FixedLane, SkillLane } from './discipline';
import { activeQuests, stalenessRank, unmetPrerequisites, type Skill } from './training';
import type { Id } from './types';

/**
 * No block shorter than this. Four minutes is already the floor of useful;
 * two minutes of conditioning is a line in a list, not a piece of training.
 */
export const MIN_LANE_MINUTES = 4;

/** Offered on the plan screen. 50 is the one this was built for. */
export const PLAN_LENGTHS = [30, 50, 75] as const;

// --- The frontier ----------------------------------------------------------

/**
 * The nearest thing on the way to a goal that you can actually train today.
 *
 * Walks down the `requires` chain and returns the skills whose own
 * prerequisites are all met but which you have not met yourself — the goal
 * itself when nothing is in the way. An Ayesha with a shaky invert resolves to
 * the invert, four rungs down, which is the honest answer and the one nobody
 * wants to give themselves.
 *
 * Tolerates the two hazards `layoutSkillGraph` tolerates, for the same reasons:
 * a `requires` pointing at a deleted skill is skipped rather than treated as a
 * root, and a cycle terminates rather than looping.
 */
export function trainableTowards(goal: Skill, byId: ReadonlyMap<Id, Skill>): Skill[] {
  const found: Skill[] = [];
  const seen = new Set<Id>();

  const walk = (skill: Skill): void => {
    if (seen.has(skill.id)) return;
    seen.add(skill.id);

    const unmet = unmetPrerequisites(skill, byId);
    if (unmet.length === 0) {
      found.push(skill);
      return;
    }

    for (const required of unmet) walk(required);
  };

  walk(goal);
  return found;
}

export interface FrontierStep {
  skill: Skill;
  /** The active quests waiting on it. Never empty. */
  towards: Skill[];
}

/**
 * Everything worth training today across every active quest, each with the
 * goals it unblocks.
 *
 * Ordered by how many goals wait on it first, because a prerequisite two quests
 * share is worth more of a fifty-minute session than either quest is — a
 * shoulder mount and an Ayesha both sit on top of a clean invert, and that
 * makes the invert the most valuable thing on the list, not the least exciting.
 * Staleness breaks the tie.
 */
export function frontier(skills: readonly Skill[], now: number = Date.now()): FrontierStep[] {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const steps = new Map<Id, FrontierStep>();

  for (const quest of activeQuests(skills)) {
    for (const step of trainableTowards(quest, byId)) {
      const existing = steps.get(step.id);
      if (existing) existing.towards.push(quest);
      else steps.set(step.id, { skill: step, towards: [quest] });
    }
  }

  return [...steps.values()].sort(
    (a, b) =>
      b.towards.length - a.towards.length ||
      staler(a.skill, b.skill, now) ||
      a.skill.name.localeCompare(b.skill.name),
  );
}

/** Stalest first. NaN-safe — see the same guard in `training.ts`. */
function staler(a: Skill, b: Skill, now: number): number {
  const difference = stalenessRank(b, now) - stalenessRank(a, now);
  // Infinity - Infinity is NaN, and two never-trained skills must still order
  // deterministically or the plan reshuffles every time you build it.
  return Number.isNaN(difference) ? 0 : difference;
}

// --- The plan --------------------------------------------------------------

export interface PlanBlock {
  /** One block per lane, so this is the lane's id. The tick state is keyed by it. */
  id: string;
  title: string;
  minutes: number;
  /**
   * Ids rather than skills. The plan is frozen when you build it — it must not
   * rewrite itself under you halfway through — but the skills it *names* stay
   * live, so ticking a checkpoint updates the cue on screen instead of leaving
   * the plan quoting the state it was built in.
   *
   * Empty for a warm-up or a cool-down, which are a tick and nothing else.
   */
  skillIds: Id[];
  /** Active quests this block moves you towards. Empty when it is not goal work. */
  towardsIds: Id[];
  note?: string;
}

export interface SessionPlan {
  /** What was asked for. `plannedMinutes` is what the blocks came to. */
  minutes: number;
  blocks: PlanBlock[];
}

export function plannedMinutes(plan: SessionPlan): number {
  return plan.blocks.reduce((total, block) => total + block.minutes, 0);
}

/**
 * Whether there is anything in the plan beyond a warm-up and a cool-down. False
 * means the skill library is empty or every lane came up dry, which is a
 * different screen — there is nothing to plan, so go pick something.
 */
export function hasSkillWork(plan: SessionPlan): boolean {
  return plan.blocks.some((block) => block.skillIds.length > 0);
}

/**
 * What ticking these blocks says you did — the handoff to the Log screen.
 * Minutes are the ticked blocks' minutes, not the plan's: half a session that
 * you actually did is a true 25-minute session, not a false 50-minute one.
 */
export function trainedIn(
  plan: SessionPlan,
  ticked: ReadonlySet<string>,
): { skillIds: Id[]; minutes: number } {
  const done = plan.blocks.filter((block) => ticked.has(block.id));
  return {
    skillIds: [...new Set(done.flatMap((block) => block.skillIds))],
    minutes: done.reduce((total, block) => total + block.minutes, 0),
  };
}

/**
 * The plan for `minutes` of training, given what you can do today.
 *
 * The blocks always come to exactly `minutes` — unless no skill lane found
 * anything at all, in which case what is left over has nowhere honest to go and
 * the plan is a warm-up and a cool-down. `hasSkillWork` is how the screen
 * tells the difference.
 */
export function planSession(
  skills: readonly Skill[],
  minutes: number,
  profile: DisciplineProfile,
  now: number = Date.now(),
): SessionPlan {
  const lanes = profile.sessionShape;
  const target = Math.max(0, Math.floor(minutes));

  // Resolve before allocating: a lane with nothing to offer must not sit on
  // minutes the other lanes could use. No active quests means no goal work, and
  // its fifteen minutes belong to the rest of the session rather than to an
  // empty heading.
  const used = new Set<Id>();
  const resolved = new Map<string, LanePicks>();

  for (const lane of lanes) {
    if (lane.kind === 'fixed') continue;

    const picked = pickFor(lane, skills, used, now);
    if (picked.skillIds.length === 0) continue;

    for (const id of picked.skillIds) used.add(id);
    resolved.set(lane.id, picked);
  }

  const fixedMinutes = allocateFixed(
    lanes.filter((lane): lane is FixedLane => lane.kind === 'fixed'),
    target,
  );
  const spent = sum([...fixedMinutes.values()]);
  const shareMinutes = allocateShares(
    lanes.filter((lane): lane is SkillLane => lane.kind === 'skills' && resolved.has(lane.id)),
    target - spent,
  );

  const blocks: PlanBlock[] = [];
  for (const lane of lanes) {
    const allotted =
      lane.kind === 'fixed' ? fixedMinutes.get(lane.id) : shareMinutes.get(lane.id);
    if (allotted === undefined || allotted <= 0) continue;

    const picked = resolved.get(lane.id);
    blocks.push({
      id: lane.id,
      title: lane.label,
      minutes: allotted,
      skillIds: picked?.skillIds ?? [],
      towardsIds: picked?.towardsIds ?? [],
      // Spread rather than `note: undefined` — exactOptionalPropertyTypes.
      ...(lane.note ? { note: lane.note } : {}),
    });
  }

  return { minutes: target, blocks };
}

// --- Picking ---------------------------------------------------------------

interface LanePicks {
  skillIds: Id[];
  towardsIds: Id[];
}

function pickFor(
  lane: SkillLane,
  skills: readonly Skill[],
  used: ReadonlySet<Id>,
  now: number,
): LanePicks {
  if (lane.pick.from === 'frontier') {
    const taken = frontier(skills, now)
      .filter((step) => !used.has(step.skill.id))
      .slice(0, lane.maxSkills);

    return {
      skillIds: taken.map((step) => step.skill.id),
      towardsIds: [...new Set(taken.flatMap((step) => step.towards.map((goal) => goal.id)))],
    };
  }

  const wanted = new Set(lane.pick.categories);
  const byId = new Map(skills.map((skill) => [skill.id, skill]));

  const offered = skills
    .filter((skill) => !used.has(skill.id))
    .filter((skill) => wanted.has(skill.category ?? ''))
    // Only what you could actually do today. Stalest-first is the right order
    // for a menu, but without this filter it leads with whatever you have never
    // trained — which is reliably the thing three prerequisites away.
    .filter((skill) => unmetPrerequisites(skill, byId).length === 0)
    .sort((a, b) => staler(a, b, now) || a.name.localeCompare(b.name))
    .slice(0, lane.maxSkills);

  return { skillIds: offered.map((skill) => skill.id), towardsIds: [] };
}

// --- Allocation ------------------------------------------------------------

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function allocateFixed(lanes: readonly FixedLane[], target: number): Map<string, number> {
  const asked = sum(lanes.map((lane) => lane.minutes));
  if (asked <= target) return new Map(lanes.map((lane) => [lane.id, lane.minutes]));

  // A session shorter than its own warm-up and cool-down. Shrink them in
  // proportion rather than handing back a plan that overruns the time you said
  // you had — the one thing a written plan has to get right is the total.
  return largestRemainder(
    lanes.map((lane) => ({ id: lane.id, weight: lane.minutes })),
    target,
  );
}

function allocateShares(lanes: readonly SkillLane[], remaining: number): Map<string, number> {
  // Drop the lightest lanes until every survivor clears the floor. Three lanes
  // of three minutes each is not a shorter session, it is a worse one.
  const kept = [...lanes];
  while (kept.length > 0 && remaining < kept.length * MIN_LANE_MINUTES) {
    let weakest = 0;
    for (let index = 1; index < kept.length; index += 1) {
      // `<=` so ties drop the later lane: the shape lists them in training
      // order, and the earlier one is the one the session is built around.
      if (kept[index]!.weight <= kept[weakest]!.weight) weakest = index;
    }
    kept.splice(weakest, 1);
  }

  if (kept.length === 0) return new Map();

  // The floor first, then the surplus by weight. Largest-remainder over the
  // whole amount would still let a 1-against-7 split put a lane below it.
  const extra = largestRemainder(
    kept.map((lane) => ({ id: lane.id, weight: lane.weight })),
    remaining - kept.length * MIN_LANE_MINUTES,
  );

  return new Map(kept.map((lane) => [lane.id, MIN_LANE_MINUTES + (extra.get(lane.id) ?? 0)]));
}

/**
 * Whole minutes in proportion to weight, adding up to exactly `total`.
 *
 * Floor everything, then hand the leftovers to the largest fractions. The naive
 * version — round each share independently — is how a fifty-minute plan comes
 * to 49 or 51, which is the one error a written plan is not allowed to make.
 */
function largestRemainder(
  parts: readonly { id: string; weight: number }[],
  total: number,
): Map<string, number> {
  const allocated = new Map(parts.map((part) => [part.id, 0]));

  const weightTotal = sum(parts.map((part) => part.weight));
  if (parts.length === 0 || total <= 0 || weightTotal <= 0) return allocated;

  const exact = parts.map((part) => ({
    id: part.id,
    value: (total * part.weight) / weightTotal,
  }));

  let given = 0;
  for (const part of exact) {
    const whole = Math.floor(part.value);
    allocated.set(part.id, whole);
    given += whole;
  }

  // Stable sort, so equal fractions fall back to the order the lanes are
  // declared in and the same inputs always produce the same plan.
  const byFraction = [...exact].sort(
    (a, b) => b.value - Math.floor(b.value) - (a.value - Math.floor(a.value)),
  );

  for (let index = 0; given < total; index += 1, given += 1) {
    const part = byFraction[index % byFraction.length]!;
    allocated.set(part.id, (allocated.get(part.id) ?? 0) + 1);
  }

  return allocated;
}
