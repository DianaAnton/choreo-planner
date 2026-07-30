# ADR 0008 — A project is one Firestore document

**Date:** 2026-07-30 · **Status:** accepted

## Context

Sections and shapes could be subcollections (granular, collaboration-ready) or
arrays embedded in the project document (simple, atomic, cheap).

## Decision

One document per project, with `sections[]` and `shapes[]` embedded. Presets are
a separate collection under the user, because they are reusable across projects.
Every document carries `schemaVersion`.

Sizing: a 2:45 song at 143 BPM is ~49 eight-counts. Even at several shapes per
8-count, the serialized document is tens of kilobytes against a 1 MB limit.

## Consequences

- Opening a project is one read; dragging and reordering are atomic.
- Offline editing is trivial — one document to reconcile.
- The per-document write limit (~1/sec sustained) is the constraint. Saves are
  debounced at 750 ms, which a single editor never approaches. It *would* break
  under real-time multi-user editing.
- When collaboration arrives, `FirestoreProjectRepository` splits the arrays
  into subcollections behind a `schemaVersion` migration. Feature code is
  unaffected, which is the whole reason the repository interface exists.
