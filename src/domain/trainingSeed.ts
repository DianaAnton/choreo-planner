/**
 * A starting path, so the first session opens onto something with shape rather
 * than an empty list. Pure data — no framework imports.
 *
 * Two deliberate omissions:
 *
 * - **No checkpoints.** ADR 0011 §3: checkpoints are user-authored and the app
 *   ships no curriculum. A seeded quest therefore cannot be activated until you
 *   write one, which is the mechanism working, not a gap.
 * - **No reference links.** Refs are real URLs to real videos. Inventing
 *   plausible ones would put dead links in front of someone standing at a pole;
 *   the Inbox is how real ones get in.
 *
 * The chain is the road to one named goal. It is pole-specific and it is a
 * default, not a syllabus — rename, reorder or delete any of it.
 */

import type { SkillKind } from './training';

export interface SeedSkill {
  /** Stable within this file only; real ids are minted on write. */
  key: string;
  name: string;
  kind: SkillKind;
  category?: string;
  /** Keys of prerequisites, resolved to ids as the seed is written. */
  requires?: readonly string[];
  metric?: { unit: 'seconds' | 'reps' };
}

export const AYESHA_ROAD: readonly SeedSkill[] = [
  { key: 'invert', name: 'Basic invert', kind: 'quest', category: 'invert' },
  { key: 'gemini', name: 'Gemini', kind: 'quest', category: 'invert', requires: ['invert'] },
  {
    key: 'butterfly',
    name: 'Butterfly',
    kind: 'quest',
    category: 'invert',
    requires: ['gemini'],
  },
  {
    key: 'extended-butterfly',
    name: 'Extended butterfly',
    kind: 'quest',
    category: 'invert',
    requires: ['butterfly'],
  },
  {
    key: 'ayesha',
    name: 'Ayesha',
    kind: 'quest',
    category: 'invert',
    requires: ['extended-butterfly'],
  },

  // The maintenance work open training is actually made of. Uncapped, and the
  // two with a unit can carry a number from the Log screen.
  { key: 'grip', name: 'Grip conditioning', kind: 'practice', metric: { unit: 'seconds' } },
  {
    key: 'shoulders',
    name: 'Scapular conditioning',
    kind: 'practice',
    metric: { unit: 'reps' },
  },
  { key: 'handstand', name: 'Handstand', kind: 'practice', metric: { unit: 'seconds' } },
  { key: 'pendulum', name: 'Pendulum', kind: 'practice', category: 'spin' },
  { key: 'spins', name: 'Static spins', kind: 'practice', category: 'spin' },
];

/**
 * Prerequisites first, so each skill can be written with its `requires` already
 * resolved to real ids. Throws on a cycle rather than looping — a seed that
 * silently writes half a chain is worse than one that refuses.
 */
export function inPrerequisiteOrder(seed: readonly SeedSkill[]): SeedSkill[] {
  const remaining = [...seed];
  const placed = new Set<string>();
  const ordered: SeedSkill[] = [];

  while (remaining.length > 0) {
    const index = remaining.findIndex((item) =>
      (item.requires ?? []).every((key) => placed.has(key)),
    );
    if (index === -1) {
      throw new Error(
        `Seed has a cycle or a missing prerequisite: ${remaining.map((i) => i.key).join(', ')}`,
      );
    }

    const [next] = remaining.splice(index, 1);
    if (!next) break;
    placed.add(next.key);
    ordered.push(next);
  }

  return ordered;
}
