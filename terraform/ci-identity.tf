# Workload Identity Federation: GitHub Actions exchanges its OIDC token for
# short-lived Google credentials. No service account JSON key is ever created,
# so there is no long-lived secret in the repo to leak or rotate.

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions"
  description               = "Federated identity for ${var.github_repository}"

  depends_on = [google_project_service.enabled]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
    "attribute.ref"              = "assertion.ref"
  }

  # Without this condition ANY GitHub repository on the internet could mint
  # tokens for this pool. Never remove it.
  attribute_condition = "assertion.repository == '${var.github_repository}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# ---------------------------------------------------------------------------
# Deployer — builds and publishes the app. Narrowest roles that still work.
# ---------------------------------------------------------------------------

resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = "github-deployer"
  display_name = "GitHub Actions — Hosting & rules deploys"
}

resource "google_project_iam_member" "deployer" {
  for_each = toset([
    "roles/firebasehosting.admin",             # deploy sites + preview channels
    "roles/firebaserules.admin",               # deploy firestore.rules
    "roles/datastore.indexAdmin",              # deploy firestore.indexes.json
    "roles/serviceusage.serviceUsageConsumer", # call the APIs at all
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# ---------------------------------------------------------------------------
# Planner — read-only, so PRs can post a `terraform plan` diff. That comment is
# the review gate for the apply that runs on merge (ADR 0010), which is why this
# account is kept separate: a PR from any branch can plan, but planning can
# never change anything.
# ---------------------------------------------------------------------------

resource "google_service_account" "planner" {
  project      = var.project_id
  account_id   = "github-terraform-plan"
  display_name = "GitHub Actions — terraform plan (read-only)"
}

resource "google_project_iam_member" "planner" {
  project = var.project_id
  role    = "roles/viewer"
  member  = "serviceAccount:${google_service_account.planner.email}"
}

# Read the state file, but never write it — plan runs with -lock=false.
resource "google_storage_bucket_iam_member" "planner_state" {
  bucket = local.state_bucket
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.planner.email}"
}

# Separate from objectViewer above: this config declares IAM bindings ON this
# bucket (this resource and applier_state below), so planning them at all
# requires reading the bucket's current IAM policy — storage.buckets.getIamPolicy
# — which objectViewer does not grant. Without this, every plan run fails on its
# own bucket bindings, including this one.
#
# No predefined role grants just this: storage.legacyBucketReader does NOT
# include it (verified against `gcloud iam roles describe`, despite being the
# commonly-suggested fix online); the only predefined roles that do —
# storage.admin and storage.legacyBucketOwner — also grant write, which would
# defeat the point of a read-only plan identity. Hence the one-permission
# custom role below.
resource "google_project_iam_custom_role" "bucket_iam_reader" {
  project     = var.project_id
  role_id     = "bucketIamPolicyReader"
  title       = "Bucket IAM policy reader"
  description = "Read a bucket's IAM policy without any object or bucket write access."
  permissions = ["storage.buckets.getIamPolicy"]
}

resource "google_storage_bucket_iam_member" "planner_state_policy_read" {
  bucket = local.state_bucket
  role   = google_project_iam_custom_role.bucket_iam_reader.id
  member = "serviceAccount:${google_service_account.planner.email}"
}

resource "google_service_account_iam_member" "planner_wif" {
  service_account_id = google_service_account.planner.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# ---------------------------------------------------------------------------
# Applier — runs `terraform apply` after a PR merges to main (ADR 0010).
#
# This is the most privileged identity in the project: the roles Terraform
# needs to manage IAM are also enough to grant anything else. It is constrained
# by (a) the WIF attribute condition pinning it to this repository, (b) an
# `attribute.ref` condition pinning it to refs/heads/main, and (c) the
# `infrastructure` GitHub environment. Do not reuse it for app deploys.
# ---------------------------------------------------------------------------

resource "google_service_account" "applier" {
  project      = var.project_id
  account_id   = "github-terraform-apply"
  display_name = "GitHub Actions — terraform apply (privileged)"
}

resource "google_project_iam_member" "applier" {
  for_each = toset([
    "roles/serviceusage.serviceUsageAdmin",  # google_project_service
    "roles/datastore.owner",                 # google_firestore_database
    "roles/firebase.admin",                  # google_firebase_hosting_site
    "roles/iam.workloadIdentityPoolAdmin",   # the WIF pool and provider
    "roles/iam.serviceAccountAdmin",         # the three service accounts
    "roles/resourcemanager.projectIamAdmin", # google_project_iam_member
    "roles/iam.roleAdmin",                   # google_project_iam_custom_role
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.applier.email}"
}

# Read/write state, and manage the bucket IAM binding Terraform owns.
resource "google_storage_bucket_iam_member" "applier_state" {
  bucket = local.state_bucket
  role   = "roles/storage.admin"
  member = "serviceAccount:${google_service_account.applier.email}"
}

# Pinned to main: a PR branch can plan, but only a merged commit can apply.
resource "google_service_account_iam_member" "applier_wif" {
  service_account_id = google_service_account.applier.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.ref/refs/heads/main"
}
