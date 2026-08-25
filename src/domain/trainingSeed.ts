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

export const POLE_PATH: readonly SeedSkill[] = [
  // --- Spins: the entry point, and where grip and swing are learned ---------
  {
    key: 'fireman',
    name: 'Fireman spin',
    kind: 'quest',
    category: 'spin',
    checkpoints: [
      'Spin down under control, both sides',
      'Land without dropping onto the foot',
      'Two rotations before the feet touch',
      'Point the toes the whole way down',
    ],
  },
  {
    key: 'backhook',
    name: 'Back hook spin',
    kind: 'quest',
    category: 'spin',
    requires: ['fireman'],
    checkpoints: [
      'Two full rotations, both sides',
      'Legs stay together the whole way down',
      'Enter without a run-up',
      'Hold the shape rather than falling into it',
    ],
  },
  {
    key: 'chair',
    name: 'Chair spin',
    kind: 'quest',
    category: 'spin',
    requires: ['fireman'],
    checkpoints: [
      'Hold the shape for one full rotation',
      'Both sides',
      'Knees stay level with each other',
      'No grip readjustment mid-spin',
    ],
  },
  {
    key: 'attitude',
    name: 'Attitude spin',
    kind: 'quest',
    category: 'spin',
    requires: ['backhook'],
    checkpoints: [
      'Shape holds through the whole spin',
      'Both sides',
      'Back leg turned out, not just bent',
      'Head and chest stay lifted',
    ],
  },

  // --- Climbs: everything above the floor depends on these ------------------
  {
    key: 'climb',
    name: 'Basic climb',
    kind: 'quest',
    category: 'climb',
    checkpoints: [
      'Three climbs in a row without resting',
      'Climb on the weaker side',
      'Reach the top of the pole',
      'Climb without the feet slipping on the first pull',
    ],
  },
  {
    key: 'bracket',
    name: 'Bracket hold',
    kind: 'quest',
    category: 'climb',
    requires: ['climb'],
    checkpoints: [
      'Hold for one 8-count',
      'Both sides',
      'Hips stay square to the pole',
      'Enter from a climb rather than from the floor',
    ],
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
      'Five controlled inverts in a row',
      'Lower out slowly instead of dropping',
    ],
  },
  {
    key: 'gemini',
    name: 'Gemini',
    kind: 'quest',
    category: 'invert',
    requires: ['invert'],
    checkpoints: [
      'Hold for one 8-count',
      'Both sides',
      'Enter without the shoulder collapsing',
      'Top leg straight',
      'Let go with both hands for 3 seconds',
    ],
  },
  {
    key: 'scorpio',
    name: 'Scorpio',
    kind: 'quest',
    category: 'invert',
    requires: ['gemini'],
    checkpoints: [
      'Hold for one 8-count',
      'Both sides',
      'Back leg reaches the pole',
      'Chest stays open rather than folding',
    ],
  },
  {
    key: 'jade',
    name: 'Jade split',
    kind: 'quest',
    category: 'invert',
    requires: ['gemini'],
    checkpoints: [
      'Hold for one 8-count',
      'Both sides',
      'Back leg straight, not bent',
      'Split line looks even in a photo',
    ],
  },
  {
    key: 'superman',
    name: 'Superman',
    kind: 'quest',
    category: 'invert',
    requires: ['invert'],
    checkpoints: [
      'Hold for one 8-count',
      'Both sides',
      'Hips stay in contact with the pole',
      'Enter without kicking the bottom leg',
    ],
  },
  {
    key: 'butterfly',
    name: 'Butterfly',
    kind: 'quest',
    category: 'invert',
    requires: ['gemini'],
    checkpoints: [
      'Hold for one 8-count',
      'Both sides',
      'Bottom arm stays straight',
      'Shoulder stays packed, not shrugged',
      'Enter slowly rather than dropping in',
    ],
  },
  {
    key: 'extended-butterfly',
    name: 'Extended butterfly',
    kind: 'quest',
    category: 'invert',
    requires: ['butterfly'],
    checkpoints: [
      'Hold for one 8-count',
      'Both sides',
      'Hips stack over the shoulders',
      'Both legs straight at the same time',
      'Come back down to butterfly under control',
    ],
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
      'Straight bottom arm throughout',
      'Film it and agree with what you see',
    ],
  },

  // --- The shoulder mount line ----------------------------------------------
  {
    key: 'shoulder-mount-prep',
    name: 'Shoulder mount prep',
    kind: 'quest',
    category: 'invert',
    requires: ['invert'],
    checkpoints: [
      'Deadlift both knees to the chest',
      'Five controlled reps, both sides',
      'No jump off the floor',
      'Neck stays off the pole',
    ],
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
      'Three in a row without resting',
    ],
  },
  {
    key: 'brass-monkey',
    name: 'Brass monkey',
    kind: 'quest',
    category: 'invert',
    requires: ['shoulder-mount'],
    checkpoints: [
      'Hold for one 8-count',
      'Both sides',
      'Both hands off for 3 seconds',
      'Enter from a shoulder mount rather than from an invert',
    ],
  },

  // --- The handspring line ---------------------------------------------------
  {
    key: 'handspring-prep',
    name: 'Handspring prep',
    kind: 'quest',
    category: 'invert',
    requires: ['butterfly'],
    checkpoints: [
      'Both feet leave the pole for 3 seconds',
      'Bottom arm stays straight',
      'Both sides',
      'Hips stay above the shoulders',
    ],
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
      'Straight bottom arm throughout',
      'Film it and agree with what you see',
    ],
  },
  {
    key: 'iron-x',
    name: 'Iron X',
    kind: 'quest',
    category: 'invert',
    requires: ['handspring'],
    checkpoints: [
      'Hold for one 8-count',
      'Legs stay level with the hips',
      'Both sides',
      'Enter from a handspring under control',
    ],
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
 * Skateboarding. The ollie is the hinge — almost nothing flatground or on
 * obstacles exists without it — so the graph is deliberately narrow at the top
 * and fans out hard once it is landed.
 *
 * Checkpoints are written against the discipline's `cleanRepTest`, which is a
 * ratio here rather than a duration: an ollie is landed or it is not.
 */
export const SKATEBOARD_PATH: readonly SeedSkill[] = [
  // --- Getting rolling -------------------------------------------------------
  {
    key: 'push',
    name: 'Pushing and riding',
    kind: 'quest',
    category: 'basics',
    checkpoints: [
      'Push and roll the length of the park without stepping off',
      'Push comfortably in your natural stance',
      'Foot lands back on the bolts without looking down',
      'Stop on purpose, not by running out of speed',
    ],
  },
  {
    key: 'kickturn',
    name: 'Kickturn',
    kind: 'quest',
    category: 'basics',
    requires: ['push'],
    checkpoints: [
      'Turn 90° rolling, both directions',
      'Nose comes off the ground rather than pivoting flat',
      'Land 8 of 10 without putting a foot down',
    ],
  },
  {
    key: 'tictac',
    name: 'Tic-tac',
    kind: 'quest',
    category: 'basics',
    requires: ['push'],
    checkpoints: [
      'Ten tic-tacs in a row without a foot down',
      'Gain speed from tic-tacs alone, no pushing',
    ],
  },
  {
    key: 'fakie',
    name: 'Rolling fakie',
    kind: 'quest',
    category: 'basics',
    requires: ['push'],
    checkpoints: [
      'Roll fakie the length of the park',
      'Kickturn out of fakie without stepping off',
      'It stops feeling backwards',
    ],
  },

  // --- The ollie, and everything that hangs off it ----------------------------
  {
    key: 'ollie',
    name: 'Ollie (stationary)',
    kind: 'quest',
    category: 'flatground',
    requires: ['push'],
    checkpoints: [
      'Both wheels leave the ground',
      'Land on the bolts, 8 of 10',
      'Level in the air — nose and tail land together',
      'Ollie over a flat obstacle, not just up',
    ],
  },
  {
    key: 'rolling-ollie',
    name: 'Rolling ollie',
    kind: 'quest',
    category: 'flatground',
    requires: ['ollie'],
    checkpoints: [
      'Ollie at rolling speed, 8 of 10',
      'Roll away without a foot down',
      'Ollie without slowing down first',
      'Clear a crack or a line on the ground',
    ],
  },
  {
    key: 'ollie-curb',
    name: 'Ollie up a curb',
    kind: 'quest',
    category: 'flatground',
    requires: ['rolling-ollie'],
    checkpoints: [
      'Up a full curb, 8 of 10',
      'Roll away clean, no foot down',
      'Approach at an angle rather than straight on',
    ],
  },
  {
    key: 'shuvit',
    name: 'Shuvit',
    kind: 'quest',
    category: 'flatground',
    requires: ['push'],
    checkpoints: [
      'Board turns a full 180°',
      'Land on the bolts, 8 of 10',
      'Feet stay over the board rather than jumping clear',
    ],
  },
  {
    key: 'pop-shuvit',
    name: 'Pop shuvit',
    kind: 'quest',
    category: 'flatground',
    requires: ['ollie', 'shuvit'],
    checkpoints: [
      'Tail pops rather than scooping flat',
      'Land 8 of 10 rolling',
      'No fishing for the board with the back foot',
    ],
  },
  {
    key: 'fs-pop-shuvit',
    name: 'Frontside pop shuvit',
    kind: 'quest',
    category: 'flatground',
    requires: ['pop-shuvit'],
    checkpoints: ['Land 8 of 10 rolling', 'Shoulders stay square'],
  },
  {
    key: 'kickflip',
    name: 'Kickflip',
    kind: 'quest',
    category: 'flatground',
    requires: ['rolling-ollie'],
    checkpoints: [
      'Board completes the flip',
      'Catch it with the back foot first',
      'Land 8 of 10 rolling away',
      'Film it and agree with what you see',
    ],
  },
  {
    key: 'heelflip',
    name: 'Heelflip',
    kind: 'quest',
    category: 'flatground',
    requires: ['rolling-ollie'],
    checkpoints: ['Board completes the flip', 'Land 8 of 10 rolling away'],
  },
  {
    key: 'varial-kickflip',
    name: 'Varial kickflip',
    kind: 'quest',
    category: 'flatground',
    requires: ['kickflip', 'pop-shuvit'],
    checkpoints: ['Board flips and rotates together', 'Land 8 of 10 rolling away'],
  },

  // --- Manuals ---------------------------------------------------------------
  {
    key: 'manual',
    name: 'Manual',
    kind: 'quest',
    category: 'flatground',
    requires: ['push'],
    checkpoints: [
      'Hold for three board lengths',
      'Come down without the tail scraping',
      'Hold it 8 of 10 attempts',
    ],
  },
  {
    key: 'nose-manual',
    name: 'Nose manual',
    kind: 'quest',
    category: 'flatground',
    requires: ['manual'],
    checkpoints: ['Hold for two board lengths', 'Come down under control, 8 of 10'],
  },

  // --- Grinds and slides -----------------------------------------------------
  {
    key: 'boardslide',
    name: 'Boardslide',
    kind: 'quest',
    category: 'grind',
    requires: ['rolling-ollie'],
    checkpoints: [
      'Slide the length of a low rail or ledge',
      'Land 8 of 10 rolling away',
      'Shoulders open through the slide',
    ],
  },
  {
    key: 'fifty-fifty',
    name: '50-50 grind',
    kind: 'quest',
    category: 'grind',
    requires: ['rolling-ollie'],
    checkpoints: [
      'Both trucks lock on',
      'Grind the length of a low ledge',
      'Land 8 of 10 rolling away',
    ],
  },
  {
    key: 'nosegrind',
    name: 'Nosegrind',
    kind: 'quest',
    category: 'grind',
    requires: ['fifty-fifty'],
    checkpoints: ['Front truck holds the ledge', 'Land 8 of 10 rolling away'],
  },

  // --- Transition ------------------------------------------------------------
  {
    key: 'dropin',
    name: 'Drop in',
    kind: 'quest',
    category: 'transition',
    requires: ['kickturn'],
    checkpoints: [
      'Drop in on a small ramp without hesitating',
      'Weight stays over the front foot',
      'Land 8 of 10 rolling away',
      'Drop in on something taller',
    ],
  },
  {
    key: 'rock-to-fakie',
    name: 'Rock to fakie',
    kind: 'quest',
    category: 'transition',
    requires: ['dropin', 'fakie'],
    checkpoints: ['Front trucks clear the coping', 'Come back in fakie, 8 of 10'],
  },
  {
    key: 'pump',
    name: 'Pumping transition',
    kind: 'quest',
    category: 'transition',
    requires: ['dropin'],
    checkpoints: ['Gain speed without pushing', 'Three pumps back to back'],
  },

  // --- Body prep: uncapped, and where the "ten minutes spare" menu comes from
  {
    key: 'switch-riding',
    name: 'Switch stance riding',
    kind: 'practice',
    category: 'conditioning',
    metric: { unit: 'seconds' },
  },
  {
    key: 'bailing',
    name: 'Falling and bailing',
    kind: 'practice',
    category: 'conditioning',
  },
  {
    key: 'ankles',
    name: 'Ankle and knee prep',
    kind: 'practice',
    category: 'conditioning',
    metric: { unit: 'reps' },
  },
  {
    key: 'balance',
    name: 'Balance board',
    kind: 'practice',
    category: 'conditioning',
    metric: { unit: 'seconds' },
  },
  {
    key: 'flatground-consistency',
    name: 'Flatground consistency',
    kind: 'practice',
    category: 'conditioning',
    metric: { unit: 'reps' },
  },
];

/**
 * The seed for a discipline, or nothing if it ships without one. A discipline
 * with no curriculum still works — you just start from an empty map, which is
 * exactly where pole was before ADR 0012.
 */
export const STARTING_PATHS: Readonly<Record<string, readonly SeedSkill[]>> = {
  pole: POLE_PATH,
  skateboard: SKATEBOARD_PATH,
};

export function startingPathFor(disciplineId: string): readonly SeedSkill[] {
  return STARTING_PATHS[disciplineId] ?? [];
}

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
