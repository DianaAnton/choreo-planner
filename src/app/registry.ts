/**
 * The four extensibility seams from ADR 0009, in one file so the full set of
 * active capabilities is readable at a glance.
 *
 * Adding a capability = adding an entry here. If you find yourself adding a
 * `switch` in a component instead, stop and add a registry entry.
 */

import type { DisciplineProfile } from '../domain/discipline';
import type { Project, ShapeEntrySource } from '../domain/types';

// --- Timeline layers -------------------------------------------------------

export interface TimelineViewport {
  startMs: number;
  endMs: number;
  pxPerMs: number;
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface TimelineLayer<TState = unknown> {
  id: string;
  /** Draw order, low to high. Playhead is highest. */
  zIndex: number;
  draw(ctx: CanvasRenderingContext2D, viewport: TimelineViewport, state: TState): void;
  hitTest?(point: { x: number; y: number }, viewport: TimelineViewport, state: TState): unknown;
}

// --- Shape sources ---------------------------------------------------------

export interface ShapeSourceDefinition {
  kind: ShapeEntrySource['kind'];
  label: string;
  /** Both v1 sources are shown side by side, as the brief requires. */
  order: number;
  describe(source: ShapeEntrySource): string;
}

// --- Disciplines -----------------------------------------------------------

/**
 * The type lives in `domain/discipline.ts` so features can read a profile
 * without importing from `app/`. The registry and the registrations stay here,
 * per ADR 0009 — the full set of active capabilities in one file.
 */
export type { DisciplineProfile, CleanRepTest } from '../domain/discipline';

// --- Exporters -------------------------------------------------------------

export interface Exporter {
  id: string;
  label: string;
  run(project: Project): Promise<void>;
}

// --- The registries --------------------------------------------------------

function createRegistry<T extends { id: string }>() {
  const items = new Map<string, T>();
  return {
    register(item: T): void {
      if (items.has(item.id)) throw new Error(`Duplicate registry entry: ${item.id}`);
      items.set(item.id, item);
    },
    all(): T[] {
      return [...items.values()];
    },
    get(id: string): T | undefined {
      return items.get(id);
    },
  };
}

export const timelineLayers = createRegistry<TimelineLayer>();
export const disciplines = createRegistry<DisciplineProfile>();
export const shapeSources = createRegistry<ShapeSourceDefinition & { id: string }>();
/** Intentionally empty in v1 — the seam exists so export lands as a plugin. */
export const exporters = createRegistry<Exporter>();

// --- v1 registrations ------------------------------------------------------

export const POLE: DisciplineProfile = {
  id: 'pole',
  label: 'Pole',
  defaultCategories: ['invert', 'spin', 'climb', 'floorwork', 'transition', 'conditioning', 'flexibility'],
  categoryLabels: {
    invert: 'Inverts and holds',
    spin: 'Spins',
    climb: 'Climbs',
    floorwork: 'Floorwork',
    transition: 'Transitions',
    conditioning: 'Conditioning',
    flexibility: 'Flexibility',
  },
  // The brief's "hold every shape at least 3 seconds" constraint.
  cleanRepTest: { kind: 'hold', minMs: 3000 },
  hasChoreo: true,

  /**
   * The order is the argument, and it is not the order you would write down.
   *
   * Goal work goes second, on a fresh grip — deadlifting into a shoulder mount
   * is the hardest thing in the session and the first thing to fall apart when
   * the forearms are gone. Conditioning goes *last* for the same reason: grip
   * and scapular work is what burns out the hands you need for the pole, so
   * doing it first buys a tired session in exchange for feeling productive
   * early. Spins sit between them because by then the hard part is done and
   * you should be moving rather than gripping.
   */
  sessionShape: [
    {
      kind: 'fixed',
      id: 'warmup',
      label: 'Warm up',
      minutes: 8,
      note: 'Yours. Tick it when it is done.',
    },
    {
      kind: 'skills',
      id: 'goal',
      label: 'Goal work',
      weight: 3,
      maxSkills: 2,
      pick: { from: 'frontier' },
      note: 'The nearest thing on the way to what you are working towards — not the goal itself. Both sides, and stop before the shape goes.',
    },
    {
      kind: 'skills',
      id: 'flow',
      label: 'Spins and shapes',
      weight: 2,
      maxSkills: 3,
      pick: { from: 'categories', categories: ['spin', 'climb', 'floorwork', 'transition'] },
      note: 'Whatever has gone longest untouched. The hard part is behind you — move rather than grip.',
    },
    {
      kind: 'skills',
      id: 'conditioning',
      label: 'Conditioning',
      weight: 2,
      maxSkills: 2,
      // Conditioning only, not flexibility. Drawn from both, a stalest-first
      // pick reliably surfaced a bridge and some ankle work in the block that
      // is supposed to be building the straight-arm strength everything above
      // it is waiting on. Stretching belongs either side of the session, which
      // is where the warm-up and cool-down already are.
      pick: { from: 'categories', categories: ['conditioning'] },
      note: 'Last on purpose: this is what burns out the grip everything above needs.',
    },
    {
      kind: 'fixed',
      id: 'cooldown',
      label: 'Cool down',
      minutes: 5,
      note: 'Yours. Tick it when it is done.',
    },
  ],
};

/**
 * The second discipline, and the one that proved the seam was real (ADR 0013).
 *
 * Two things had to give. `cleanRep` cannot be a duration — an ollie is landed
 * or it is not — so the test is a ratio. And the ladder's terminal rung is "in
 * a line", not "in a choreo": the same idea, which is why only the label
 * changed and not the ordinal.
 */
export const SKATEBOARD: DisciplineProfile = {
  id: 'skateboard',
  label: 'Skateboard',
  defaultCategories: ['basics', 'flatground', 'grind', 'transition', 'conditioning'],
  categoryLabels: {
    basics: 'Getting rolling',
    flatground: 'Flatground',
    grind: 'Grinds and slides',
    transition: 'Transition',
    conditioning: 'Body prep',
  },
  cleanRepTest: { kind: 'consistency', land: 8, outOf: 10 },
  ladderLabels: { inChoreo: 'In a line' },
  ladderDescriptions: {
    cleanRep: 'Landed and rolled away eight times in ten, both directions where that applies.',
    inChoreo: 'Landed in a line, between other tricks, without setting up for it.',
  },
  hasChoreo: false,

  /**
   * The same skeleton, worded and ordered for a session at a park. Trick work
   * early, when the legs are fresh and a slam is least likely; lines after,
   * because linking tricks is the part you can still do tired; body prep last.
   */
  sessionShape: [
    {
      kind: 'fixed',
      id: 'warmup',
      label: 'Warm up',
      minutes: 8,
      note: 'Yours. Tick it when it is done.',
    },
    {
      kind: 'skills',
      id: 'goal',
      label: 'Trick work',
      weight: 3,
      maxSkills: 2,
      pick: { from: 'frontier' },
      note: 'The nearest trick on the way to what you are working towards — not the trick itself.',
    },
    {
      kind: 'skills',
      id: 'flow',
      label: 'Lines',
      weight: 2,
      maxSkills: 3,
      pick: { from: 'categories', categories: ['basics', 'flatground', 'grind', 'transition'] },
      note: 'Whatever has gone longest untouched, rolled into something continuous.',
    },
    {
      kind: 'skills',
      id: 'conditioning',
      label: 'Body prep',
      weight: 2,
      maxSkills: 2,
      pick: { from: 'categories', categories: ['conditioning'] },
      note: 'Ankles and legs, after the skating rather than before it.',
    },
    {
      kind: 'fixed',
      id: 'cooldown',
      label: 'Cool down',
      minutes: 5,
      note: 'Yours. Tick it when it is done.',
    },
  ],
};

disciplines.register(POLE);
disciplines.register(SKATEBOARD);
