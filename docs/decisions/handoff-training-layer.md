# Handoff — Phase 2.5, the training layer

**Date:** 2026-08-23 · Branch: `feat/phase-2.5-training-layer`

What landed, what deliberately did not, and what the next session should pick
up. The decision itself is [ADR 0011](0011-training-layer.md); the phase is
Phase 2.5 in [../plan.md](../plan.md).

## What landed

| Plan item | State |
| --- | --- |
| 1. `src/domain/training.ts` | Done. 48 unit tests. |
| 2. `TrainingRepository` + both implementations, rules, rules tests | Done. 10 new rules tests, 24 total. |
| 3. Four screens (Today, Skill detail, Log, Inbox) | Done, plus a fifth: the skill library. |
| 4. Seed the road to a named goal | Done, with two deviations — see below. |
| 5. PWA pulled forward | Done: icons, install prompt, update prompt, precache. |

The collection rename (`users/{uid}/presets` → `users/{uid}/skills`) and the
`SCHEMA_VERSION` bump 1 → 2 are in. `ShapeEntrySource.preset` is now
`ShapeEntrySource.skill`; `ShapePreset` is gone from `domain/types.ts` and
`PresetRepository` is gone from `repositories/types.ts`. `src/features/presets/`
was removed — it was a README and nothing else.

## Two deviations from the plan text, both deliberate

**1. The seed ships no reference links.** Plan item 4 says "names and deep
links only". It ships names and the `requires` chain, and no links. Inventing
plausible URLs for a third-party move database would put dead links in front of
someone standing at a pole with one hand free. The Inbox is how real ones get
in — that is what it is for. If you want seeded links, paste real ones into
`src/domain/trainingSeed.ts` after opening each.

**2. The seed ships no checkpoints,** because ADR 0011 §3 says the app ships no
curriculum. The consequence is worth stating plainly: a seeded quest cannot be
activated until you write a checkpoint against it. That is the mechanism
working, not a bug, and the Skill detail screen says so.

## One correction to ADR 0011

§4 said `skill` becomes "the third `ShapeSource`" and that it replaces a
`poseLibrary` placeholder "reserved in `domain/types.ts`". Neither held: §1
dissolves the preset entity, so a `preset` source would point at a collection
that no longer exists, and the `poseLibrary` placeholder was a comment in
architecture.md, never a member. The ADR now says `skill` **replaces** `preset`
and the union stays at two members. Corrected in place rather than superseded —
the ADR was still `proposed` when this was written, and is now `accepted`.

## Not done, and why

- **Prerequisites are not editable in the UI.** The `requires` chain is written
  by the seed and read by `unmetPrerequisites`; there is no screen for editing
  it. A skill picker for prerequisites is the obvious next increment, and it was
  not worth guessing at before the chain has been lived with.
- **`removeSkill` does not sweep dangling prerequisites in Firestore.** The
  in-memory repository does; the Firestore one tolerates them instead, because
  `unmetPrerequisites` skips ids it cannot resolve and a fan-out write on delete
  is a second failure mode for a case that resolves itself. If prerequisite
  editing lands, revisit.
- **A metric cannot be un-tracked.** Clearing one needs `deleteField()`, which
  the `SkillPatch` type does not currently express. Adding a unit is reversible
  by deleting the skill, which is enough for now.
- **No component tests.** There is no jsdom or Testing Library in this repo and
  adding them was out of scope for the phase. The domain and both repositories
  are covered; the screens are not.
- **Bundle is 916 kB raw / 277 kB gzipped**, up from 877/266. Still almost all
  Firebase SDK. Same note as Phase 2: fine for a precached PWA, worth
  code-splitting if it grows.

## The exit criteria are not met yet, and cannot be by an agent

Phase 2.5 exits on: *log a real open-training session on the phone, offline, and
watch a ladder state change. Then do it again the following week and see the
first one still there.* That is a fortnight of real training. What has been
verified is everything up to it — see the worklog entry for the same date.

## Where things are

```text
src/domain/training.ts          rules: ladder, WIP cap, staleness, weeks, metrics
src/domain/trainingSeed.ts      the road to an Ayesha, prerequisites-first
src/repositories/
  types.ts                      TrainingRepository port
  FirestoreTrainingRepository.ts
  InMemoryTrainingRepository.ts
src/features/training/          five screens + provider + hook
src/features/pwa/               install and update prompts
scripts/generate-icons.mjs      the three manifest icons, regenerable
```

Routes: `/training`, `/training/log`, `/training/inbox`, `/training/skills`,
`/training/skills/:skillId`. `/` is still the choreo list; the two are linked
from a tab strip in each header.
