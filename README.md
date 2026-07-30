# choreo-planner

Small tool to help with choreo planning for dancers.

Load a local audio file, see its waveform, lay an 8-count beat grid over it,
mark the sections, and fill each one with shapes and holds.

Built around the constraint that every shape is held for at least three seconds
— at 143 BPM one 8-count is ~3.36 s, which makes the 8-count the natural unit.

Responsive by design: used on a phone in the studio and a laptop when planning.
Installable as a PWA and usable offline once a song is loaded.

## Status

**Phase 0 — scaffold.** Structure, docs and infrastructure exist; the product
does not yet. See [docs/plan.md](docs/plan.md) for what lands next.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in from the Firebase console
pnpm dev
```

Before anything touches Firebase, work through
[docs/firebase-setup.md](docs/firebase-setup.md).

```bash
pnpm test        # unit tests (beat maths)
pnpm test:rules  # Firestore rules against the emulator — needs JDK 21+
pnpm lint
pnpm typecheck
pnpm emulators   # local Firebase emulator suite
```

Playwright and e2e tests arrive in Phase 7; they are deliberately not installed
yet.

## Documentation

Start at [docs/](docs/README.md). If you are an AI agent, start at
[AGENTS.md](AGENTS.md).

Two rules that are never negotiable: **audio files never leave the device**, and
**there is no automatic beat detection** — tap-tempo and manual section marking
are part of the ear-training goal.

## Licence

GPL-3.0-or-later. See [LICENSE](LICENSE).
