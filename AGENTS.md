# AGENTS.md

The full agent operating guide for this repo lives in **[docs/AGENTS.md](docs/AGENTS.md)**.
Read it before making changes.

Hard rules, repeated here so they are never missed:

1. Audio files never leave the device — no uploads, ever. Metadata only.
2. No automatic beat detection or audio analysis. Tap-tempo is deliberate.
3. `src/domain/` is pure TypeScript — no React, no Firebase, no DOM.
4. UI never imports Firebase directly; go through `src/repositories/`.
5. Log every session in [docs/worklog.md](docs/worklog.md) and every decision in
   [docs/decisions/](docs/decisions/).
