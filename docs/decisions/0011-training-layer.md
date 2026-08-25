# ADR 0011 — The training layer, built on the preset library

**Date:** 2026-08-23 · **Status:** accepted
**§2's stored, user-set `kind` is superseded by [ADR 0014](0014-kind-is-derived.md).**
**§3's "the app ships no curriculum" is superseded by [ADR 0012](0012-ship-a-starting-curriculum.md).** Everything else stands.

## Context

The planner answers "how do I lay out this song". It does not answer the
question that actually caused pole to be abandoned more than once: **in open
training, with no syllabus, what am I working on and is it moving?**

Two concrete failures, both outside the planner's scope:

1. Progress is recorded as a binary. A move is either mastered or it is not,
   and an Ayesha spends months in between. That interval is where motivation
   is lost, and nothing currently represents it.
2. Ideas do not survive the week. A reel seen on Tuesday is gone by Saturday,
   and a shinier one on Thursday displaces whatever was half-finished.

External move databases (PoleMovebook and similar) solve reference and
taxonomy well and should not be reimplemented — link out, do not scrape. They
do not solve either failure above, because both are about *your* state, not
about the moves.

The relevant existing asset: `ShapePreset` already lives under `users/{uid}`
rather than under a project, precisely so presets follow the dancer across
choreos, and already carries `name`, `category`, `notes`, `discipline` and
`lastUsedAt`. That is most of a skill node.

## Decision

**1. Promote `ShapePreset` to `Skill`.** Same collection, same ownership,
superset of fields. The preset picker in Phase 6 reads this collection; the
training screens read it too. One entity, two surfaces.

**2. Two kinds of skill, because two kinds of training exist.**

| | `quest` | `practice` |
| --- | --- | --- |
| Shape | finite, has a terminal state | ongoing, no terminal state |
| Progress | six-state ladder | recency + optional numeric metric |
| Limit | at most 3 active at once | uncapped |
| Examples | Ayesha, Shoulder Mount, Inverted D | pendulum, static spins, handstand, elbow stand, grip conditioning |

The WIP cap governs quests only. Applying it to everything was the error;
maintenance work has no endpoint and must not compete for the same three
slots. Practice skills sorted by staleness are the "ten minutes spare" menu —
the in-between work that open training is actually made of.

`kind` is mutable. A handstand may start as practice and become a quest.

**3. The ladder.** `wantIt · drilling · uglyRep · cleanRep · filmed ·
inChoreo`, ordinal, stored as an index. Checkpoints are user-authored, ordered
and free-text — the app ships no curriculum. A quest cannot be made active
without at least one unchecked checkpoint; that constraint is the whole point
of the mechanism.

**4. `skill` replaces `preset` as a `ShapeSource`.** Not a third member: §1
dissolves the preset entity, so a `preset` source would point at a collection
that no longer exists. `ShapeEntrySource` stays a two-member union — the skill
picker and the free-text field, the two authoring routes the brief wants side
by side — registered in `shapeSources` per ADR 0009, so no component grows a
conditional. (The `poseLibrary` placeholder is a comment in architecture.md,
not a reserved member in `domain/types.ts`; this is what fills it.)

```ts
export type ShapeEntrySource =
  | { kind: 'skill'; skillId: Id; nameSnapshot: string }
  | { kind: 'freeText'; text: string };
```

`nameSnapshot` for the same reason presets carried one: deleting a skill must
never corrupt a planned choreo. No stored document can hold a `preset` source —
Phase 6 has not shipped and every existing `shapes[]` is empty — so this is a
type change with a version bump behind it, not a data migration.

**5. Section readiness is derived, never stored.** A section's shapes
reference skills; the lowest ladder state among them is the section's
readiness. Storing it would let it drift from the truth.

**6. `DisciplineProfile.minHoldMs` is the objective test for `cleanRep`** on
any skill referenced by a shape. At 143 BPM one 8-count is ~3.36 s, above the
3000 ms floor, so "can you hold it for the bar it occupies" is a real pass/fail
the dancer does not have to invent. The planner and the tracker share one
definition of done.

**7. `TrainingRepository` is a fifth port**, alongside `ProjectRepository`,
`PresetRepository`, `AudioStore` and `AuthGateway`. Same rule as the rest:
`src/features/**` never imports Firebase.

```text
users/{uid}/skills/{skillId}        Skill        (was: presets/)
users/{uid}/sessions/{sessionId}    Session      subcollection, grows forever
users/{uid}/inbox/{itemId}          InboxItem    capture, promoted or discarded
```

Sessions are a subcollection rather than an embedded array. ADR 0008's
single-document argument depends on the data being bounded — a choreo tops out
around 49 8-counts. Training history has no bound, so the same reasoning
produces the opposite answer.

```ts
export type SkillKind = 'quest' | 'practice';

export const LADDER = [
  'wantIt', 'drilling', 'uglyRep', 'cleanRep', 'filmed', 'inChoreo',
] as const;
export type LadderState = (typeof LADDER)[number];

export interface Checkpoint { id: Id; text: string; doneAt: number | null }

export interface SkillRef {
  /** External reference. Link out; never copy a third party's content. */
  url: string;
  /** Why this link is here — the thing to actually watch for. */
  note?: string;
}

export interface Skill {
  id: Id;
  name: string;
  kind: SkillKind;
  /** Free-form, seeded from DisciplineProfile.defaultCategories. */
  category?: string;
  discipline: string;
  notes?: string;
  refs: SkillRef[];

  /** quest only. */
  ladder?: LadderState;
  checkpoints: Checkpoint[];
  isActive: boolean;

  /** practice only. Progression for things a ladder cannot express. */
  metric?: { unit: 'seconds' | 'reps'; best: number; bestAt: number };

  /** Optional prerequisite chain, e.g. the road to a named goal. */
  requires: Id[];

  createdAt: number;
  lastUsedAt?: number;
}

export interface Session {
  id: Id;
  /** Local calendar date, YYYY-MM-DD — not a timestamp. Sessions are days. */
  date: string;
  durationMin: number;
  felt: 1 | 2 | 3;
  skillIds: Id[];
  /** Per-skill numbers logged this session, for practice metrics. */
  marks?: Record<Id, number>;
  note?: string;
}

export interface InboxItem {
  id: Id;
  url: string;
  note?: string;
  createdAt: number;
  resolvedAt?: number;
}
```

## Consequences

- **The preset collection must be renamed before Phase 6 ships, not after.**
  It is empty today, so this is a rename and a `schemaVersion` bump (1 → 2)
  with no backfill. Once presets carry real data it becomes a genuine
  migration. The bump earns its keep even with nothing to convert: it stops a
  phone running last week's cached service worker from opening a choreo whose
  shapes reference skills it has never heard of.
- Phase 6's `PresetRepository` is subsumed. The add-shape panel's preset route
  becomes a skill picker; the free-text route is unchanged, and "promote this
  note to a preset" becomes "promote this note to a skill", which is a
  strictly better feature — the choreo starts feeding the training path.
- The training layer depends on nothing from Phases 3–7. It can ship first.
  See Phase 2.5 in [../plan.md](../plan.md).
- The WIP cap, staleness threshold and ladder ordering are domain rules and
  live in `src/domain/training.ts`, pure and unit-tested, not as checks in a
  component.
- Sessions accumulate. Nothing prunes them; a year of twice-weekly training is
  ~100 small documents, which is fine. Revisit if a summary view starts
  reading the whole history.
- Refs are URLs plus a personal note, never copied content or images. Third
  party move databases are hobby projects with licence terms; deep-link them.