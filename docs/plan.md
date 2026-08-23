# Implementation plan

Goal for v1: **enough tool to choreograph one song end to end** — load *Code
Mistake*, grid it at 143 BPM, mark its sections, fill in shapes, loop a section
to practise. Everything beyond that is deferred, but the seams described in
[architecture.md](architecture.md) exist from the first commit.

Phases are ordered so that each one ends with something usable. Phase 0 is done;
the rest is the road map.

---

## Phase 0 — Scaffold ✅ (done)

Repo structure, docs, ADRs, tooling config, Terraform skeleton, CI workflows.
No product code beyond a placeholder shell.

**Exit criteria:** `pnpm install && pnpm dev` serves a placeholder page;
`pnpm lint && pnpm typecheck && pnpm test` pass.

---

## Phase 1 — Infrastructure and the deploy path

Get an empty app deploying automatically before there is anything to deploy —
the pipeline is much cheaper to debug now than at feature-complete.

1. Manual Firebase console steps (see [firebase-setup.md](firebase-setup.md)).
2. Terraform: APIs, Firestore database, prod + staging Hosting sites, Workload
   Identity Federation pool, CI service account and IAM bindings.
3. GitHub: repo secrets/variables, `production` environment with the Terraform
   apply gate.
4. Workflows green: CI on PR, preview channel deploy on PR, prod deploy on main.

**Exit criteria:** merging to `main` publishes the placeholder to the live
Hosting URL with no human action; a PR gets a preview URL comment.

**Risk:** Workload Identity Federation is the fiddliest part of the whole
project. If it resists for more than an hour, fall back to a service-account
JSON key in a GitHub secret and open a follow-up issue — noted in
[decisions/0007-terraform-and-ci-identity.md](decisions/0007-terraform-and-ci-identity.md).

---

## Phase 2 — Auth, app shell, project list ✅ (done)

1. `lib/firebase.ts` — app init, Firestore with `persistentLocalCache`, Auth.
2. Silent anonymous sign-in on load; auth state in an `AuthProvider`.
3. "Sign in with Google to sync" → `linkWithPopup`. Handle three cases:
   already linked; `credential-already-in-use` (the Google account has its own
   data — offer to switch accounts, do not silently discard the anonymous
   project); popup blocked → redirect fallback.
4. `FirestoreProjectRepository` + `InMemoryProjectRepository`.
5. Firestore security rules, owner-only, with rules unit tests against the
   emulator.
6. Screens: project list, create project (title, artist, BPM), delete.

**Exit criteria:** create a project on the laptop, sign in with Google on the
phone, see the same project.

**What actually landed:** all six items, plus an `AuthGateway` port — the eslint
layering rule forbids features from importing Firebase, and that applies to Auth
as much as Firestore. Rules tests now also cover the owner-scoped *query* the
project list issues, not just per-document reads; a query whose constraints
don't match the rules fails wholesale, and nothing else would have caught it.

Three Firebase auth pitfalls ate most of the debugging time and are written up
in [architecture.md](architecture.md#auth): async session restore, `linkWithPopup`
not firing `onAuthStateChanged`, and StrictMode double-invocation creating
duplicate anonymous accounts.

---

## Phase 2.5 — Training layer

Sequenced here rather than after Phase 7 for one reason: it depends only on
what Phase 2 already shipped — auth, Firestore, the repository ports, the
rules. Audio, waveform, beat grid and sections are irrelevant to it. Deferring
it means the tool that addresses the actual reason training stopped arrives
last, after the most expensive engineering in the project.

It is also the only phase whose value does not require a finished choreo.
Rationale in [decisions/0011-training-layer.md](decisions/0011-training-layer.md).

1. **`src/domain/training.ts`** — `Skill`, `Session`, `InboxItem`, the ladder
   ordinal, and the rules that must not live in components: the WIP cap
   (at most 3 active quests), the staleness threshold (a skill at `cleanRep`
   or above, untouched for 42 days, is flagged), metric bests, and week
   boundaries for the session count. Pure, no framework imports, unit-tested
   to the standard of `domain/time.ts`.

2. **`TrainingRepository`** — port plus `FirestoreTrainingRepository` and
   `InMemoryTrainingRepository`. Rename `users/{uid}/presets` to
   `users/{uid}/skills`, bump `SCHEMA_VERSION`. Extend the rules to the two
   new subcollections, owner-only, with rules tests covering the queries the
   screens actually issue — per ADR 0009's lesson that a query whose
   constraints don't match the rules fails wholesale.

3. **Screens.** Phone-first; this is used standing next to a pole.
   - *Today* — active quests with next checkpoint and ladder meter; a
     staleness-sorted practice menu underneath; a session count against a
     weekly target.
   - *Skill detail* — ladder, checkpoints, refs, history, kind toggle,
     activate/deactivate.
   - *Log* — skill chips, duration, felt, optional per-skill number, one line
     of note. Target is under ten seconds start to finish; if it isn't, the
     screen is wrong.
   - *Inbox* — paste a URL and what to watch for; promote to a skill or
     discard. Promotion is blocked when three quests are already active, and
     says so.

4. **Seed** the road to a named goal as a `requires` chain so the path has
   shape from the first session. Names and deep links only.

5. **Pull the PWA forward from Phase 7.** Manifest, icons, install prompt,
   offline smoke test. The training screens are the first thing that has to
   work on a phone in a basement studio, and shipping them without install is
   shipping them unusable.

**Exit criteria:** log a real open-training session on the phone, offline, and
watch a ladder state change. Then do it again the following week and see the
first one still there.

**Risk:** the tracker becomes a substitute for training. Mitigation is scope —
no analytics, no streaks, no charts, nothing social in this phase. If the Log
screen takes longer than the warmup, it will not be used, and an unused
tracker is worse than none because it also lies about the last time you
trained.

---

## Phase 3 — Audio and waveform

1. File picker: File System Access API where available, `<input type=file>`
   fallback. Drag-and-drop on desktop.
2. `HybridAudioStore` — handle-in-IndexedDB or blob-in-IndexedDB, plus "forget
   this song".
3. Decode to `AudioBuffer`; compute min/max peaks per bucket in a Web Worker;
   cache the peak array keyed by content hash.
4. `TimelineCanvas` with the layer registry; `waveform` and `playhead` layers.
5. Playback: play/pause/seek/scrub, `AudioContext`-clock playhead,
   `requestAnimationFrame` redraw. Space to toggle, click to seek.
6. Content-hash mismatch warning when the re-picked file isn't the same song.

**Exit criteria:** open a project on the phone with no network, hit play, watch
the playhead move across a waveform.

**Risks:** iOS Safari needs a user gesture to unlock the `AudioContext` — do it
on the first play tap. Decoding a 2:45 MP3 on an older phone takes a second or
two; show progress and never block the main thread with peak computation.

---

## Phase 4 — Beat grid

1. BPM input, defaulting to 143.
2. Tap-tempo control: taps set `firstBeatOffsetMs`; averaging the last 8 taps
   also *suggests* a BPM, which the user accepts or ignores (this is manual
   tapping, not detection — it stays within the brief's constraint).
3. Nudge controls: ±1 ms / ±10 ms offset, for lining the grid up by eye.
4. `beatGrid` timeline layer: light lines on beats, strong lines on bar
   boundaries, 8-count numbers along the top.
5. Snapping helpers in `domain/time.ts`, with a snap-resolution toggle.
6. Header readout: "49 eight-counts · 3.36 s each" as the sanity check the
   brief asks for.

**Exit criteria:** gridlines visibly land on the beat for the whole 2:45 with no
drift.

**Risk:** a constant-BPM grid drifts on any human-played track. Not a problem
for a 143 BPM produced song, and out of scope for v1 — the nudge controls are
the escape hatch. Variable tempo maps are a `BeatGrid` extension later.

---

## Phase 5 — Sections

1. Drag on the timeline to create a section; drag edges to resize; snap to bars
   by default, hold a modifier to snap freely.
2. Label + kind + colour, from an open palette of tokens.
3. Sections list view beside the timeline — the primary editing surface on
   phone, where dragging on a small canvas is unpleasant.
4. `sections` timeline layer: coloured bands with labels.
5. Overlap and gap rules: sections may not overlap; gaps are allowed.

**Exit criteria:** the whole song is labelled intro/verse/chorus/… and the map
reads correctly at a glance on a phone screen.

---

## Phase 6 — Shapes and skills

Presets became skills in Phase 2.5 (ADR 0011), so this phase reads and writes
`users/{uid}/skills` rather than a parallel preset library.

1. Skill CRUD under the user — already shipped in Phase 2.5; what remains here
   is the choreo-side surface.
2. Add-shape panel with both routes side by side, as the brief requires: a
   **skill picker** (searchable, most recently used first, reading
   `users/{uid}/skills`) and a free-text field.
3. Shape defaults to one 8-count starting at the next bar boundary; duration
   adjustable in bar/half-bar/beat steps, with the 3-second minimum surfaced as
   a warning, not a hard block.
4. `shapes` timeline layer: blocks inside their section band, labelled.
5. Shape list per section with inline edit, reorder, delete.
6. **"Promote this free-text note to a skill"** — the natural way the training
   path grows out of choreographing, rather than the two sitting side by side
   unconnected.
7. Register the `skill` `ShapeSource` (ADR 0011 §4). A shape referencing a
   skill shows that skill's ladder state inline, and a section displays derived
   readiness — the lowest state among the skills its shapes reference. This is
   the join that makes the choreo a training goal rather than a separate
   document.

**Exit criteria:** the *Code Mistake* choreo is fully planned in the tool, *and*
every shape in it is either a skill you hold cleanly for its bar or a named gap
on the training path with a checkpoint against it.

---

## Phase 7 — Practice mode and polish

1. Loop a single section: A/B loop from section bounds, count-in option.
2. Playback rate control (0.75× / 0.5×) for learning — pitch-preserving is not
   needed; `playbackRate` on the source node is fine.
3. Responsive pass: phone layout (list-first, timeline compact) vs laptop
   (timeline-first). Touch targets ≥44 px, no hover-only affordances.
4. ~~PWA: manifest, icons, install prompt, offline smoke test.~~ Pulled
   forward to Phase 2.5 — the training screens are unusable without install.
5. Keyboard shortcuts on desktop: space, ←/→ nudge, `s` section, `n` shape.
6. Playwright e2e over the core loop; Lighthouse PWA + a11y check in CI.

**Exit criteria:** installed on the phone, used in a studio with no signal, for
a real rehearsal.

---

## Deferred — explicitly not in v1

Recorded so nobody rediscovers them as "missing": share links and collaborators,
PDF/print export, video reference per shape, transitions and level tracking,
multiple disciplines, variable-tempo maps, tag/category filtering of presets,
undo/redo history beyond a single-step undo, choreo templates.

The seams for the first five already exist; the rest are additive.

## Sequencing note

Phases 3–6 are the product. Phases 1–2 are overhead that pays for itself the
first time a deploy breaks. If you want to feel progress sooner, Phase 3 can be
built against `InMemoryProjectRepository` before Phase 2's Firestore work
lands — the repository interface exists precisely so that ordering is a choice.

Phase 2.5 sits outside that spine. It shares Phase 2's foundations and needs
nothing from Phases 3–7, so it ships independently of them — and it is the only
phase whose output is useful before a single choreo exists.
