# ADR 0013 — Two disciplines, and what that cost

**Date:** 2026-08-25 · **Status:** accepted
**Amends:** [ADR 0011](0011-training-layer.md) §6 (`minHoldMs` → `cleanRepTest`)

## Context

The training layer was built for pole. A second person wanted to use it for
skateboarding — figuring out ollies, and what those unlock.

[ADR 0009](0009-extensibility-seams.md) reserved `DisciplineProfile` for exactly
this and was never exercised. This is the test of whether that seam was real or
decorative, and the interesting part of the answer is the two places it wasn't.

## What was already free

More than expected, and none of it needed a migration:

- Every `Skill` carries `discipline`; the Firestore query filters on it and the
  composite index was already deployed.
- Rules are path-scoped to `users/{uid}`, so no rules change at all.
- The WIP cap, the ladder *ordinal*, staleness, week boundaries, sessions, the
  inbox, the graph layout and images are all discipline-neutral.
- The skill list groups by `category`, which was always a free string.
- Switching discipline empties the skill list, so the seed prompt appears by
  itself. That was not designed; it fell out of filtering by discipline.

## What the seam got wrong

**1. `minHoldMs` assumed every discipline measures in seconds.** ADR 0011 §6
made "can you hold it for the bar it occupies" the objective test for
`cleanRep`, so the trainer never has to invent one. That principle survives.
The assumption underneath it does not: **an ollie is not a hold.** You land it
or you don't, and the question is how often.

So `minHoldMs: number` becomes a discriminated union:

```ts
export type CleanRepTest =
  | { kind: 'hold'; minMs: number }
  | { kind: 'consistency'; land: number; outOf: number };
```

`meetsConsistency` compares *ratios*, not raw counts — 4 of 5 clears an 8-of-10
bar. Demanding ten attempts to prove a trick you just landed four times running
is bookkeeping, not a standard.

**2. The ladder's terminal rung was pole vocabulary.** `inChoreo` — "used in a
choreo, in time, without thinking about it" — is, for a skater, *"in a line"*:
landed between other tricks without setting up for it. The same idea in a
different sport, which is why **only the label changed and not the ordinal**.
Disciplines override any rung's wording through `ladderLabels`; the six-state
progression itself needed no change to hold a second sport, which is the
strongest evidence the ladder was modelled at the right altitude.

**3. `DisciplineProfile` lived in `app/registry.ts`**, which features are
forbidden to import. Fine while nothing outside the composition root read a
profile; useless the moment screens need per-discipline wording. The *type*
moves to `domain/discipline.ts`; the registry and the registrations stay in
`app/registry.ts`, per ADR 0009's "active capabilities readable in one file".

## Decision

**Two profiles: `POLE` and `SKATEBOARD`.** Each carries its `cleanRepTest`,
its category labels, its ladder overrides, and whether the choreography planner
applies.

**The choreo planner is pole-only.** `hasChoreo: false` removes its routes and
its tab entirely. A skateboarder should not be offered a tab for laying out pole
routines against a song; a half-relevant feature reads as half-finished rather
than as not-for-them.

**The active discipline lives on the `users/{uid}` document,** not in local
storage. On iOS an installed app and Safari have separate storage, and "which
sport am I" is a fact about the person, not the device. It is one field, so it
goes on `TrainingRepository` rather than earning a port of its own — revisit if
a second setting appears.

**Sessions stay shared across disciplines.** A training day is a training day,
and the weekly count is about showing up, not about which sport. The Log screen
offers the active discipline's skills, which is the common case; a session that
genuinely spans both is logged twice or from whichever side you were on.

**Skills are not shared.** A `requires` chain across sports is meaningless, and
the map would be two disconnected graphs in one picture.

## Consequences

- The app is still called Choreo Planner and still has a repo named
  `choreo-planner`, while holding skateboarding. That is now wrong and is
  deliberately **not** fixed here: renaming touches the manifest, the docs, the
  repo and the hosting site, and the name is the owner's to pick.
- A discipline with no seeded curriculum works fine — you start from an empty
  map, which is where pole was before ADR 0012.
- Adding a third discipline is now a profile, a seed and nothing else. That
  claim is worth exactly as much as the second one proved it, which is: two
  things had to change, both in the profile's shape rather than in the domain's.
- The seed tests run every structural rule against *every* registered
  discipline via `describe.each`, so a third cannot ship malformed.
