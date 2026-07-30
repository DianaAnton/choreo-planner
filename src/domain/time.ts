/**
 * Beat-grid maths. This is where off-by-one errors live, so it is pure,
 * dependency-free, and heavily unit-tested.
 *
 * Convention: `beat` and `bar` are 0-indexed internally. Display numbering
 * (bar 1, count 1..8) is a presentation concern — convert at the edge.
 */

import type { BeatGrid, Millis, SnapResolution } from './types';

export const DEFAULT_BEATS_PER_BAR = 8;

export function beatDurationMs(grid: BeatGrid): number {
  return 60_000 / grid.bpm;
}

export function barDurationMs(grid: BeatGrid): number {
  return beatDurationMs(grid) * grid.beatsPerBar;
}

/** Fractional beat index at a time. Negative before the first beat. */
export function msToBeat(grid: BeatGrid, ms: Millis): number {
  return (ms - grid.firstBeatOffsetMs) / beatDurationMs(grid);
}

export function beatToMs(grid: BeatGrid, beat: number): Millis {
  return grid.firstBeatOffsetMs + beat * beatDurationMs(grid);
}

/** Which 8-count contains this time. 0-indexed; negative before beat 1. */
export function barIndexAt(grid: BeatGrid, ms: Millis): number {
  return Math.floor(msToBeat(grid, ms) / grid.beatsPerBar);
}

export function barStartMs(grid: BeatGrid, barIndex: number): Millis {
  return beatToMs(grid, barIndex * grid.beatsPerBar);
}

/** Count within the bar, 1-based — the "5" in "5, 6, 7, 8". */
export function countInBar(grid: BeatGrid, ms: Millis): number {
  const beat = Math.floor(msToBeat(grid, ms));
  return ((beat % grid.beatsPerBar) + grid.beatsPerBar) % grid.beatsPerBar + 1;
}

/**
 * How many complete 8-counts fit in a track. The brief's sanity check:
 * 2:45 at 143 BPM ≈ 49.
 */
export function barCount(grid: BeatGrid, durationMs: Millis): number {
  return Math.floor((durationMs - grid.firstBeatOffsetMs) / barDurationMs(grid));
}

function snapUnitMs(grid: BeatGrid, resolution: SnapResolution): number | null {
  switch (resolution) {
    case 'beat':
      return beatDurationMs(grid);
    case 'halfBar':
      return barDurationMs(grid) / 2;
    case 'bar':
      return barDurationMs(grid);
    case 'free':
      return null;
  }
}

/** Snap a time to the grid. `free` returns the input untouched. */
export function snap(grid: BeatGrid, ms: Millis, resolution: SnapResolution): Millis {
  const unit = snapUnitMs(grid, resolution);
  if (unit === null) return ms;

  const offset = ms - grid.firstBeatOffsetMs;
  return Math.round(grid.firstBeatOffsetMs + Math.round(offset / unit) * unit);
}

/** Next grid line at or after `ms` — used when inserting a shape "here". */
export function snapForward(grid: BeatGrid, ms: Millis, resolution: SnapResolution): Millis {
  const unit = snapUnitMs(grid, resolution);
  if (unit === null) return ms;

  const offset = ms - grid.firstBeatOffsetMs;
  return Math.round(grid.firstBeatOffsetMs + Math.ceil(offset / unit) * unit);
}

/**
 * Average the intervals between tap timestamps to suggest a BPM.
 *
 * This is tap-tempo, not beat detection: it reads the user's taps and never
 * inspects the audio. See docs/AGENTS.md.
 *
 * Returns null with fewer than two taps. Only the most recent `window` taps
 * count, so speeding up or slowing down converges instead of averaging forever.
 */
export function bpmFromTaps(tapTimesMs: readonly number[], window = 8): number | null {
  const [first, ...rest] = tapTimesMs.slice(-window);
  if (first === undefined || rest.length === 0) return null;

  let total = 0;
  let prev = first;
  for (const tap of rest) {
    total += tap - prev;
    prev = tap;
  }

  const meanIntervalMs = total / rest.length;
  if (meanIntervalMs <= 0) return null;

  return 60_000 / meanIntervalMs;
}

export function formatTimecode(ms: Millis): string {
  const safe = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((safe % 1000) / 10);

  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}
