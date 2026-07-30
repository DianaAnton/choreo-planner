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

`terraform apply` is **not** in CI. See below.

## Authentication

GitHub Actions uses **Workload Identity Federation** — no service account JSON
key exists anywhere. Each job requests an OIDC token from GitHub, and Google
exchanges it for a short-lived access token. The WIF provider carries
`attribute_condition = assertion.repository == 'DianaAnton/choreo-planner'`, so
no other repository can use the pool.

Two service accounts, deliberately:

- **`github-deployer`** — `firebasehosting.admin`, `firebaserules.admin`,
  `datastore.indexAdmin`, `serviceUsageConsumer`. Enough to ship, nothing more.
- **`github-terraform-plan`** — `roles/viewer` plus read on the state bucket.
  Used only by the plan job, which runs `-lock=false` because it cannot write.

## Why apply is manual

`terraform apply` needs IAM-admin roles (creating service accounts, granting
project roles, managing the WIF pool). Giving those to a workflow makes CI more
powerful than everything it deploys — a compromised action could grant itself
ownership. For a solo project the trade is not worth it.

The flow is: open a PR, read the plan comment, merge, then from your laptop:

```bash
cd terraform
terraform apply
```

If this ever becomes a bottleneck, the upgrade is a third service account with
scoped admin roles plus the `production` environment gate on an apply job.

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

Firestore **data** has no rollback. The database has
`delete_protection_state = DELETE_PROTECTION_ENABLED` and Terraform
`prevent_destroy`, which stops accidental deletion but not a bad write. If the
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

## Known rough edges

- **`pnpm install --frozen-lockfile` fails until `pnpm-lock.yaml` is committed.**
  Run `pnpm install` locally and commit the lockfile before the first PR.
- **The `jq` parse in the preview job** depends on the shape of
  `firebase hosting:channel:deploy --json`. If a firebase-tools release changes
  it, the preview URL comes out empty — check the raw JSON in the job log.
- **Preview channels count against Hosting storage.** The 7-day expiry handles
  it; if you open many long-lived PRs, prune with
  `firebase hosting:channel:delete`.
