# Deployment

Three workflows, each with a narrow job. Nothing here works until
[firebase-setup.md](firebase-setup.md) is done.

## What runs when

| Trigger | Workflow | What happens |
| --- | --- | --- |
| Any PR | `ci.yml` | lint · typecheck · unit tests · build · Firestore rules tests against the emulator |
| Any PR | `deploy.yml` | build → Hosting **preview channel** `pr-<n>`, 7-day expiry, URL posted as a sticky PR comment |
| PR touching `terraform/**` | `terraform.yml` | `fmt -check` · `validate` · `plan` (read-only creds), posted as a sticky comment |
| Push to `main` | `ci.yml` | same checks |
| Push to `main` | `deploy.yml` | build → **waits for your approval** on the `production` environment → `firebase deploy --only hosting,firestore:rules,firestore:indexes` |
| Push to `main` touching `terraform/**` | `terraform.yml` | `infrastructure` environment → `plan -out=tfplan` → `apply tfplan` |

## The infrastructure review loop

Open a PR → read the plan comment → merge → it applies. **The plan comment is
not advisory.** Approving a `terraform/**` PR is approving the apply that
follows it.

Two details make the plan you read and the apply that runs the same thing:

- Variables live in **`terraform/prod.auto.tfvars`, committed**. Nothing is
  injected from workflow inputs, so CI and your laptop cannot disagree.
- The apply job re-plans to a **saved plan file** and applies that file, so
  nothing can slip in between the two steps of the run.

If you want a second gate, add yourself as a required reviewer on the
`infrastructure` environment; leave it without reviewers for hands-off applies.

## Authentication

GitHub Actions uses **Workload Identity Federation** — no service account JSON
key exists anywhere. Each job requests an OIDC token from GitHub, and Google
exchanges it for a short-lived access token. The WIF provider carries
`attribute_condition = assertion.repository == 'DianaAnton/choreo-planner'`, so
no other repository can use the pool.

Three service accounts, so no single compromised job can do everything:

- **`github-deployer`** — `firebasehosting.admin`, `firebaserules.admin`,
  `datastore.indexAdmin`, `serviceUsageConsumer`. Enough to ship, nothing more.
  Cannot read Terraform state or touch IAM.
- **`github-terraform-plan`** — `roles/viewer` plus read on the state bucket.
  Used only by the plan job, which runs `-lock=false` because it cannot write.
- **`github-terraform-apply`** — privileged: service-account admin, project IAM
  admin, WIF pool admin, Firestore and Firebase admin, state-bucket admin.

That last one can grant itself anything — inherent to managing IAM, not a flaw.
It is bounded by the repository condition on the pool **and** by a
`workloadIdentityUser` binding scoped to `attribute.ref/refs/heads/main`, so a
pull-request branch physically cannot assume it. See
[ADR 0010](decisions/0010-terraform-apply-in-ci.md).

## Config values

All the Firebase web config lives in GitHub **repository variables**, not
secrets. That is correct, not sloppy: the config ships inside the client bundle
by design and identifies the project rather than authorising anything. Firestore
security rules are the actual access control. Storing them as secrets would only
break PR builds and make debugging harder.

Actual secrets in this project: none. That is the point of WIF.

## Rollback

Hosting keeps every release:

```bash
firebase hosting:releases:list --project "$PROJECT_ID"
firebase hosting:rollback --project "$PROJECT_ID"
```

Rules roll back by reverting the commit and re-running the deploy — the rules
release is versioned in Firebase, but the repo is the source of truth.

Infrastructure rolls back by reverting the `terraform/` commit and merging —
the revert's own plan comment shows you exactly what will be undone.

Firestore **data** has no rollback. The database has
`delete_protection_state = DELETE_PROTECTION_ENABLED` and Terraform
`prevent_destroy`, which now matters more than it did when applies were manual:
a plan that would destroy the database fails the apply job instead of running.
Neither guard stops a bad write. If the
project ever holds work you would grieve over, add scheduled exports to a GCS
bucket — a `gcloud firestore export` on Cloud Scheduler, roughly 15 minutes of
setup. Not in v1.

## First-run checklist

Run through this once, in order, after `terraform apply`:

1. Open a throwaway PR. Expect: CI green, a preview URL comment, and (if you
   touched `terraform/`) a plan comment.
2. Open the preview URL on your phone. It should load.
3. Merge. Expect the `production` job to pause for approval.
4. Approve. Expect `https://<project-id>.web.app` to serve the new build.
5. `firebase hosting:releases:list` should show the release tagged with the
   commit SHA.
6. For a `terraform/**` change, expect the apply job to run after the merge and
   its plan to match the PR comment. First time through, watch it rather than
   walking away.

## Known rough edges

- **`pnpm install --frozen-lockfile` fails until `pnpm-lock.yaml` is committed.**
  Run `pnpm install` locally and commit the lockfile before the first PR.
- **The `jq` parse in the preview job** depends on the shape of
  `firebase hosting:channel:deploy --json`. If a firebase-tools release changes
  it, the preview URL comes out empty — check the raw JSON in the job log.
- **Preview channels count against Hosting storage.** The 7-day expiry handles
  it; if you open many long-lived PRs, prune with
  `firebase hosting:channel:delete`.
