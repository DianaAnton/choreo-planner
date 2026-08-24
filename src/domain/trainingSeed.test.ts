import { describe, expect, it } from 'vitest';

import { STARTING_PATH, inPrerequisiteOrder, type SeedSkill } from './trainingSeed';

describe('the starting curriculum', () => {
  it('ships checkpoints on every quest — ADR 0012 reversed the empty-seed decision', () => {
    // An empty tracker put the whole cost of starting on the blank screen. A
    // seeded quest with no checkpoint could not even be activated.
    const questsWithout = STARTING_PATH.filter(
      (item) => item.kind === 'quest' && (item.checkpoints?.length ?? 0) === 0,
    );
    expect(questsWithout.map((item) => item.key)).toEqual([]);
  });

  it('ships no reference links — never invent a URL someone will tap at a pole', () => {
    for (const item of STARTING_PATH) {
      expect(Object.keys(item)).not.toContain('refs');
    }
  });

  it('ships names only, with no borrowed descriptions', () => {
    // Move names are the shared vocabulary of the discipline. Descriptions,
    // ratings and curation are not ours to copy (ADR 0012 §2).
    for (const item of STARTING_PATH) {
      expect(Object.keys(item)).not.toContain('notes');
    }
  });

  it('names every prerequisite it references', () => {
    const keys = new Set(STARTING_PATH.map((item) => item.key));
    for (const item of STARTING_PATH) {
      for (const required of item.requires ?? []) expect(keys).toContain(required);
    }
  });

  it('uses each key once, so the id map cannot silently collide', () => {
    const keys = STARTING_PATH.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every conditioning metric a unit, or the Log screen cannot take a number', () => {
    // improvedMetric returns null without a unit, so a number logged against a
    // unitless skill is silently discarded.
    for (const item of STARTING_PATH) {
      if (item.metric) expect(['seconds', 'reps']).toContain(item.metric.unit);
    }
  });

  it('only puts prerequisites on quests — practice has no endpoint to gate', () => {
    for (const item of STARTING_PATH) {
      if (item.kind === 'practice') expect(item.requires ?? []).toEqual([]);
    }
  });

  it('reaches the three named goals through a chain, not as orphans', () => {
    const byKey = new Map(STARTING_PATH.map((item) => [item.key, item]));
    for (const goal of ['ayesha', 'shoulder-mount', 'handspring']) {
      expect(byKey.get(goal)?.requires?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('orders prerequisites before the skills that need them', () => {
    const ordered = inPrerequisiteOrder(STARTING_PATH).map((item) => item.key);
    for (const item of STARTING_PATH) {
      for (const required of item.requires ?? []) {
        expect(ordered.indexOf(required)).toBeLessThan(ordered.indexOf(item.key));
      }
    }
    expect(ordered).toHaveLength(STARTING_PATH.length);
  });

  it('refuses a cycle rather than looping forever', () => {
    const cyclic: SeedSkill[] = [
      { key: 'a', name: 'A', kind: 'quest', requires: ['b'] },
      { key: 'b', name: 'B', kind: 'quest', requires: ['a'] },
    ];
    expect(() => inPrerequisiteOrder(cyclic)).toThrow(/cycle or a missing prerequisite/);
  });

  it('refuses a prerequisite that is not in the seed', () => {
    const dangling: SeedSkill[] = [{ key: 'a', name: 'A', kind: 'quest', requires: ['ghost'] }];
    expect(() => inPrerequisiteOrder(dangling)).toThrow();
  });
});
