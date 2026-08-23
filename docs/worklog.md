# Worklog

Chronological log of what agents did and why. Newest entries at the bottom.
Append one section per working session — decisions worth defending get their own
ADR in [decisions/](decisions/) and are only linked from here.

---

## 2026-07-30 — Phase 0: scaffold, docs, infrastructure skeleton

**Session goal:** turn a brief and an empty repo into a planned, structured
project with a deploy path.

### Decisions taken (with the user, in conversation)

| Question | Answer |
| --- | --- |
| Data storage | Firestore from day one → [ADR 0002](decisions/0002-firestore-from-day-one.md) |
| Frontend stack | React + Vite + TypeScript → [ADR 0001](decisions/0001-frontend-stack.md) |
| Firebase project | Created by hand, Terraform owns the rest → [ADR 0007](decisions/0007-terraform-and-ci-identity.md) |
| CI/CD scope | Full: PR previews + production deploy → [deployment.md](deployment.md) |
| Auth | Anonymous + Google linking, both in v1 → [ADR 0003](decisions/0003-auth-anonymous-plus-google.md) |
| Sharing | None in v1, schema stays forward-compatible → [ADR 0004](decisions/0004-private-only-v1.md) |
| Audio persistence | File System Access API with IndexedDB fallback → [ADR 0005](decisions/0005-audio-stays-local.md) |
| Environments | One Firebase project, previews via Hosting channels → [ADR 0006](decisions/0006-hosting-environments.md) |

### Actions

- Moved `pole-choreo-planner-brief.md` → `docs/brief.md`, unmodified.
- Wrote `docs/AGENTS.md` (agent contract) and a short root `AGENTS.md` pointer.
- Wrote `docs/architecture.md`, `docs/plan.md` (7 phases),
  `docs/firebase-setup.md` (manual console steps), `docs/deployment.md`.
- Wrote ADRs 0001–0009.
- Scaffolded `src/` — `domain/` (types + beat maths + tests), `repositories/`
  (interfaces only), `app/registry.ts` (the four extensibility seams),
  `features/*` placeholders, minimal shell.
- Wrote `firebase.json`, `firestore.rules`, `firestore.indexes.json`.
- Wrote `terraform/` — APIs, Firestore, Hosting, WIF pool, two CI service
  accounts.
- Wrote `.github/workflows/` — `ci.yml`, `deploy.yml`, `terraform.yml`.
- Tooling config: `package.json`, tsconfigs (strict +
  `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), eslint (with
  import guards enforcing the layering rules), prettier, `.gitignore`.

### Judgement calls made without asking

- **Staging Hosting site defaults to off.** The chosen option was "one project,
  two Hosting sites", but multi-site hosting requires the Blaze plan while
  preview channels are free on every plan and already give per-PR URLs. Left it
  behind `enable_staging_site = false` rather than forcing a plan upgrade for
  something unused. → [ADR 0006](decisions/0006-hosting-environments.md)
- **`terraform apply` is not in CI**, only `plan`. Apply needs IAM-admin roles,
  which would make the pipeline more privileged than anything it deploys.
  → [ADR 0007](decisions/0007-terraform-and-ci-identity.md)
- **Firestore rules are deployed by the Firebase CLI, not Terraform**, so
  `firestore.rules` has one owner.
- **A project is a single Firestore document** with embedded `sections[]` and
  `shapes[]`, rather than subcollections. → [ADR 0008](decisions/0008-single-document-project.md)
- **eslint enforces the layering rules** (`no-restricted-imports`) rather than
  leaving them to documentation, since they are the rules most likely to erode.

### Verified, not assumed

Everything below was actually run at the end of the session:

| Check | Result |
| --- | --- |
| `pnpm lint` | clean |
| `pnpm typecheck` | clean (strict, covers `src/` and `tests/`) |
| `pnpm test` | 14 passed — includes the brief's "2:45 at 143 BPM ≈ 49 eight-counts" |
| `pnpm test:rules` | 10 passed against the Firestore emulator |
| `pnpm build` | 194 kB / 61 kB gzipped, service worker generated |
| `terraform fmt -check` / `validate` | clean; google provider resolved to 7.42.0 |

Things that were wrong and got fixed during verification:

- `packageManager` was pinned to `pnpm@15.3.1`, a version that does not exist —
  15.3.1 is the firebase-tools version on this machine, misattributed. Now
  `pnpm@10.15.0`, activated through corepack.
- CI pinned JDK 17 for the emulator; firebase-tools 15 requires **JDK 21+**.
  Bumped to 21. Locally, JDK 17 is the default and 24 must be put on `PATH`
  first — documented in [firebase-setup.md](firebase-setup.md).
- `bpmFromTaps` tripped `noUncheckedIndexedAccess`; rewritten without indexing.
- `@types/node` was missing, so `tsconfig.node.json` could not resolve.
- Removed `test:e2e` and `@playwright/test` — the config they need doesn't exist
  until Phase 7, and a script that always fails is worse than no script.
- `.terraform.lock.hcl` was gitignored; it should be committed so CI resolves
  the same provider versions.

Known cosmetic issue: denied writes log `evaluation error` from the Firestore
emulator against the `projects` update rule. It comes from the evaluation pass
where `resource` is not loaded, the write is denied either way, and adding a
`resource != null` guard did **not** suppress it. Left alone with a comment in
`firestore.rules` so nobody loosens the rule chasing it.

### Left for the user

Blaze plan and the billing budget, the Firebase console steps, the Terraform
state bucket, and the GitHub variables — all in
[firebase-setup.md](firebase-setup.md). Nothing in CI works until those are done.

### Open questions

- Custom domain, or is `<project>.web.app` fine?
- Firestore location: `eur3` assumed. Permanent once applied — confirm before
  the first `terraform apply`.

---

## 2026-07-30 — Terraform apply on merge

Branch: `infra/terraform-apply-on-merge`.

### Answers to the open questions above

- **No custom domain.** `<project>.web.app` it is; the Authorized-domains step
  in [firebase-setup.md](firebase-setup.md) now says so explicitly.
- **Firestore location stays `eur3`.** Worth recording that this is *not*
  Ireland — it is the Europe multi-region, `europe-west1` (Belgium) +
  `europe-west4` (Netherlands). GCP has no Ireland region; that is AWS
  `eu-west-1`. Noted in `prod.auto.tfvars` so nobody re-asks.

### Change

The owner asked for `terraform apply` on merge, with the PR plan comment as the
review gate. That reverses the "apply is manual" call in
[ADR 0007](decisions/0007-terraform-and-ci-identity.md), so it is recorded as
[ADR 0010](decisions/0010-terraform-apply-in-ci.md) and 0007 is marked partly
superseded rather than edited.

- `terraform.yml`: `plan` job now PR-only; new `apply` job on push to `main`,
  gated by an `infrastructure` environment. Concurrency group added with
  `cancel-in-progress: false` — cancelling an apply mid-run leaves a stale lock.
- New `github-terraform-apply` service account with enumerated admin roles
  (not `roles/owner`), bound to `attribute.ref/refs/heads/main` so a PR branch
  cannot assume it.
- **`terraform/prod.auto.tfvars` is now committed** and `terraform.tfvars.example`
  is gone. Previously CI passed `-var` flags while a laptop would have used a
  local `terraform.tfvars` — with apply automated, those two disagreeing would
  flip infrastructure back and forth on alternate runs. One committed file
  removes the whole failure mode.
- The apply job applies a **saved plan file** rather than re-resolving, so
  nothing can change between plan and apply inside a run.

### Process

From here on: one branch per change, PR, merge — no more direct commits to
`main`. Written into [AGENTS.md](AGENTS.md) so it binds future sessions too.

### Verified

`terraform fmt -check -recursive` and `terraform validate` pass. The workflows
themselves cannot be exercised until the Firebase project exists.

### Flagged, not blocking

The applier can grant itself any role — unavoidable for an identity that manages
IAM. Containment is the repo condition on the pool, the `refs/heads/main`
binding, and the `infrastructure` environment. Reasoning in ADR 0010.

---

## 2026-07-30 — Phase 2: auth, app shell, project list

Branch: `feat/phase-2-auth-and-projects`.

### Built

- `src/lib/firebase.ts` — single init point, Firestore with
  `persistentLocalCache` + multi-tab, emulator wiring behind `VITE_USE_EMULATORS`.
- `src/domain/project.ts` — `createProject` / `validateNewProject`, pure and
  unit-tested.
- `AuthGateway` port + `FirebaseAuthGateway` / `InMemoryAuthGateway`.
- `FirestoreProjectRepository` / `InMemoryProjectRepository`, plus a
  `migrateProject` seam that refuses documents newer than this build.
- Features `auth` and `projects`; app shell with routing and a placeholder
  project detail page.

### The AuthGateway port was not optional

The eslint rule blocking Firebase imports in `src/features/**` applies to
Firebase Auth too, so the auth feature could not call `signInAnonymously`
directly. Rather than weaken the rule, identity became a port like persistence.
Verified the guardrail actually fires by adding a `firebase/auth` import to a
feature file and watching lint fail — it does.

### Three Firebase auth bugs, all found by testing the real thing

None threw an error; all three presented as "my choreo disappeared".

1. **Anonymous account recreated on every load.** `auth.currentUser` is null
   until Firebase finishes restoring the persisted session, so the null check
   fired `signInAnonymously` and replaced the real account. Evidence: the
   emulator held a project owned by a uid nothing was looking at any more.
   Fixed with `await auth.authStateReady()`.
2. **Linking Google didn't update the UI until reload.** `onAuthStateChanged`
   does not fire on link — the uid is unchanged, so there is no state change.
   Switched the subscription to `onIdTokenChanged`, which linking does trigger.
3. **Two anonymous accounts created milliseconds apart.** React StrictMode
   double-invokes effects; both calls found no session and both signed in.
   Fixed by memoising the in-flight promise, and dropping it on failure so a
   network blip can't wedge the app signed-out.

Each has a regression test. Confirmed the tests genuinely catch the bugs by
reverting the `authStateReady` fix and watching three of them fail.

### Process mistake worth remembering

While debugging, I cleared the emulator's auth accounts *while the browser held
a live session*. The next reload failed to refresh a token for a now-deleted
user, which looked exactly like the bug being chased and sent the investigation
sideways for a round. Wipe emulator state before a test session, never during
one.

### Verified

lint · typecheck · 43 unit tests · 14 rules tests (4 new, covering the list
query) · build. Manually confirmed against emulators: create, reload-persists,
sign out (choreos hidden), sign back in (choreos restored), and Google link
updating the UI without a reload.

### Known, not addressed

The bundle is 877 kB raw / 266 kB gzipped, nearly all Firebase SDK. Fine for a
precached PWA that loads once, worth code-splitting if it grows.

---

## 2026-08-23 — Phase 2.5: the training layer

Branch: `feat/phase-2.5-training-layer`, off Phase 2 (which is not yet merged —
this depends on it).

Session goal: fold the training-layer decision into the planning docs, then
build it. Handoff notes in
[decisions/handoff-training-layer.md](decisions/handoff-training-layer.md).

### Docs first

- Folded `plan-ammendment.md` into [plan.md](plan.md) — Phase 2.5 inserted
  between 2 and 3, Phase 6 revised from "shapes and presets" to "shapes and
  skills", Phase 7's PWA item struck through and pointed at 2.5, sequencing note
  extended. The amendment file was then deleted: keeping a document that says
  "two edits to plan.md" after making them is how docs start lying.
- [ADR 0011](decisions/0011-training-layer.md) moved `proposed` → `accepted`,
  with one correction to §4 (below).
- [architecture.md](architecture.md) and the ADR index caught up: entities,
  the `ShapeSource` union, the Firestore layout, the repository interfaces.

### The one thing in the ADR that was wrong

§4 said `skill` becomes "the third `ShapeSource`", replacing a `poseLibrary`
placeholder "reserved in `domain/types.ts`". There was no such placeholder —
it is a comment in architecture.md — and "third" contradicts §1, which
dissolves the preset entity: a `preset` source would point at a collection that
no longer exists. The union stays at two members, `skill` and `freeText`, which
is also exactly the two authoring routes the brief asks for side by side.
Corrected in place because the ADR was still `proposed`.

### Built

- `src/domain/training.ts` — ladder ordinal, the WIP cap, staleness, week
  boundaries, metric bests, validation. Pure, 48 tests.
- `src/domain/trainingSeed.ts` — the road to an Ayesha as a `requires` chain,
  plus a topological order so each `requires` resolves to a real id on write.
- `TrainingRepository` port, `FirestoreTrainingRepository`,
  `InMemoryTrainingRepository`. `PresetRepository` deleted, subsumed.
- Rules extended to `skills/`, `sessions/`, `inbox/`; `presets/` removed and a
  test added proving it is now denied.
- Five screens under `src/features/training/`, and the PWA pulled forward from
  Phase 7 into `src/features/pwa/`.
- `SCHEMA_VERSION` 1 → 2, and the first actual entry in `migrations/`.

### Three judgement calls worth defending

1. **The cap blocks promotion, not just activation.** The plan says promotion
   from the Inbox is blocked at three active quests. Strictly, a promoted quest
   is created parked, so the cap would not bite — which is precisely the hole:
   the Inbox is where "a shinier one on Thursday" enters, and admitting it as an
   inactive quest moves the pile somewhere the cap cannot see. `canPromoteToKind`
   blocks quests at the cap and never blocks practice, since practice is
   uncapped by ADR 0011 §2.

2. **Staleness needed a rule the plan did not state.** "A skill at `cleanRep` or
   above, untouched for 42 days" says nothing about practice skills, which have
   no ladder at all. They are flagged on recency alone — that is what makes them
   a menu. Quests below `cleanRep` are never flagged: you cannot be rusty at
   something you never had.

3. **The Log screen only offers a number for skills with a unit configured.**
   `improvedMetric` returns null when a skill has no metric, because "40" is
   meaningless without knowing whether it is seconds or reps. An input that
   silently discards what you type is worse than no input, so the field only
   appears once a unit exists. Setting one is on the Skill detail screen.

### A trap built and then defused

`startOfWeek` first read `addDays(key, -(((dow - start) % 7) + 7) % 7)`. Unary
minus binds tighter than `%`, so the modulo landed on the negated value and the
week boundary was wrong for most days. Caught by writing the test against
independently-checked weekdays rather than against the implementation — the
calendar assumptions in `training.test.ts` were verified out-of-band before the
test was trusted.

Date keys are also arithmetic'd as UTC midnight rather than local time, with a
test at the 2026-03-29 DST boundary. A calendar date has no timezone, and
local-time day arithmetic is wrong twice a year.

### Verified

lint · typecheck · 113 unit tests (43 → 113) · 24 rules tests (14 → 24) ·
production build with the service worker and all three icons precached. Every
new module confirmed to transform under `vite dev`.

**Not verified:** no browser walkthrough. There is no Playwright or jsdom in
this repo, so the screens have not been driven — not by an agent, not at all.
The phase's exit criteria (log a real session on a phone, offline, then again
the following week) are a fortnight of actual training and are the user's to
run.

### Known, not addressed

Prerequisites are seeded but not editable in the UI; a metric can be started but
not cleared; `removeSkill` tolerates dangling prerequisites in Firestore rather
than sweeping them. All three are argued in the handoff note.

### Follow-up the same day: emulators reachable from a phone

Clicking through on a handset did not work, for a reason worth writing down.
`lib/firebase.ts` hardcoded the emulator host as `127.0.0.1`. Served over the
LAN, that resolves to the *phone*, so Auth and Firestore fail to connect with
nothing on screen to explain it — the app just sits there signing in forever.

Two changes: `VITE_EMULATOR_HOST` (default `127.0.0.1`) so the client can be
pointed at the laptop's LAN address, and `host: "0.0.0.0"` on the emulators in
`firebase.json` so they listen on more than loopback. Phase 2.5 is phone-first;
testing on a real handset is the normal case here, not an edge one.

```sh
firebase emulators:start --only auth,firestore --project <id>
VITE_USE_EMULATORS=true VITE_EMULATOR_HOST=<laptop LAN ip> pnpm dev --host
```

The emulators now accept connections from anything on the same wifi. They hold
no real data and no credentials, but it is a deliberate loosening — worth
knowing before running this on a network you do not trust.

Note: `pnpm test:rules` cannot run while an interactive emulator holds port
8080. Stop it first.

---

## 2026-08-23 — The first deploy of the training layer looked empty

Branch: `fix/pwa-stale-shell`.

### What happened

Phase 2.5 merged and deployed successfully, and the live site still showed no
training section. The deploy was fine — `curl` confirmed the served bundle
contained the routes and every screen's copy, and `sw.js` carried the new
revision. The stale thing was the *browser*.

The Phase 2 build registered a service worker that precached `index.html`, and
`navigateFallback` serves navigations from that precache. `registerType:
'prompt'` then means a new build installs and **waits** for something to call
`updateServiceWorker()` — and the Phase 2 build shipped no UI to call it,
because `UpdatePrompt` only arrived with Phase 2.5. A waiting worker activates
only once every client in scope closes, which on a phone can be never.

So every returning visitor kept being handed the old shell, with no way out
short of clearing site data by hand.

### Why this was foreseeable

The PWA was pulled forward onto a site that had already been deployed once. The
transition — old worker, no update UI, new build waiting behind it — is a
property of that ordering, and it was not thought about when the pull-forward
was planned. Anyone adding a service worker to an already-live site inherits
the same trap.

### Fixed

- `UpdatePrompt` now re-checks for a new build hourly via
  `registration.update()` in `onRegisteredSW`. A browser otherwise only looks
  on navigation, which for an installed PWA can be days. A prompt nobody is
  around to see is the same as no prompt.
- `cleanupOutdatedCaches: true` in the Workbox config, so old precache
  revisions are not carried around on a phone with a small quota.

`registerType` stays `prompt`. Reloading out from under someone mid-log is
still the worse failure; the problem was never the prompt, it was that nothing
ever showed one.

### Not fixable in code

Anyone already holding the stale worker has to clear it by hand — unregister in
DevTools, close every tab, or delete and re-add the installed app. New code
cannot reach a browser that will not fetch it.
