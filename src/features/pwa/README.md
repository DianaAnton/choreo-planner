# features/pwa

Pulled forward from Phase 7 to Phase 2.5 — see [docs/plan.md](../../../docs/plan.md).
The training screens are used standing in a basement studio with no signal, and
an uninstalled PWA there is a Safari tab that was evicted from memory on
Tuesday.

Two components, both deliberately unobtrusive:

- `UpdatePrompt` — `registerType: 'prompt'`, so a new build waits for a tap
  rather than reloading mid-log.
- `InstallPrompt` — defers Chromium's `beforeinstallprompt`; falls back to one
  line of instructions on iOS, which fires no such event.
