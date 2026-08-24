# docs

Everything about this project that isn't code.

| Document | What it's for |
| --- | --- |
| [brief.md](brief.md) | The original product brief, unmodified. The source of truth for scope. |
| [AGENTS.md](AGENTS.md) | Operating contract for AI agents working in this repo. Read first. |
| [plan.md](plan.md) | The seven-phase build plan, with exit criteria and risks. |
| [architecture.md](architecture.md) | Layering, domain model, data model, extensibility seams. |
| [firebase-setup.md](firebase-setup.md) | Manual Firebase/GCP steps. Do these before anything works. |
| [deployment.md](deployment.md) | CI/CD workflows, auth model, rollback. |
| [worklog.md](worklog.md) | Chronological log of agent sessions, actions, judgement calls. |
| [decisions/](decisions/) | ADRs — one per decision, with its context and consequences. |

## Decision records

| # | Decision |
| --- | --- |
| [0001](decisions/0001-frontend-stack.md) | React + Vite + TypeScript |
| [0002](decisions/0002-firestore-from-day-one.md) | Firestore from day one |
| [0003](decisions/0003-auth-anonymous-plus-google.md) | Anonymous auth, Google link for sync |
| [0004](decisions/0004-private-only-v1.md) | Private-only v1, forward-compatible schema |
| [0005](decisions/0005-audio-stays-local.md) | Audio stays on the device |
| [0006](decisions/0006-hosting-environments.md) | One project; previews via Hosting channels |
| [0007](decisions/0007-terraform-and-ci-identity.md) | Terraform + Workload Identity Federation |
| [0008](decisions/0008-single-document-project.md) | A project is one Firestore document |
| [0009](decisions/0009-extensibility-seams.md) | Registries, not conditionals |
| [0010](decisions/0010-terraform-apply-in-ci.md) | Terraform applies in CI on merge to main |
| [0011](decisions/0011-training-layer.md) | The training layer, built on the preset library |
| [0012](decisions/0012-ship-a-starting-curriculum.md) | Ship a starting curriculum, and a map instead of a list |

## Adding to this

- A choice a future reader would question → new ADR, next number, never edit an
  accepted one (supersede it instead).
- Anything you did in a session → append to the worklog.
