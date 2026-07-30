# AGENTS.md — operating guide for AI agents on this repo

This file is the contract for any AI agent (Claude Code, Codex, Copilot, …)
working in `choreo-planner`. Read it before touching code.

## What this project is

A responsive PWA for planning pole choreography against a song: load a local
audio file, see its waveform, lay an 8-count beat grid over it, mark sections,
and fill each section with shapes/holds. See [brief.md](brief.md) for the
original product brief and [plan.md](plan.md) for the phased build plan.

The first concrete target is a choreo to *Code Mistake* (CORPSE x Bring Me the
Horizon), 143 BPM, 2:45. **That song is a test case, not a spec** — nothing in
the code may hardcode it.

## Non-negotiables

1. **Audio files never leave the device.** Songs are copyrighted and
   user-supplied. Never upload audio to Firebase Storage, Firestore, an
   analytics endpoint, or any third party. Only *metadata* (filename, duration,
   size, content hash) may be persisted to the cloud. See
   [decisions/0005-audio-stays-local.md](decisions/0005-audio-stays-local.md).
2. **No automatic beat/audio analysis.** Tap-tempo and manual section marking
   are deliberate — they are part of the ear-training goal. Do not "helpfully"
   add onset detection, BPM detection, or auto-sectioning.
3. **No music notation.** Out of scope, permanently.
4. **`src/domain/` stays pure.** No React, no Firebase, no DOM imports there.
   It is plain TypeScript so it stays testable and reusable.
5. **The UI never imports Firebase directly.** All persistence goes through the
   interfaces in `src/repositories/`. If you find yourself importing
   `firebase/firestore` inside `src/features/`, you are doing it wrong.
6. **Time is milliseconds.** All internal timing values are `number` ms from the
   start of the audio. Beats, bars, and 8-counts are *derived* from a
   `BeatGrid`, never stored as the source of truth.
7. **Log your work.** Every session appends to [worklog.md](worklog.md). Every
   architectural choice gets an ADR in [decisions/](decisions/).

## Repo layout

```
docs/            This guide, the brief, the plan, ADRs, the worklog
src/
  domain/        Pure TS: types + time math. No framework imports.
  repositories/  Persistence interfaces + Firestore/IndexedDB implementations.
  features/      One folder per feature; each exposes a public API via index.ts.
  app/           App shell, providers, routing, auth gate.
  ui/            Design tokens and dumb presentational primitives.
  lib/           Cross-cutting helpers (firebase client init, logging).
terraform/       All GCP/Firebase infrastructure as code.
.github/         CI and deploy pipelines.
```

Cross-feature imports go through `features/<name>/index.ts` only. A feature may
depend on `domain/`, `ui/`, `lib/`, and repository *interfaces* — never on
another feature's internals.

## Extensibility rules

The tool must grow past "one dancer, one pole choreo" without a rewrite. When
adding anything, prefer registering into an existing seam over branching:

- **`ShapeSource`** — how a shape entry is authored (preset picker, free text;
  later: pose library, video reference). Register, don't `if`.
- **`TimelineLayer`** — anything drawn over the waveform (beat grid, sections,
  shapes, playhead; later: transitions, levels, floorwork). Register, don't
  extend the canvas component.
- **`DisciplineProfile`** — pole today; aerial hoop/silks/floor later. Owns the
  preset taxonomy and any discipline-specific shape metadata.
- **`Exporter`** — nothing in v1; the seam exists so PDF/print/video export
  land as plugins.

Every persisted document carries `schemaVersion`. Changing a stored shape means
bumping it and adding a migration in `src/repositories/migrations/`.

## Conventions

- TypeScript strict. No `any` without a comment justifying it.
- `pnpm` is the package manager. Do not create `package-lock.json`.
- Tests: Vitest for unit/domain, Playwright for e2e. Domain time math must be
  unit-tested — off-by-one beat errors are the single most likely bug class here.
- Commits: conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `infra:`).
- Never commit `.firebaserc`, `terraform.tfvars`, service-account keys, or any
  `.env*` file other than `.env.example`.

## Before you finish a task

- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass.
- [ ] Appended a dated entry to [worklog.md](worklog.md).
- [ ] Added an ADR if you made a decision a future reader would question.
- [ ] Did not upload audio. Did not add beat detection.
