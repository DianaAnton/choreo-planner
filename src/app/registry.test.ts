import { describe, expect, it } from 'vitest';

import {
  frontier,
  hasSkillWork,
  planSession,
  plannedMinutes,
  type SessionPlan,
} from '../domain/sessionPlan';
import { createCheckpoint, isQuest, type Skill } from '../domain/training';
import {
  POLE_PATH,
  SKATEBOARD_PATH,
  inPrerequisiteOrder,
  type SeedSkill,
} from '../domain/trainingSeed';
import { POLE, SKATEBOARD, disciplines } from './registry';

/**
 * The *shipped* discipline profiles, against the *shipped* curricula.
 *
 * `bothDisciplines.test.ts` proves the domain rules are discipline-neutral
 * using profiles it makes up. This proves the two registrations we actually
 * ship produce a session worth doing — which is a question about the
 * registrations, so it lives next to them rather than in `domain/`, where
 * nothing may import from `app/`.
 */

const NOW = Date.UTC(2026, 8, 4, 12);

function build(path: readonly SeedSkill[], discipline: string): Skill[] {
  return inPrerequisiteOrder(path).map((item) => ({
    id: item.key,
    name: item.name,
    discipline,
    refs: [],
    ladder: 'wantIt',
    checkpoints: (item.checkpoints ?? []).map((text, i) =>
      createCheckpoint(text, `${item.key}-${i}`),
    ),
    isActive: false,
    requires: [...(item.requires ?? [])],
    createdAt: 0,
    ...(item.category ? { category: item.category } : {}),
    ...(item.metric ? { metric: { ...item.metric, best: 0, bestAt: 0 } } : {}),
  }));
}

/**
 * The deepest quest in the curriculum, made active — deliberately the deepest
 * rather than the first. A root quest has nothing between you and it, which is
 * the one case that would not exercise the frontier at all. For pole this is
 * something like an Iron X; for skateboarding, a trick several rungs past the
 * ollie. Nothing is clean, so it is blocked all the way down.
 */
function chasingTheHardestThing(skills: readonly Skill[]): Skill[] {
  const deepest = [...skills]
    .filter(isQuest)
    .sort((a, b) => b.requires.length - a.requires.length || a.name.localeCompare(b.name))[0];

  return skills.map((skill) => (skill.id === deepest?.id ? { ...skill, isActive: true } : skill));
}

const shipped = [
  ['pole', POLE, chasingTheHardestThing(build(POLE_PATH, 'pole'))],
  ['skateboard', SKATEBOARD, chasingTheHardestThing(build(SKATEBOARD_PATH, 'skateboard'))],
] as const;

describe('every registered discipline', () => {
  it('declares a session shape', () => {
    for (const profile of disciplines.all()) {
      expect(profile.sessionShape.length).toBeGreaterThan(0);
    }
  });

  it('opens and closes on a block with nothing in it but a duration', () => {
    for (const profile of disciplines.all()) {
      const lanes = profile.sessionShape;
      expect(lanes[0]?.kind).toBe('fixed');
      expect(lanes[lanes.length - 1]?.kind).toBe('fixed');
    }
  });

  it('gives its heaviest share to goal work', () => {
    for (const profile of disciplines.all()) {
      const shares = profile.sessionShape.filter((lane) => lane.kind === 'skills');
      const heaviest = shares.reduce((a, b) => (b.weight > a.weight ? b : a));
      expect(heaviest.pick.from).toBe('frontier');
    }
  });

  it('draws every category lane from categories it actually offers', () => {
    for (const profile of disciplines.all()) {
      const known = new Set(profile.defaultCategories);
      for (const lane of profile.sessionShape) {
        if (lane.kind !== 'skills' || lane.pick.from !== 'categories') continue;
        for (const category of lane.pick.categories) {
          expect(known).toContain(category);
        }
      }
    }
  });
});

describe.each(shipped)('a 50-minute %s session', (_name, profile, skills) => {
  const plan: SessionPlan = planSession(skills, 50, profile, NOW);

  it('adds up to fifty minutes', () => {
    expect(plannedMinutes(plan)).toBe(50);
  });

  it('has something to train in it', () => {
    expect(hasSkillWork(plan)).toBe(true);
  });

  it('starts and ends on a tick', () => {
    expect(plan.blocks[0]!.skillIds).toEqual([]);
    expect(plan.blocks[plan.blocks.length - 1]!.skillIds).toEqual([]);
  });

  it('sends you to the bottom of the chain rather than at the goal', () => {
    const goal = skills.find((skill) => skill.isActive)!;
    const steps = frontier(skills, NOW);

    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) {
      // Nothing is clean, so the only trainable thing is a skill with no
      // prerequisites at all. This is the "my invert isn't clean" case.
      expect(step.skill.requires).toEqual([]);
      expect(step.skill.id).not.toBe(goal.id);
    }
  });

  it('leaves the conditioning until after the skill work', () => {
    const ids = plan.blocks.map((block) => block.id);
    expect(ids.indexOf('conditioning')).toBeGreaterThan(ids.indexOf('goal'));
  });

  it('never names the same skill in two blocks', () => {
    const named = plan.blocks.flatMap((block) => block.skillIds);
    expect(new Set(named).size).toBe(named.length);
  });
});
