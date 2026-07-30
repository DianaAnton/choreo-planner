/**
 * The four extensibility seams from ADR 0009, in one file so the full set of
 * active capabilities is readable at a glance.
 *
 * Adding a capability = adding an entry here. If you find yourself adding a
 * `switch` in a component instead, stop and add a registry entry.
 */

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

export interface DisciplineProfile {
  id: string;
  label: string;
  /** Suggested preset categories; users can always type their own. */
  defaultCategories: readonly string[];
  /** Minimum sensible hold, surfaced as a warning rather than a hard limit. */
  minHoldMs: number;
}

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
  defaultCategories: ['invert', 'spin', 'climb', 'floorwork', 'transition', 'pose'],
  // The brief's "hold every shape at least 3 seconds" constraint.
  minHoldMs: 3000,
};

disciplines.register(POLE);
