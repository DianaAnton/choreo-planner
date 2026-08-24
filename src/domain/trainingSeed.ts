/**
 * A starting path, so the first session opens onto something with shape rather
 * than an empty list. Pure data — no framework imports.
 *
 * **This is a default, not a syllabus.** ADR 0012 reversed ADR 0011 §3's "the
 * app ships no curriculum": shipping nothing put the whole cost of starting on
 * the one moment when the screen is blank and motivation is lowest. Being
 * wrong in an editable field costs a tap; being empty costs a session. Every
 * name, checkpoint and prerequisite here can be changed or deleted.
 *
 * **Names only.** Pole move names are the shared vocabulary of the discipline
 * and belong to no one site. Descriptions, difficulty ratings and curation do,
 * so none are copied and no reference links are invented — the Inbox is how
 * real ones get in. See ADR 0012 §2.
 *
 * Checkpoints lean on the one objective test the app already has: can you hold
 * it for the bar it would occupy (ADR 0011 §6). Where a shape has a left and a
 * right, both sides are their own checkpoint, because one strong side is the
 * most common way a skill looks finished and is not.
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
  /** Starter checkpoints, in order. Ids are minted on write. */
  checkpoints?: readonly string[];
  metric?: { unit: 'seconds' | 'reps' };
}

export const STARTING_PATH: readonly SeedSkill[] = [
  // --- Spins: the entry point, and where grip and swing are learned ---------
  {
    key: 'fireman',
    name: 'Fireman spin',
    kind: 'quest',
    category: 'spin',
    checkpoints: ['Spin down under control, both sides', 'Land without dropping onto the foot'],
  },
  {
    key: 'backhook',
    name: 'Back hook spin',
    kind: 'quest',
    category: 'spin',
    requires: ['fireman'],
    checkpoints: ['Two full rotations, both sides', 'Legs stay together the whole way down'],
  },
  {
    key: 'chair',
    name: 'Chair spin',
    kind: 'quest',
    category: 'spin',
    requires: ['fireman'],
    checkpoints: ['Hold the shape for one full rotation', 'Both sides'],
  },
  {
    key: 'attitude',
    name: 'Attitude spin',
    kind: 'quest',
    category: 'spin',
    requires: ['backhook'],
    checkpoints: ['Shape holds through the whole spin', 'Both sides'],
  },

  // --- Climbs: everything above the floor depends on these ------------------
  {
    key: 'climb',
    name: 'Basic climb',
    kind: 'quest',
    category: 'climb',
    checkpoints: ['Three climbs in a row without resting', 'Climb on the weaker side'],
  },
  {
    key: 'bracket',
    name: 'Bracket hold',
    kind: 'quest',
    category: 'climb',
    requires: ['climb'],
    checkpoints: ['Hold for one 8-count', 'Both sides'],
  },

  // --- The invert line: the road to an Ayesha -------------------------------
  {
    key: 'invert',
    name: 'Basic invert',
    kind: 'quest',
    category: 'invert',
    requires: ['climb'],
    checkpoints: [
      'Invert from the floor with no swing',
      'Hold inverted crucifix for one 8-count',
      'Invert on the weaker side',
    ],
  },
  {
    key: 'gemini',
    name: 'Gemini',
    kind: 'quest',
    category: 'invert',
    requires: ['invert'],
    checkpoints: ['Hold for one 8-count', 'Both sides', 'Enter without the shoulder collapsing'],
  },
  {
    key: 'scorpio',
    name: 'Scorpio',
    kind: 'quest',
    category: 'invert',
    requires: ['gemini'],
    checkpoints: ['Hold for one 8-count', 'Both sides'],
  },
  {
    key: 'jade',
    name: 'Jade split',
    kind: 'quest',
    category: 'invert',
    requires: ['gemini'],
    checkpoints: ['Hold for one 8-count', 'Both sides', 'Back leg straight, not bent'],
  },
  {
    key: 'superman',
    name: 'Superman',
    kind: 'quest',
    category: 'invert',
    requires: ['invert'],
    checkpoints: ['Hold for one 8-count', 'Both sides'],
  },
  {
    key: 'butterfly',
    name: 'Butterfly',
    kind: 'quest',
    category: 'invert',
    requires: ['gemini'],
    checkpoints: ['Hold for one 8-count', 'Both sides', 'Bottom arm stays straight'],
  },
  {
    key: 'extended-butterfly',
    name: 'Extended butterfly',
    kind: 'quest',
    category: 'invert',
    requires: ['butterfly'],
    checkpoints: ['Hold for one 8-count', 'Both sides', 'Hips stack over the shoulders'],
  },
  {
    key: 'ayesha',
    name: 'Ayesha',
    kind: 'quest',
    category: 'invert',
    requires: ['extended-butterfly'],
    checkpoints: [
      'Hold for one 8-count on the strong side',
      'Hold for one 8-count on the weaker side',
      'Enter from a climb rather than from the floor',
    ],
  },

  // --- The shoulder mount line ----------------------------------------------
  {
    key: 'shoulder-mount-prep',
    name: 'Shoulder mount prep',
    kind: 'quest',
    category: 'invert',
    requires: ['invert'],
    checkpoints: ['Deadlift both knees to the chest', 'Five controlled reps, both sides'],
  },
  {
    key: 'shoulder-mount',
    name: 'Shoulder mount',
    kind: 'quest',
    category: 'invert',
    requires: ['shoulder-mount-prep'],
    checkpoints: [
      'Deadlift with no jump, strong side',
      'Deadlift with no jump, weaker side',
      'Hold the top position for one 8-count',
    ],
  },
  {
    key: 'brass-monkey',
    name: 'Brass monkey',
    kind: 'quest',
    category: 'invert',
    requires: ['shoulder-mount'],
    checkpoints: ['Hold for one 8-count', 'Both sides'],
  },

  // --- The handspring line ---------------------------------------------------
  {
    key: 'handspring-prep',
    name: 'Handspring prep',
    kind: 'quest',
    category: 'invert',
    requires: ['butterfly'],
    checkpoints: ['Both feet leave the pole for 3 seconds', 'Bottom arm stays straight'],
  },
  {
    key: 'handspring',
    name: 'Handspring',
    kind: 'quest',
    category: 'invert',
    requires: ['handspring-prep'],
    checkpoints: [
      'Hold for one 8-count on the strong side',
      'Hold for one 8-count on the weaker side',
      'Enter without kicking',
    ],
  },
  {
    key: 'iron-x',
    name: 'Iron X',
    kind: 'quest',
    category: 'invert',
    requires: ['handspring'],
    checkpoints: ['Hold for one 8-count', 'Legs stay level with the hips'],
  },

  // --- Conditioning: uncapped, and where the "ten minutes spare" menu comes
  //     from. The ones with a unit can carry a number from the Log screen.
  {
    key: 'grip',
    name: 'Grip conditioning',
    kind: 'practice',
    category: 'conditioning',
    metric: { unit: 'seconds' },
  },
  {
    key: 'scapular',
    name: 'Scapular conditioning',
    kind: 'practice',
    category: 'conditioning',
    metric: { unit: 'reps' },
  },
  {
    key: 'handstand',
    name: 'Handstand',
    kind: 'practice',
    category: 'conditioning',
    metric: { unit: 'seconds' },
  },
  {
    key: 'hollow',
    name: 'Hollow hold',
    kind: 'practice',
    category: 'conditioning',
    metric: { unit: 'seconds' },
  },
  {
    key: 'pull-ups',
    name: 'Pull-ups',
    kind: 'practice',
    category: 'conditioning',
    metric: { unit: 'reps' },
  },
  {
    key: 'shoulder-mobility',
    name: 'Shoulder mobility',
    kind: 'practice',
    category: 'flexibility',
  },
  {
    key: 'hamstrings',
    name: 'Hamstring flexibility',
    kind: 'practice',
    category: 'flexibility',
    metric: { unit: 'seconds' },
  },
  {
    key: 'bridge',
    name: 'Bridge',
    kind: 'practice',
    category: 'flexibility',
    metric: { unit: 'seconds' },
  },
  {
    key: 'pointed-toes',
    name: 'Feet and toes',
    kind: 'practice',
    category: 'flexibility',
  },
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
