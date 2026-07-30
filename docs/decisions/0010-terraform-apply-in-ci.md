# ADR 0010 — Terraform applies in CI on merge to main

**Date:** 2026-07-30 · **Status:** accepted ·
**Supersedes:** the "apply is manual" part of [0007](0007-terraform-and-ci-identity.md)

## Context

[ADR 0007](0007-terraform-and-ci-identity.md) kept `terraform apply` off CI
because applying needs IAM-admin roles, which makes the pipeline more privileged
than anything it deploys.

The owner asked for apply-on-merge instead, with the PR plan comment as the
review gate: read the plan on the PR, and merging is the approval. The
alternative in practice is that infrastructure changes get merged and then
forgotten before anyone runs `apply` from a laptop — state drifts from the
repository, which is a worse failure than the privilege concern.

## Decision

- **PR** → `fmt -check`, `validate`, `plan` with the read-only `planner`
  account, posted as a sticky comment. This is the review artefact.
- **Merge to main** → `plan -out=tfplan` then `apply tfplan` with a new,
  privileged `github-terraform-apply` account, behind the `infrastructure`
  GitHub environment.
- Inputs live in **`terraform/prod.auto.tfvars`, committed**, so the plan shown
  on the PR and the apply after merge read identical variables. Passing `-var`
  flags from workflow inputs while a laptop used a local `terraform.tfvars`
  would let the two disagree silently.
- The apply job **applies a saved plan file**, not a fresh resolution, so main
  cannot drift between planning and applying inside the same run.

## Containment

The applier can grant itself any role in the project — that is inherent to
managing IAM, not a flaw in the setup. Four things bound it:

1. The WIF provider's `attribute_condition` pins the pool to this repository.
2. The applier's `workloadIdentityUser` binding is on
   `attribute.ref/refs/heads/main` — a PR branch can plan but physically cannot
   assume the apply identity.
3. The `infrastructure` environment is a place to require a reviewer if the
   plan review ever stops feeling like enough.
4. It is a separate account from `github-deployer`, so a compromised app deploy
   cannot reach it.

Roles are enumerated rather than `roles/owner`:
`serviceusage.serviceUsageAdmin`, `datastore.owner`, `firebase.admin`,
`iam.workloadIdentityPoolAdmin`, `iam.serviceAccountAdmin`,
`resourcemanager.projectIamAdmin`, plus `storage.admin` on the state bucket.

## Consequences

- Merging a `terraform/**` change now changes real infrastructure. The plan
  comment is not advisory — treat approving that PR as approving the apply.
- `prevent_destroy` on the Firestore database means a plan that would destroy it
  fails the apply job rather than executing it. That guard matters much more now
  that apply is automated.
- Anyone who can merge to main can change infrastructure. Fine for a solo repo;
  add branch protection before adding collaborators.
