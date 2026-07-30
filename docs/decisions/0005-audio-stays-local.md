# ADR 0005 — Audio stays on the device, cached for reuse

**Date:** 2026-07-30 · **Status:** accepted

## Context

Songs are copyrighted and cannot be redistributed, so the brief specifies
user-supplied audio loaded fresh each session. Re-picking the file every time
the app opens is genuinely annoying in a studio.

## Decision

Audio is **never uploaded** — not to Firebase Storage, not anywhere. It is
cached device-locally by `HybridAudioStore`:

1. **File System Access API** (Chromium desktop): persist a
   `FileSystemFileHandle` in IndexedDB; reopening costs one permission click and
   duplicates no bytes.
2. **IndexedDB blob** (Safari, Firefox, iOS): copy the file in. Works
   everywhere; needs a visible "forget this song" control to reclaim space.

Firestore stores only `audioMeta: { name, sizeBytes, durationMs, contentHash }`.

## Consequences

- Honours the redistribution constraint absolutely: no server ever holds audio.
- Offline use works — the whole point of the PWA.
- Two code paths behind one interface; the fallback path is the one to test on
  a real iPhone, since it is the studio device.
- `contentHash` (SHA-256 over size + first 1 MB) lets the app warn "this looks
  like a different file" when re-picking on a second device, instead of silently
  mis-aligning the entire grid.
