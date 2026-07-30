# ADR 0007 — Terraform owns infrastructure; GitHub authenticates via WIF

**Date:** 2026-07-30 · **Status:** accepted

## Context

Infrastructure should be reproducible, but some Firebase resources are painful
or impossible to create with Terraform on a personal Google account — project
creation needs a billing account and org permissions, and enabling the Google
sign-in provider requires an OAuth client that the Firebase console creates for
you as a side effect.

## Decision

- **Manual, once, in the console:** create the GCP/Firebase project, link
  billing if needed, enable the Google sign-in provider, register the web app.
  Documented step by step in [../firebase-setup.md](../firebase-setup.md).
- **Terraform owns everything else:** API enablement, the Firestore database,
  Hosting sites, the CI service accounts, IAM bindings, and the Workload
  Identity Federation pool.
- **Firestore rules and indexes are deployed by the Firebase CLI**, not
  Terraform, so `firestore.rules` has exactly one owner and one review path.
- **State** lives in a GCS bucket with versioning, created by one documented
  `gcloud` command before the first `terraform init`.
- **CI authenticates by Workload Identity Federation** — GitHub Actions
  exchanges its OIDC token for short-lived Google credentials. No service
  account JSON key is ever created or stored.

## Consequences

- No long-lived secret to leak or rotate; the WIF provider is pinned to this
  repository so another repo cannot impersonate it.
- WIF setup is the fiddliest part of the project. **Fallback:** if it is not
  working within about an hour, create a service-account key, store it as the
  `FIREBASE_SERVICE_ACCOUNT` secret, and open a follow-up issue to migrate. Ship
  beats purity here, as long as the debt is written down.
- PRs get a `terraform plan` comment from a read-only service account
  (`roles/viewer`, `-lock=false`). **`terraform apply` is not run by CI** — apply
  needs IAM-admin roles, which would make the pipeline more privileged than
  anything it deploys. Infrastructure changes are applied from a laptop after
  the plan comment is reviewed.
- Two CI service accounts, so a compromised deploy job cannot read state:
  `github-deployer` (Hosting + rules + indexes) and `github-terraform-plan`
  (viewer + state-bucket read).
