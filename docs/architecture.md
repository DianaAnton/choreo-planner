# Architecture

The build target for v1 is deliberately narrow — enough to choreograph one song
— but every narrow piece sits behind a seam so the tool can widen without a
rewrite. This document describes those seams and the data model.

## Layering

```text
          ┌─────────────────────────────────────────────┐
          │  app/     shell, providers, routing, auth    │
          └──────────────────┬──────────────────────────┘
                             │
          ┌──────────────────▼──────────────────────────┐
          │  features/   audio · waveform · beatgrid ·   │
          │              sections · shapes · training ·  │
          │              playback · pwa                  │
          └────────┬────────────────────────┬───────────┘
                   │                        │
       ┌───────────▼──────────┐   ┌─────────▼─────────────┐
       │ domain/  pure TS      │   │ repositories/          │
       │ types + time math     │   │ interfaces + adapters  │
       │ NO framework imports  │   │ Firestore · IndexedDB  │
       └───────────────────────┘   └─────────┬─────────────┘
                                             │
                                   ┌─────────▼─────────────┐
                                   │ lib/firebase, browser │
                                   │ storage APIs           │
                                   └───────────────────────┘
```

The rule that carries the most weight: **features depend on repository
interfaces, never on Firebase**. Swapping Firestore for something else, or
running the whole app against an in-memory repository in tests, touches one
file.

## Domain model

All times are integer **milliseconds** from the start of the audio file. Beats,
bars, and 8-counts are derived, never stored.

```ts
type BeatGrid = {
  bpm: number;              // 143 for the first project
  firstBeatOffsetMs: number;// set by tap-tempo
  beatsPerBar: number;      // 8 — an "8-count"
};
```

Derived, in `domain/time.ts`:

- `beatDurationMs(grid)` → `60000 / bpm`
- `barDurationMs(grid)` → `beatDurationMs * beatsPerBar` (≈3357 ms at 143 BPM)
- `msToBeat(grid, ms)` / `beatToMs(grid, beat)` — fractional beats
- `snap(grid, ms, resolution)` / `snapForward(...)`, resolution ∈ `beat | halfBar | bar | free`
- `barIndexAt(grid, ms)` → which 8-count you are in (2:45 ≈ 49 of them)

This module is where off-by-one errors live, so it is the most heavily
unit-tested part of the codebase.

`domain/skillGraph.ts` is there for the same reason. A skill's `requires` chain
makes the library a DAG, and `layoutSkillGraph` assigns each node a band (the
*longest* path from a root, so nothing floats above a prerequisite) and a slot
within it. Depth assignment in a graph is where infinite loops live — a
component that also handles pinch-zoom is a bad place to debug one — so the
renderer receives coordinates and draws them.

### Entities

| Entity | Notes |
| --- | --- |
| `Project` | One choreo. Owns `BeatGrid`, audio metadata, sections, shapes. |
| `Section` | `{ id, label, kind, colorToken, startMs, endMs }`. `kind` is an open string (`verse`, `chorus`, `bridge`, …) so new labels need no code change. |
| `ShapeEntry` | `{ id, sectionId, startMs, durationMs, source, ... }`. Default `durationMs` = one bar. |
| `Skill` | Personal, reusable. Lives under the user, not the project, so it follows you across choreos. Was `ShapePreset`; promoted in [ADR 0011](decisions/0011-training-layer.md) with a ladder, checkpoints and a kind. |
| `Session` | One day of training: duration, how it felt, which skills it touched. A subcollection, because training history has no upper bound. |
| `InboxItem` | A captured URL plus what to watch for, promoted to a `Skill` or discarded. |

`ShapeEntry.source` is a discriminated union — this is the **ShapeSource** seam:

```ts
type ShapeEntrySource =
  | { kind: 'skill'; skillId: string; nameSnapshot: string }
  | { kind: 'freeText'; text: string };
  // later: { kind: 'videoRef'; ... } | { kind: 'photo'; ... }
```

`nameSnapshot` means renaming or deleting a skill never corrupts an existing
choreo.

Because a shape names a skill, a section's **readiness** is the lowest ladder
state among the skills its shapes reference. That is derived on read, never
stored — a stored copy would drift from the truth the moment a skill moved.

## Persistence

Firestore from day one, single project document with embedded arrays:

```text
users/{uid}                        { displayName?, createdAt, schemaVersion }
users/{uid}/skills/{skillId}       Skill — reusable across projects (was: presets/)
users/{uid}/sessions/{sessionId}   Session — training history, grows forever
users/{uid}/inbox/{itemId}         InboxItem — captured, then promoted or discarded
projects/{projectId}               Project + sections[] + shapes[]
```

**Why one document instead of subcollections:** a full 2:45 choreo is ~49
8-counts, so sections + shapes serialize to well under 50 KB — far below the
1 MB document limit. One document means one read to open a project, atomic
reorders and drags, and trivial offline behaviour. The cost is the 1 write/sec
per-document soft limit, which debounced saves (750 ms) sit comfortably under
for a single editor.

When real-time collaboration arrives, sections and shapes split into
subcollections. That is a migration, gated on `schemaVersion`, entirely inside
`FirestoreProjectRepository` — no feature code changes.

**Training data goes the other way, and for the same reason.** The
single-document argument rests on the data being bounded; a choreo tops out
around 49 8-counts. Training history has no bound, so sessions are a
subcollection. Same reasoning, opposite answer.

Every document carries `ownerId`, an empty `members: {}` map, and
`schemaVersion` from v1, so sharing and collaboration can be added without a
backfill.

### Repository interfaces

```ts
interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  subscribeList(cb: (p: ProjectSummary[]) => void, onError: (e: Error) => void): Unsubscribe;
  get(id: string): Promise<Project | null>;
  subscribe(id: string, cb: (p: Project | null) => void): Unsubscribe;
  create(input: NewProject): Promise<Project>;
  update(id: string, patch: ProjectPatch): Promise<void>;
  remove(id: string): Promise<void>;
}

interface TrainingRepository {   // skills, sessions and inbox under the user
  subscribeSkills(cb: (s: Skill[]) => void, onError: (e: Error) => void): Unsubscribe;
  createSkill(input: NewSkill): Promise<Skill>;
  updateSkill(id: string, patch: SkillPatch): Promise<void>;
  removeSkill(id: string): Promise<void>;
  subscribeSessions(sinceDate: string, cb: ..., onError: ...): Unsubscribe;
  logSession(input: NewSession): Promise<Session>;   // also touches the skills it names
  subscribeInbox(cb: ..., onError: ...): Unsubscribe;
  addInboxItem(input: NewInboxItem): Promise<InboxItem>;
  resolveInboxItem(id: string): Promise<void>;
  removeInboxItem(id: string): Promise<void>;
}

interface AudioStore {           // device-local only, never cloud
  put(projectId: string, file: File): Promise<AudioMeta>;
  get(projectId: string): Promise<File | null>;
  forget(projectId: string): Promise<void>;
  supportsHandles(): boolean;
}
```

**Identity is a port too.** The eslint layering rule forbids `src/features/**`
from importing Firebase at all, which applies to Firebase Auth exactly as it
does to Firestore. So auth sits behind `AuthGateway`, and the auth *feature*
renders a plain `AuthUser` it could get from anywhere:

```ts
interface AuthGateway {
  subscribe(cb: (user: AuthUser | null) => void): Unsubscribe;
  ensureSignedIn(): Promise<AuthUser>;
  linkGoogle(): Promise<LinkGoogleResult>;
  switchToGoogleAccount(): Promise<AuthUser>;
  signOut(): Promise<void>;
}
```

Implementations: `FirestoreProjectRepository`, `FirestoreTrainingRepository`,
`FirebaseAuthGateway`, plus `InMemoryProjectRepository` /
`InMemoryTrainingRepository` / `InMemoryAuthGateway` for tests. Still to come:
`HybridAudioStore`.

Concrete classes are named in exactly one place — `src/app/App.tsx`, the
composition root — and injected downward as props.

### Audio storage

The audio blob is device-local, always. `HybridAudioStore` tries, in order:

1. **File System Access API** — persist a `FileSystemFileHandle` in IndexedDB
   (Chromium desktop). Reopening re-grants access with one click, no re-picking,
   no duplicated bytes on disk.
2. **IndexedDB blob** — copy the file into IndexedDB (Safari, Firefox, iOS).
   Works everywhere, costs disk space, needs a "forget this song" control.

The project document stores only `audioMeta: { name, sizeBytes, durationMs,
contentHash }`. `contentHash` (SHA-256 of the first 1 MB + size) lets the app
tell you "this isn't the same file" when you re-pick on another device.

## Auth

Anonymous sign-in happens silently on first load, so the app is usable in the
studio with zero friction. A visible "Sign in to sync" action calls
`linkWithPopup`, which upgrades the anonymous account **in place** — the uid
does not change, so no data migration is needed.

Three Firebase behaviours cost real debugging time in Phase 2. They are subtle,
they all present as "my data disappeared", and none of them throws:

1. **`auth.currentUser` is null until the session is restored.** Firebase
   rehydrates persisted sessions asynchronously. Reading `currentUser`
   synchronously and signing in anonymously on a null result creates a *new*
   account on every page load, silently orphaning the previous one and
   everything written under it. `ensureSignedIn` awaits `auth.authStateReady()`
   first.
2. **`onAuthStateChanged` does not fire when a provider is linked.** Linking
   keeps the same uid, so the auth *state* never changes and the UI keeps
   showing "anonymous" until the next reload. The gateway subscribes with
   **`onIdTokenChanged`** instead, which does fire — linking mints a new token.
3. **Concurrent sign-in calls each create an account.** React StrictMode
   double-invokes effects in development, so two overlapping `ensureSignedIn()`
   calls produced two anonymous accounts milliseconds apart. The gateway
   memoises the in-flight promise (and drops it on failure, so a network blip
   cannot wedge the app signed-out).

All three are covered by `src/repositories/FirebaseAuthGateway.test.ts`.

The `credential-already-in-use` collision — that Google account already owns
data — is never resolved automatically. The user is asked, because either choice
abandons something.

## Rendering the timeline

One `<canvas>` stack, driven by a registry rather than a monolithic draw
function:

```ts
interface TimelineLayer {
  id: string;
  zIndex: number;
  draw(ctx: CanvasRenderingContext2D, view: TimelineViewport, state: TimelineState): void;
  hitTest?(pt: Point, view: TimelineViewport, state: TimelineState): HitTarget | null;
}
```

v1 layers: `waveform`, `beatGrid`, `sections`, `shapes`, `playhead`, `selection`.
Future layers (transitions, levels, floorwork, video sync marks) register into
the same list. `TimelineViewport` holds `{ startMs, endMs, pxPerMs, height }`,
so zoom and pan are a viewport concern that no layer needs to know about.

Waveform peaks are computed once per file into a downsampled peak array (min/max
per pixel bucket) in a Web Worker, cached in IndexedDB alongside the audio.
Redraws read peaks, never the raw `AudioBuffer`.

Playback uses `AudioBufferSourceNode` + `AudioContext.currentTime` for the
position — not `<audio>.currentTime`, which is too coarse for a beat grid — with
`requestAnimationFrame` driving the playhead.

## Extensibility seams, summarised

| Seam | v1 implementations | Added later without touching callers |
| --- | --- | --- |
| `ShapeSource` | skill, free text | video ref, photo |
| `TimelineLayer` | waveform, grid, sections, shapes, playhead | transitions, levels, notes |
| `DisciplineProfile` | pole, skateboard | hoop, silks, floor, anything with a progression |
| `Exporter` | *(none)* | PDF, print sheet, video overlay |
| `ProjectRepository` | Firestore | subcollection split, share links, offline queue |

## PWA & offline

`vite-plugin-pwa` (Workbox) precaches the app shell. Firestore offline
persistence (`persistentLocalCache` with multi-tab support) makes project data
readable and editable offline, with writes flushed on reconnect. Combined with
the local audio store, a project opened once is fully usable in a studio
basement with no signal — which is the actual use case.
