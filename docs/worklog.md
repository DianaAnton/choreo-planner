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
