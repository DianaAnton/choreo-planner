import { describe, expect, it } from 'vitest';

import {
  categoryLabel,
  describeCleanRep,
  ladderDescriptionsFor,
  ladderLabelsFor,
  meetsConsistency,
  type DisciplineProfile,
} from './discipline';
import { LADDER, LADDER_LABELS } from './training';

const pole: DisciplineProfile = {
  id: 'pole',
  label: 'Pole',
  defaultCategories: ['invert'],
  categoryLabels: { invert: 'Inverts and holds' },
  cleanRepTest: { kind: 'hold', minMs: 3000 },
  hasChoreo: true,
};

const skate: DisciplineProfile = {
  id: 'skateboard',
  label: 'Skateboard',
  defaultCategories: ['flatground'],
  cleanRepTest: { kind: 'consistency', land: 8, outOf: 10 },
  ladderLabels: { inChoreo: 'In a line' },
  hasChoreo: false,
};

describe('the cleanRep test', () => {
  it('describes a hold in seconds and a landing as a ratio', () => {
    expect(describeCleanRep(pole.cleanRepTest)).toContain('3.0s');
    expect(describeCleanRep(skate.cleanRepTest)).toBe('Landed 8 out of 10.');
  });

  it('passes on the ratio, not the raw count', () => {
    // 4 of 5 clears an 8-of-10 bar. Demanding ten attempts to prove a trick you
    // just landed four times running is bookkeeping, not a standard.
    expect(meetsConsistency(4, 5, skate.cleanRepTest)).toBe(true);
    expect(meetsConsistency(8, 10, skate.cleanRepTest)).toBe(true);
    expect(meetsConsistency(7, 10, skate.cleanRepTest)).toBe(false);
    expect(meetsConsistency(3, 5, skate.cleanRepTest)).toBe(false);
  });

  it('refuses nonsense rather than reporting a pass', () => {
    expect(meetsConsistency(5, 0, skate.cleanRepTest)).toBe(false);
    expect(meetsConsistency(11, 10, skate.cleanRepTest)).toBe(false);
    expect(meetsConsistency(-1, 10, skate.cleanRepTest)).toBe(false);
  });

  it('never reports a consistency pass against a hold test', () => {
    // An ollie is not a hold, and a hold is not eight of ten. Asking the wrong
    // question must not accidentally answer yes.
    expect(meetsConsistency(10, 10, pole.cleanRepTest)).toBe(false);
  });
});

describe('ladder wording', () => {
  it('takes the discipline override where there is one', () => {
    expect(ladderLabelsFor(skate).inChoreo).toBe('In a line');
    expect(ladderLabelsFor(pole).inChoreo).toBe(LADDER_LABELS.inChoreo);
  });

  it('keeps every rung, overridden or not — the ordinal is universal', () => {
    for (const profile of [pole, skate]) {
      const labels = ladderLabelsFor(profile);
      const descriptions = ladderDescriptionsFor(profile);
      for (const rung of LADDER) {
        expect(labels[rung]).toBeTruthy();
        expect(descriptions[rung]).toBeTruthy();
      }
    }
  });
});

describe('category labels', () => {
  it('uses the profile’s name, and capitalises an unknown key rather than hiding it', () => {
    expect(categoryLabel(pole, 'invert')).toBe('Inverts and holds');
    expect(categoryLabel(skate, 'flatground')).toBe('Flatground');
    // A category the user typed themselves still has to render.
    expect(categoryLabel(pole, 'floorwork')).toBe('Floorwork');
    expect(categoryLabel(pole, '')).toBe('');
  });
});
