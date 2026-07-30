import { describe, expect, it } from 'vitest';

import {
  barCount,
  barDurationMs,
  barIndexAt,
  beatDurationMs,
  bpmFromTaps,
  countInBar,
  formatTimecode,
  msToBeat,
  snap,
  snapForward,
} from './time';
import type { BeatGrid } from './types';

/** The first project: Code Mistake, 143 BPM, 2:45. A test case, not a spec. */
const grid: BeatGrid = { bpm: 143, firstBeatOffsetMs: 0, beatsPerBar: 8 };
const TRACK_MS = 165_000; // 2:45

describe('beat maths', () => {
  it('derives beat and bar durations from BPM', () => {
    expect(beatDurationMs(grid)).toBeCloseTo(419.58, 2);
    // The brief's "one 8-count is ~3.4 seconds" claim.
    expect(barDurationMs(grid)).toBeCloseTo(3356.64, 2);
  });

  it('matches the brief: 2:45 at 143 BPM is roughly 49 eight-counts', () => {
    expect(barCount(grid, TRACK_MS)).toBe(49);
  });

  it('respects the first-beat offset', () => {
    const offset: BeatGrid = { ...grid, firstBeatOffsetMs: 500 };
    expect(msToBeat(offset, 500)).toBe(0);
    expect(msToBeat(offset, 0)).toBeLessThan(0);
    expect(barIndexAt(offset, 400)).toBe(-1);
  });

  it('counts 1..8 within a bar and wraps at the boundary', () => {
    expect(countInBar(grid, 0)).toBe(1);
    expect(countInBar(grid, beatDurationMs(grid) * 4.5)).toBe(5);
    expect(countInBar(grid, beatDurationMs(grid) * 7.9)).toBe(8);
    expect(countInBar(grid, barDurationMs(grid))).toBe(1);
  });

  it('counts correctly before the first beat instead of returning 0 or negatives', () => {
    const offset: BeatGrid = { ...grid, firstBeatOffsetMs: 1000 };
    const c = countInBar(offset, 0);
    expect(c).toBeGreaterThanOrEqual(1);
    expect(c).toBeLessThanOrEqual(8);
  });
});

describe('snapping', () => {
  it('snaps to the nearest unit', () => {
    const bar = barDurationMs(grid);
    expect(snap(grid, bar * 0.4, 'bar')).toBe(0);
    expect(snap(grid, bar * 0.6, 'bar')).toBe(Math.round(bar));
    expect(snap(grid, bar * 0.6, 'halfBar')).toBe(Math.round(bar / 2));
  });

  it('leaves the value alone when snapping is off', () => {
    expect(snap(grid, 1234, 'free')).toBe(1234);
  });

  it('snaps forward to the next line, never backwards', () => {
    const bar = barDurationMs(grid);
    expect(snapForward(grid, bar * 0.1, 'bar')).toBe(Math.round(bar));
    expect(snapForward(grid, bar * 1.9, 'bar')).toBe(Math.round(bar * 2));
  });

  it('snaps relative to the offset, not to zero', () => {
    const offset: BeatGrid = { ...grid, firstBeatOffsetMs: 700 };
    expect(snap(offset, 750, 'bar')).toBe(700);
  });
});

describe('tap tempo', () => {
  it('needs at least two taps', () => {
    expect(bpmFromTaps([])).toBeNull();
    expect(bpmFromTaps([1000])).toBeNull();
  });

  it('recovers the BPM from evenly spaced taps', () => {
    const interval = 60_000 / 143;
    const taps = Array.from({ length: 8 }, (_, i) => 5000 + i * interval);
    expect(bpmFromTaps(taps)).toBeCloseTo(143, 6);
  });

  it('only considers the most recent taps, so a tempo change converges', () => {
    const slow = Array.from({ length: 8 }, (_, i) => i * 1000); // 60 BPM
    const fast = Array.from({ length: 8 }, (_, i) => 8000 + i * 500); // 120 BPM
    expect(bpmFromTaps([...slow, ...fast], 8)).toBeCloseTo(120, 0);
  });
});

describe('formatTimecode', () => {
  it('formats as m:ss.hh', () => {
    expect(formatTimecode(0)).toBe('0:00.00');
    expect(formatTimecode(165_000)).toBe('2:45.00');
    expect(formatTimecode(61_234)).toBe('1:01.23');
  });

  it('clamps negatives instead of rendering "-0:00"', () => {
    expect(formatTimecode(-50)).toBe('0:00.00');
  });
});
