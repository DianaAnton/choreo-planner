import { describe, expect, it } from 'vitest';

import type { DisciplineProfile, SessionLane } from './discipline';
import {
  MIN_LANE_MINUTES,
  frontier,
  hasSkillWork,
  planSession,
  plannedMinutes,
  trainableTowards,
  trainedIn,
} from './sessionPlan';
import { createCheckpoint, type LadderState, type Skill } from './training';

const DAY = 86_400_000;
/** Fixed, so nothing here depends on the day the tests run. */
const NOW = Date.UTC(2026, 8, 4, 12);

function skill(id: string, overrides: Partial<Skill> = {}): Skill {
  return {
    id,
    name: id,
    discipline: 'pole',
    refs: [],
    ladder: 'wantIt',
    checkpoints: [createCheckpoint('hold one 8-count', `${id}-c`)],
    isActive: false,
    requires: [],
    createdAt: 0,
    ...overrides,
  };
}

/** A skill that counts as a met prerequisite. */
function clean(id: string, overrides: Partial<Skill> = {}): Skill {
  return skill(id, { ladder: 'cleanRep', ...overrides });
}

const LANES: SessionLane[] = [
  { kind: 'fixed', id: 'warmup', label: 'Warm up', minutes: 8 },
  { kind: 'skills', id: 'goal', label: 'Goal work', weight: 3, maxSkills: 2, pick: { from: 'frontier' } },
  {
    kind: 'skills',
    id: 'flow',
    label: 'Spins and shapes',
    weight: 2,
    maxSkills: 3,
    pick: { from: 'categories', categories: ['spin'] },
  },
  {
    kind: 'skills',
    id: 'conditioning',
    label: 'Conditioning',
    weight: 2,
    maxSkills: 2,
    pick: { from: 'categories', categories: ['conditioning'] },
  },
  { kind: 'fixed', id: 'cooldown', label: 'Cool down', minutes: 5 },
];

function profile(lanes: readonly SessionLane[] = LANES): DisciplineProfile {
  return {
    id: 'pole',
    label: 'Pole',
    defaultCategories: ['spin', 'invert', 'conditioning'],
    cleanRepTest: { kind: 'hold', minMs: 3000 },
    hasChoreo: true,
    sessionShape: lanes,
  };
}

/**
 * The situation this whole feature was built for: two goals — a shoulder mount
 * and an Ayesha — sitting on top of an invert that is not clean.
 *
 *   climb (clean) → invert (ugly) → gemini → butterfly → ext. butterfly → ayesha
 *                              └──→ sm-prep → shoulder mount
 */
function theRoadToAyesha(): Skill[] {
  return [
    clean('climb', { category: 'climb' }),
    skill('invert', { category: 'invert', ladder: 'uglyRep', requires: ['climb'] }),
    skill('gemini', { category: 'invert', requires: ['invert'] }),
    skill('butterfly', { category: 'invert', requires: ['gemini'] }),
    skill('ext-butterfly', { category: 'invert', requires: ['butterfly'] }),
    skill('ayesha', { category: 'invert', requires: ['ext-butterfly'], isActive: true }),
    skill('sm-prep', { category: 'invert', requires: ['invert'] }),
    skill('shoulder-mount', { category: 'invert', requires: ['sm-prep'], isActive: true }),
    clean('fireman', { category: 'spin', lastUsedAt: NOW - 30 * DAY }),
    clean('backhook', { category: 'spin', lastUsedAt: NOW - 3 * DAY }),
    skill('grip', { category: 'conditioning', checkpoints: [] }),
    skill('scapular', { category: 'conditioning', checkpoints: [] }),
  ];
}

const byId = (skills: readonly Skill[]) => new Map(skills.map((s) => [s.id, s]));

describe('what to train towards a goal', () => {
  it('is the goal itself when nothing is in the way', () => {
    const skills = [clean('climb'), skill('invert', { requires: ['climb'] })];
    const steps = trainableTowards(skills[1]!, byId(skills));
    expect(steps.map((s) => s.id)).toEqual(['invert']);
  });

  it('is the nearest unmet prerequisite, not the goal, however far down it is', () => {
    const skills = theRoadToAyesha();
    const ayesha = skills.find((s) => s.id === 'ayesha')!;

    // Four rungs below the thing you actually want.
    expect(trainableTowards(ayesha, byId(skills)).map((s) => s.id)).toEqual(['invert']);
  });

  it('returns every branch when a goal is blocked on more than one thing', () => {
    const skills = [
      skill('a', { ladder: 'uglyRep' }),
      skill('b', { ladder: 'uglyRep' }),
      skill('goal', { requires: ['a', 'b'] }),
    ];
    const steps = trainableTowards(skills[2]!, byId(skills));
    expect(steps.map((s) => s.id).sort()).toEqual(['a', 'b']);
  });

  it('skips a prerequisite pointing at a deleted skill rather than stalling', () => {
    const skills = [skill('goal', { requires: ['gone'] })];
    expect(trainableTowards(skills[0]!, byId(skills)).map((s) => s.id)).toEqual(['goal']);
  });

  it('terminates on a cycle instead of looping forever', () => {
    const skills = [
      skill('a', { requires: ['b'], ladder: 'wantIt' }),
      skill('b', { requires: ['a'], ladder: 'wantIt' }),
    ];
    // The honest failure is an odd answer, not a locked-up tab.
    expect(() => trainableTowards(skills[0]!, byId(skills))).not.toThrow();
  });
});

describe('the frontier across every active quest', () => {
  it('leads with the thing the most goals are waiting on', () => {
    const steps = frontier(theRoadToAyesha(), NOW);

    // One invert, serving both the shoulder mount and the Ayesha — which is the
    // whole point: it is worth more of the session than either goal is.
    expect(steps).toHaveLength(1);
    expect(steps[0]!.skill.id).toBe('invert');
    expect(steps[0]!.towards.map((goal) => goal.id).sort()).toEqual(['ayesha', 'shoulder-mount']);
  });

  it('names a skill once however many goals depend on it', () => {
    const ids = frontier(theRoadToAyesha(), NOW).map((step) => step.skill.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is empty when nothing is active — the cap decides, not the planner', () => {
    const parked = theRoadToAyesha().map((s) => ({ ...s, isActive: false }));
    expect(frontier(parked, NOW)).toEqual([]);
  });

  it('orders equally-shared steps by staleness', () => {
    const skills = [
      skill('fresh', { ladder: 'uglyRep', lastUsedAt: NOW - DAY }),
      skill('rusty', { ladder: 'uglyRep', lastUsedAt: NOW - 40 * DAY }),
      skill('goal-a', { requires: ['fresh'], isActive: true }),
      skill('goal-b', { requires: ['rusty'], isActive: true }),
    ];
    expect(frontier(skills, NOW).map((step) => step.skill.id)).toEqual(['rusty', 'fresh']);
  });
});

describe('a fifty-minute plan', () => {
  const plan = planSession(theRoadToAyesha(), 50, profile(), NOW);

  it('adds up to exactly the time asked for', () => {
    expect(plannedMinutes(plan)).toBe(50);
  });

  it('keeps the lanes in the order the discipline declared them', () => {
    expect(plan.blocks.map((block) => block.id)).toEqual([
      'warmup',
      'goal',
      'flow',
      'conditioning',
      'cooldown',
    ]);
  });

  it('leaves the warm-up and cool-down empty — they are a tick, not a list', () => {
    const warmup = plan.blocks.find((block) => block.id === 'warmup')!;
    const cooldown = plan.blocks.find((block) => block.id === 'cooldown')!;

    expect(warmup.skillIds).toEqual([]);
    expect(cooldown.skillIds).toEqual([]);
    expect(warmup.minutes).toBe(8);
    expect(cooldown.minutes).toBe(5);
  });

  it('spends the goal block on the invert, and says which goals it serves', () => {
    const goal = plan.blocks.find((block) => block.id === 'goal')!;

    expect(goal.skillIds).toEqual(['invert']);
    expect(goal.towardsIds.sort()).toEqual(['ayesha', 'shoulder-mount']);
    // The biggest share of the session, because it is the hard part.
    expect(goal.minutes).toBeGreaterThan(
      plan.blocks.find((block) => block.id === 'flow')!.minutes,
    );
  });

  it('fills the spin block stalest-first with things you can actually do', () => {
    const flow = plan.blocks.find((block) => block.id === 'flow')!;
    expect(flow.skillIds).toEqual(['fireman', 'backhook']);
  });

  it('puts conditioning last, after the pole work', () => {
    const ids = plan.blocks.map((block) => block.id);
    expect(ids.indexOf('conditioning')).toBeGreaterThan(ids.indexOf('goal'));
    expect(ids.indexOf('conditioning')).toBeGreaterThan(ids.indexOf('flow'));
  });

  it('never names the same skill in two blocks', () => {
    const named = plan.blocks.flatMap((block) => block.skillIds);
    expect(new Set(named).size).toBe(named.length);
  });

  it('respects each lane’s cap on how many skills it names', () => {
    for (const block of plan.blocks) expect(block.skillIds.length).toBeLessThanOrEqual(3);
  });
});

describe('the minutes', () => {
  const skills = theRoadToAyesha();

  it.each([20, 30, 45, 50, 60, 75, 90, 120])('add up to exactly %i', (minutes) => {
    expect(plannedMinutes(planSession(skills, minutes, profile(), NOW))).toBe(minutes);
  });

  it('never gives a block less than the floor', () => {
    for (const minutes of [20, 30, 50, 75]) {
      const plan = planSession(skills, minutes, profile(), NOW);
      for (const block of plan.blocks) expect(block.minutes).toBeGreaterThanOrEqual(1);
      for (const block of plan.blocks.filter((b) => b.skillIds.length > 0)) {
        expect(block.minutes).toBeGreaterThanOrEqual(MIN_LANE_MINUTES);
      }
    }
  });

  it('fits three lanes at exactly the floor and no less', () => {
    // 25 minutes, 13 of them fixed: 12 left is precisely three lanes at four
    // minutes each. One minute shorter and something has to give.
    const plan = planSession(skills, 25, profile(), NOW);
    const working = plan.blocks.filter((block) => block.skillIds.length > 0);

    expect(working.map((block) => block.minutes)).toEqual([4, 4, 4]);
    expect(plannedMinutes(plan)).toBe(25);
  });

  it('drops the lightest lane rather than slicing the session into useless pieces', () => {
    const plan = planSession(skills, 24, profile(), NOW);
    const working = plan.blocks.filter((block) => block.skillIds.length > 0);

    // Goal work is the heaviest lane, so it is the one that survives intact.
    expect(working.map((block) => block.id)).toEqual(['goal', 'flow']);
    expect(working.every((block) => block.minutes >= MIN_LANE_MINUTES)).toBe(true);
    expect(plannedMinutes(plan)).toBe(24);
  });

  it('keeps only the goal work when there is barely any time at all', () => {
    const plan = planSession(skills, 18, profile(), NOW);
    const working = plan.blocks.filter((block) => block.skillIds.length > 0);

    expect(working.map((block) => block.id)).toEqual(['goal']);
    expect(plannedMinutes(plan)).toBe(18);
  });

  it('shrinks the warm-up and cool-down when the session is shorter than they are', () => {
    const plan = planSession(skills, 10, profile(), NOW);
    expect(plannedMinutes(plan)).toBe(10);
    expect(plan.blocks.every((block) => block.minutes > 0)).toBe(true);
  });
});

describe('a lane with nothing to offer', () => {
  it('hands its minutes to the rest of the session rather than showing empty', () => {
    // No active quests, so there is no goal work at all.
    const parked = theRoadToAyesha().map((s) => ({ ...s, isActive: false }));
    const plan = planSession(parked, 50, profile(), NOW);

    expect(plan.blocks.map((block) => block.id)).not.toContain('goal');
    expect(plannedMinutes(plan)).toBe(50);
  });

  it('leaves a warm-up and a cool-down when there is nothing to train at all', () => {
    const plan = planSession([], 50, profile(), NOW);

    expect(hasSkillWork(plan)).toBe(false);
    expect(plan.blocks.map((block) => block.id)).toEqual(['warmup', 'cooldown']);
    // The leftover has nowhere honest to go: a warm-up does not get longer
    // because the skill library is empty.
    expect(plannedMinutes(plan)).toBe(13);
  });

  it('will not offer a skill whose prerequisites are not met', () => {
    const skills = [
      skill('climb', { category: 'spin', ladder: 'uglyRep' }),
      skill('locked', { category: 'spin', requires: ['climb'] }),
    ];
    const plan = planSession(skills, 50, profile(), NOW);
    const flow = plan.blocks.find((block) => block.id === 'flow');

    expect(flow?.skillIds ?? []).toEqual(['climb']);
  });
});

describe('the same plan, twice', () => {
  it('is the same plan', () => {
    const skills = theRoadToAyesha();
    expect(planSession(skills, 50, profile(), NOW)).toEqual(
      planSession(skills, 50, profile(), NOW),
    );
  });

  it('does not reshuffle when two skills have both never been trained', () => {
    // Never-trained sorts to the top of a staleness order via Infinity, and
    // Infinity - Infinity is NaN — the case that would make this flap.
    const never = theRoadToAyesha().map((skill) => {
      const copy = { ...skill };
      delete copy.lastUsedAt;
      return copy;
    });
    expect(planSession(never, 50, profile(), NOW)).toEqual(
      planSession(never, 50, profile(), NOW),
    );
  });
});

describe('what a ticked plan says you did', () => {
  const plan = planSession(theRoadToAyesha(), 50, profile(), NOW);

  it('counts only the blocks you ticked', () => {
    const done = trainedIn(plan, new Set(['warmup', 'goal']));

    expect(done.skillIds).toEqual(['invert']);
    // Half a session you actually did is a true 23 minutes, not a false 50.
    expect(done.minutes).toBe(
      plan.blocks.find((b) => b.id === 'warmup')!.minutes +
        plan.blocks.find((b) => b.id === 'goal')!.minutes,
    );
  });

  it('is empty when nothing is ticked', () => {
    expect(trainedIn(plan, new Set())).toEqual({ skillIds: [], minutes: 0 });
  });

  it('names a skill once even when two ticked blocks share it', () => {
    const shared = planSession(
      [skill('one', { category: 'spin', ladder: 'cleanRep' })],
      50,
      profile([
        {
          kind: 'skills',
          id: 'a',
          label: 'A',
          weight: 1,
          maxSkills: 1,
          pick: { from: 'categories', categories: ['spin'] },
        },
        {
          kind: 'skills',
          id: 'b',
          label: 'B',
          weight: 1,
          maxSkills: 1,
          pick: { from: 'categories', categories: ['spin'] },
        },
      ]),
      NOW,
    );

    // The planner already refuses to name it twice, so this holds by
    // construction — the assertion is that it stays that way.
    const done = trainedIn(shared, new Set(['a', 'b']));
    expect(new Set(done.skillIds).size).toBe(done.skillIds.length);
  });
});

describe('a goal you have already reached', () => {
  it('stays on the list, because filming it is still ahead of you', () => {
    const ladders: LadderState[] = ['cleanRep', 'filmed'];
    for (const ladder of ladders) {
      const skills = [skill('goal', { ladder, isActive: true })];
      expect(frontier(skills, NOW).map((step) => step.skill.id)).toEqual(['goal']);
    }
  });
});
