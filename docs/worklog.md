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

---

## 2026-08-23 — `auth/unauthorized-domain` on a preview channel

Branch: `docs/preview-channel-auth-limit`.

Google sign-in failed on a deployed URL. Two wrong guesses before the right
answer, both worth recording because the second was a bad method, not just a
bad hypothesis.

1. **Guessed the `authDomain` was mismatched** — the app is served from
   `choreo-planner.web.app` while `VITE_FIREBASE_AUTH_DOMAIN` is
   `choreo-planner.firebaseapp.com`, which does break sign-in on Safari in some
   setups. Plausible, and wrong: `auth/unauthorized-domain` is thrown against
   the *page's* hostname before any cross-origin handler is involved.
2. **Read the authorized-domain list and reported it as empty.** The request had
   actually failed 403 (identitytoolkit needs a quota project with local ADC)
   and the parser swallowed the error into a default. Reporting a parsed
   `(none)` from a response that was never checked for an error field is how a
   diagnosis goes confidently backwards.

With `x-goog-user-project` set, the real config: Google enabled with a client
id, domains `localhost`, `choreo-planner.firebaseapp.com`,
`choreo-planner.web.app`. Production was configured correctly the whole time —
the failing URL was a **PR preview channel**, whose hostname is unique per PR
and is not on the list.

This cannot be fixed: authorized domains take no wildcards and channels expire
in 7 days, so authorizing them by hand is tedious and pointless. Anonymous auth
still works on a preview, so they remain useful for layout and for the PWA
install prompt — a preview is HTTPS, which a LAN dev server is not.

`firebase-setup.md` said the automatic domains were "all that's needed", which
is true for production and actively misleading for previews. Corrected there
and added to `deployment.md`'s gotcha list.

---

## 2026-08-24 — A starting curriculum, and a map instead of a list

Branch: `feat/starting-curriculum-and-skill-map`. Decision in
[ADR 0012](decisions/0012-ship-a-starting-curriculum.md), which supersedes ADR
0011 §3.

### What the first real use turned up

Two complaints, one sentence apart: *"a lot of useless text and empty space at
the same time"* and *"I hate the list view on the phone, I need something I can
zoom out and get an overview of"*. Both are about the same failure — the screen
was mostly explanation of a thing that had no content in it.

### The curriculum

ADR 0011 §3 said the app ships no curriculum, and that was wrong in the way
that matters: it put the entire cost of starting on the moment the screen is
blank. The seed is now 29 skills — three named goals (Ayesha, Shoulder mount,
Handspring) with the spins, climbs and conditioning underneath — and every
quest carries two or three starter checkpoints leaning on the one objective
test the app already has, "hold it for the bar it would occupy".

Where a shape has a left and a right, both sides are their own checkpoint. One
strong side is the most common way a skill looks finished and is not.

**Nothing was taken from anyone.** PoleMovebook's `robots.txt` disallows
`/movepage.html`, `/collection.html` and `/combo.html`, so those were never
fetched — and nothing from them was needed. Move names are the shared
vocabulary of the discipline; descriptions, ratings and curation are not, and
none are reproduced. No reference links are invented.

### The map

`domain/skillGraph.ts` lays the `requires` chain out in bands: prerequisites
above, what they unlock below. Depth is the **longest** path from a root, not
the shortest — the shortest would float a node above a prerequisite it has, and
there is a test for exactly that. Cycles cannot be made through the UI but a
hand-edited document could, so a back edge contributes nothing rather than
hanging the tab.

Verified by printing the computed bands rather than by trusting the renderer:

```text
band 0: Basic climb | Fireman spin
band 1: Basic invert | Bracket hold | Back hook spin | Chair spin
band 2: Gemini | Shoulder mount prep | Superman | Attitude spin
band 3: Butterfly | Jade split | Scorpio | Shoulder mount
band 4: Extended butterfly | Handspring prep | Brass monkey
band 5: Ayesha | Handspring
band 6: Iron X
bands=7 width=4 edges=18
```

`SkillMap.tsx` renders it as SVG with a `viewBox` for pan and pinch-zoom
(Pointer Events, so one code path covers mouse and touch, and
`setPointerCapture` keeps a drag alive when the finger leaves the element —
which on a phone it constantly does). Fill shows ladder position, so progress
is readable when zoomed too far out to read the words. `Fit` is a first-class
control, not a corner affordance: "zoom out and see the whole thing" is the
case the screen exists for.

### The text

Six explanatory paragraphs came out of the skill screen alone, plus the long
empty states. They were written to be helpful and read as padding, pushing the
actual content below the fold — which is how a screen manages to feel wordy and
empty at once. The one that stayed is the ladder rung's description, because
that is the definition of where you are, not an explanation of the mechanism.

### Also

The seed is 29 documents. One at a time is a visible wait on a phone and a
half-written graph leaves `requires` pointing at nothing, so
`TrainingRepository` gained `newSkillId()` (Firestore mints ids client-side,
offline, with no round trip) and a batched `createSkills()`.

### Second round, same session: four things the first version got wrong

Feedback on the map and list, all of it fair.

**The two-tap node was horrible.** Tap to select and trace the road, tap again
to open. A mode you can get stuck in, on a surface where a tap is also how you
pan. One tap opens now; there is no selected state at all.

**Colouring by root lineage measured wrong.** The theory was that a chain
should be one colour end to end. Printing the computed layout showed why it
fails here: every invert, shoulder mount and handspring traces back to "Basic
climb", so the whole web came out in **two** colours and the complaint it was
meant to fix stood. Edges are coloured by the node they *leave* now — which is
the question actually being asked, *which of these came from Gemini* — giving
six distinct colours over eighteen edges. The `lineage` field and its tests
were deleted rather than left as dead code.

Crossings also got barycentre sweeps instead of one downward pass: a node's
position depends on what hangs off it as well as what feeds it.

**Quests and Practice were two sections of near-identical rows**, which made
the screen twice as long while saying nothing the rows did not. One list now,
grouped by category, with kind as a marker. Active quests sit above all of it.

**Checkpoints went from 2–3 to 4–5 per quest** — 86 across 20 quests.

### Pictures

One per skill, a JPEG data URL on `users/{uid}/skillImages/{skillId}`,
downscaled on the device to a 400 px longest edge and capped at 150 KB.

Deliberately **not** on the skill document: the skills query runs on every
training screen, and thirty embedded images would be megabytes on mobile data
before anything rendered. The image document is read only when a skill is
opened. Deleting a skill deletes its picture in the same batch.

Firebase Storage is the right answer at real scale and is not needed at this
one — a bucket in Terraform, a rules file, upload plumbing and the first
per-GB cost in the project, for images that exist to be recognised at a glance.
Moving there later is a different collection, not a different schema.

### The method that caught the colour bug

Printing the computed layout, rather than trusting the renderer or waiting to
look at it. The band listing showed `lineages=2` immediately; no amount of
staring at the source would have. Worth repeating for anything where the code
is a picture and there is no browser to look at it in.

### Verified

lint · typecheck · 141 unit tests (113 → 141) · 26 rules tests (24 → 26) ·
build. Layout and colour distribution checked by printing them. Still no
browser here: panning, pinch-zoom and whether the nodes are legible need a
thumb.

---

## 2026-08-25 — A second discipline

Branch: `feat/multi-discipline`, stacked on `feat/starting-curriculum-and-skill-map`.
Decision in [ADR 0013](decisions/0013-two-disciplines.md).

### The ask

Hold a pole path *and* a skateboard path, so a friend can beta-test it on
ollies. [ADR 0009](decisions/0009-extensibility-seams.md) reserved
`DisciplineProfile` for this and had never been exercised — so this was the
test of whether that seam was real.

### It mostly was

No migration, no rules change, no index change. Every skill already carried
`discipline`, the query already filtered on it, the composite index was already
deployed, and the WIP cap, ladder ordinal, staleness, sessions, inbox, graph
layout and images were all discipline-neutral. Switching disciplines empties
the skill list, so the seed prompt appears by itself — not designed, it fell
out of filtering.

### Two places it wasn't, and one layering mistake

**`minHoldMs` assumed every discipline measures in seconds.** ADR 0011 §6's
principle — an objective test the trainer does not have to invent — survives.
The assumption under it does not: an ollie is not a hold. `minHoldMs: number`
became a `CleanRepTest` union, hold or consistency. `meetsConsistency` compares
ratios rather than raw counts, so 4 of 5 clears an 8-of-10 bar; demanding ten
attempts to prove a trick you just landed four times running is bookkeeping,
not a standard.

**The ladder's terminal rung was pole vocabulary.** `inChoreo` is, for a skater,
"in a line". Same idea, different sport — so only the *label* changed. The
six-state ordinal held a second discipline unmodified, which is the best
evidence yet that it was modelled at the right altitude.

**`DisciplineProfile` was in `app/registry.ts`, which features may not import.**
Fine while only the composition root read a profile; useless the moment screens
need per-discipline wording. The type moved to `domain/discipline.ts`; the
registry and registrations stayed put, per ADR 0009.

### Built

- `POLE` and `SKATEBOARD` profiles; the choreo planner is gated on
  `hasChoreo`, so a skateboarder never sees a tab for pole routines.
- A skateboard curriculum: 26 skills, 21 quests, 60 checkpoints, written
  against a ratio rather than a duration. The ollie is the hinge — almost
  nothing flatground or on obstacles exists without it — so the graph is narrow
  at the top and fans out hard once it lands:

```text
band 0: Pushing and riding
band 1: Manual | Kickturn | Ollie | Rolling fakie | Shuvit | Tic-tac
band 2: Nose manual | Drop in | Rolling ollie | Pop shuvit
band 3: 50-50 | Pumping | Kickflip | Rock to fakie | Boardslide | Heelflip | …
band 4: Nosegrind | Varial kickflip
```

- Active discipline on the `users/{uid}` document, not local storage: on iOS an
  installed app and Safari have separate storage, and which sport you are is a
  fact about the person.
- Seed tests now run every structural rule against *every* registered
  discipline through `describe.each`, so a third cannot ship malformed.

### Known and deliberately not fixed

The app is called Choreo Planner, in a repo called `choreo-planner`, and now
holds skateboarding. That is wrong. Renaming touches the manifest, docs, the
repo and the hosting site, and the name is the owner's to pick — its own change,
not a rider on this one.

### Verified

lint · typecheck · 164 unit tests (141 → 164) · rules · build. Both maps
checked by printing their bands. Still no browser here.

---

## 2026-08-25 — Map usability, and a reset button

Branch: `feat/map-usability-and-reset`. Four things from using it.

### Mouse click did nothing on the map; tap worked

A real bug, and an instructive one. `usePanZoom` called `setPointerCapture` on
**pointerdown**, which retargets the subsequent `click` to the capturing element
— so the node's own `onClick` never ran. Touch survived because the browser
synthesises its click differently.

Nothing is captured now until the pointer has travelled 5px. Below that it is a
click and reaches the node untouched; above it, a drag starts and captures. The
same threshold is what makes node dragging possible at all.

### "Still has the duplicate quest/practice screens"

The second time this was raised, so the first reading was wrong. It was the
**Today** screen: *Working on* (quests) and *Ten minutes spare* (practice) —
the app's internal taxonomy leaking onto the surface. Standing there with ten
minutes free, you do not want to know which of three boxes your options are
filed in.

Today is one list now, ordered by priority — active quests, then rusty, then
whatever is stalest — with the reason as a tag on each row. The Skills list also
lost its own *Working on* section, which duplicated Today's.

### Overlapping connections — and two wrong "fixes" before the right one

First attempt: swap the barycentre heuristic's mean for a median and raise the
sweeps from 4 to 8. Both sounded right. Measured, on the skate map:

```text
mean   sweeps=2/4/8/16 → 8 crossings   (identical; it converges by 2)
median sweeps=2/4/8/16 → 10 crossings
```

So the "improvement" was a **regression**, and the sweep count did nothing at
all. The existing code was already at its local optimum. Reverted.

What actually helped was the pass barycentre is normally paired with:
**transpose** — walk each band swapping adjacent pairs whenever the swap removes
more crossings than it creates. Barycentre has no notion of a crossing, only of
average position; this is the pass that counts them.

```text
before: pole 1, skate 8  (total 9)
after:  pole 0, skate 7  (total 7)
```

Locked in with a test asserting those as upper bounds, so a future layout change
that quietly makes the picture worse fails.

Edge endpoints are also fanned across a node's edge rather than all leaving its
centre — four edges from one parent drawn from the same point are one thick line
until they separate, which is most of what "overlapping" looks like up close.

And nodes can now be dragged sideways to re-slot them, persisted as
`Skill.mapOrder`. Horizontal only: which band a node sits in comes from
`requires`, and a node dragged above its own prerequisite would make the picture
lie.

### A reset button

Re-seeding while the curriculum is being tuned meant deleting thirty skills one
confirmation at a time, which is not a workflow anyone follows — they stop
re-seeding and test against stale data instead. `removeSkills` deletes a
discipline's skills and their pictures in batched commits. Sessions are left
alone: the log records what you did, and deleting the skills does not mean those
days did not happen.

### The mistake worth writing down

Midway through, `git checkout src/domain/skillGraph.ts` was used to undo a
temporary measurement hack — on a file that still held unstaged real work. It
took the `mapOrder` support with it, and only the failing tests caught it.
Stage before experimenting on a file, or copy it aside; `git checkout` on a
dirty file is not an undo.

### "Does this work on both pole and skate?"

A fair question to be asked rather than assured, so it got answered with tests.
Two things turned up.

**Category order was alphabetical on the key**, which read sensibly for pole
only by luck — `climb, invert, spin` happens to be a reasonable order and
`basics, flatground, grind, transition` happens to be too. It now uses the order
the profile already declares, which is deliberate in both:

```text
Pole:       Inverts and holds(14) > Spins(4) > Climbs(2) > Conditioning(5) > Flexibility(4)
Skateboard: Getting rolling(4) > Flatground(11) > Grinds and slides(3) > Transition(3) > Body prep(5)
```

**The Today ordering lived inside the component**, so nothing tested it against
anything. It moved to `domain/training.ts` as `todayList` — it is an ordering
rule, and the repo's own rule is that those live in the domain.

`bothDisciplines.test.ts` now runs the same eight behaviours against both
shipped curricula through `describe.each`: the Today list leads with what you
chose, never repeats a skill, surfaces the conditioning menu, flags what was
earned and left, applies the same three-quest cap, and ships no quest without a
checkpoint that would leave it unactivatable.

### Bullets on the skills list

Three lists rendered browser bullets and an indent: the skills list, the refs
list and the inbox, all of which use `<ul className="stack">`. Five other lists
looked right only because each had remembered `list-style: none` for itself —
which is exactly why this kept slipping through.

Fixed once in the base styles rather than a sixth time per class. No list in
this app is prose; every one is a layout container.

(The cleanup pass that removed the five now-redundant declarations also matched
the base rule it had just written, leaving `ul, ol {}`. Caught because the
replacement count was five against four known lists — the arithmetic not
adding up was the only signal.)

### Verified

lint · typecheck · 190 unit tests (168 → 190) · 26 rules tests · build.
`ul,ol{list-style:none;margin:0;padding:0}` confirmed present in the built CSS,
not just the source.
Crossing counts measured rather than assumed, in both directions. Both
disciplines' grouping and Today list printed and read, not inferred.
