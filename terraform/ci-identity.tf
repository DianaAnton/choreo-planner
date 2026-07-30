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
# Planner — read-only, so PRs can post a `terraform plan` diff.
# `terraform apply` deliberately stays a local, human-run operation: granting CI
# the IAM-admin roles apply needs would make the pipeline more privileged than
# anything it deploys.
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

resource "google_service_account_iam_member" "planner_wif" {
  service_account_id = google_service_account.planner.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}
