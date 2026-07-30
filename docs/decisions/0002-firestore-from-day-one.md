# ADR 0002 — Firestore from day one

**Date:** 2026-07-30 · **Status:** accepted

## Context

The brief asks to decide early between local-only storage and Firestore sync.
The tool is used on a phone in the studio and a laptop when planning — the same
choreo, the same day. Local-only would mean hand-carrying JSON between devices.

## Decision

Project data (projects, sections, shapes, presets) lives in Firestore from v1,
with offline persistence enabled (`persistentLocalCache`, multi-tab). Audio
never goes to the cloud (see [0005](0005-audio-stays-local.md)).

## Consequences

- Cross-device sync works from the first usable build; no export/import UX.
- v1 carries auth, security rules, and rules tests that a local-only build
  would not need. Accepted as the cost of the real use case.
- Cost is negligible: a single user's whole choreo library is a handful of
  documents, comfortably inside the Spark free tier.
- All access still goes through `ProjectRepository`, so this is reversible and
  testable without a network.
