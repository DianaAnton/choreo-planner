import { describe, expect, it } from 'vitest';

import { AYESHA_ROAD, inPrerequisiteOrder, type SeedSkill } from './trainingSeed';

describe('the seeded path', () => {
  it('ships no checkpoints — the app has no curriculum (ADR 0011 §3)', () => {
    // A seeded quest is therefore inactivatable until you write one. That is
    // the mechanism, not an oversight.
    for (const item of AYESHA_ROAD) {
      expect(Object.keys(item)).not.toContain('checkpoints');
    }
  });

  it('ships no reference links — never invent a URL someone will tap at a pole', () => {
    for (const item of AYESHA_ROAD) {
      expect(Object.keys(item)).not.toContain('refs');
    }
  });

  it('names every prerequisite it references', () => {
    const keys = new Set(AYESHA_ROAD.map((item) => item.key));
    for (const item of AYESHA_ROAD) {
      for (const required of item.requires ?? []) expect(keys).toContain(required);
    }
  });

  it('orders prerequisites before the skills that need them', () => {
    const ordered = inPrerequisiteOrder(AYESHA_ROAD).map((item) => item.key);
    for (const item of AYESHA_ROAD) {
      for (const required of item.requires ?? []) {
        expect(ordered.indexOf(required)).toBeLessThan(ordered.indexOf(item.key));
      }
    }
    expect(ordered).toHaveLength(AYESHA_ROAD.length);
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
