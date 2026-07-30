import { DEFAULT_BEATS_PER_BAR, barCount, barDurationMs } from '../domain/time';
import type { BeatGrid } from '../domain/types';
import { POLE } from './registry';

// Placeholder shell. Real screens arrive in Phase 2 — see docs/plan.md.
const grid: BeatGrid = { bpm: 143, firstBeatOffsetMs: 0, beatsPerBar: DEFAULT_BEATS_PER_BAR };
const trackMs = 165_000;

export default function App() {
  return (
    <main className="shell">
      <h1>Choreo Planner</h1>
      <p>Scaffold only — see <code>docs/plan.md</code> for what lands next.</p>
      <dl>
        <dt>Discipline</dt>
        <dd>{POLE.label} · minimum hold {POLE.minHoldMs / 1000}s</dd>
        <dt>Grid</dt>
        <dd>
          {grid.bpm} BPM · one {grid.beatsPerBar}-count ={' '}
          {(barDurationMs(grid) / 1000).toFixed(2)}s
        </dd>
        <dt>2:45 track</dt>
        <dd>{barCount(grid, trackMs)} eight-counts</dd>
      </dl>
    </main>
  );
}
