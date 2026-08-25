import { describe, expect, it } from 'vitest';

import {
  POLE_PATH,
  SKATEBOARD_PATH,
  STARTING_PATHS,
  inPrerequisiteOrder,
  startingPathFor,
  type SeedSkill,
} from './trainingSeed';

/** Every rule below must hold for every discipline, not just the first one. */
describe.each(Object.entries(STARTING_PATHS))('the %s curriculum', (_id, STARTING_PATH) => {
  it('ships checkpoints on every quest — ADR 0012 reversed the empty-seed decision', () => {
    // An empty tracker put the whole cost of starting on the blank screen. A
    // seeded quest with no checkpoint could not even be activated.
    // A seeded skill is a quest exactly when it ships checkpoints (ADR 0014),
    // so this now asserts the shape of the seed rather than a field agreeing
    // with another field.
    const quests = STARTING_PATH.filter((item) => (item.checkpoints?.length ?? 0) > 0);
    expect(quests.length).toBeGreaterThanOrEqual(STARTING_PATH.length / 2);
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
      if ((item.checkpoints?.length ?? 0) === 0) expect(item.requires ?? []).toEqual([]);
    }
  });

  it('has real depth rather than a flat pile of names', () => {
    // A curriculum where nothing requires anything is a list, and the map has
    // nothing to draw.
    const withPrerequisites = STARTING_PATH.filter((item) => (item.requires?.length ?? 0) > 0);
    expect(withPrerequisites.length).toBeGreaterThanOrEqual(STARTING_PATH.length / 3);
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
      { key: 'a', name: 'A', requires: ['b'] },
      { key: 'b', name: 'B', requires: ['a'] },
    ];
    expect(() => inPrerequisiteOrder(cyclic)).toThrow(/cycle or a missing prerequisite/);
  });

  it('refuses a prerequisite that is not in the seed', () => {
    const dangling: SeedSkill[] = [{ key: 'a', name: 'A', requires: ['ghost'] }];
    expect(() => inPrerequisiteOrder(dangling)).toThrow();
  });
});

describe('per-discipline seeds', () => {
  it('reaches the pole goals through a chain, not as orphans', () => {
    const byKey = new Map(POLE_PATH.map((item) => [item.key, item]));
    for (const goal of ['ayesha', 'shoulder-mount', 'handspring']) {
      expect(byKey.get(goal)?.requires?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('hangs the skate graph off the ollie, which is what actually gates it', () => {
    const byKey = new Map(SKATEBOARD_PATH.map((item) => [item.key, item]));
    for (const trick of ['kickflip', 'boardslide', 'fifty-fifty', 'ollie-curb']) {
      const road = new Set<string>();
      const walk = (key: string) => {
        if (road.has(key)) return;
        road.add(key);
        for (const required of byKey.get(key)?.requires ?? []) walk(required);
      };
      walk(trick);
      expect([...road]).toContain('ollie');
    }
  });

  it('writes skate checkpoints against a ratio, not a duration', () => {
    // cleanRep is a consistency test for skateboarding: an ollie is landed or
    // it is not, so "hold it for 3 seconds" would be meaningless.
    const text = SKATEBOARD_PATH.flatMap((item) => item.checkpoints ?? []).join(' ');
    expect(text).toMatch(/\d+ of \d+/);
    expect(text).not.toMatch(/8-count/);
  });

  it('returns an empty path for a discipline that ships without one', () => {
    // A discipline with no curriculum still works — you start from an empty map.
    expect(startingPathFor('unicycle')).toEqual([]);
    expect(startingPathFor('pole')).toBe(POLE_PATH);
  });

  it('keeps keys unique within each discipline but lets them repeat across', () => {
    for (const path of Object.values(STARTING_PATHS)) {
      const keys = path.map((item) => item.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
