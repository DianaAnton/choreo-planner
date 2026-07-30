locals {
  state_bucket = coalesce(var.state_bucket, "${var.project_id}-tfstate")

  services = [
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "firebase.googleapis.com",
    "firebasehosting.googleapis.com",
    "firebaserules.googleapis.com",
    "firestore.googleapis.com",
    "identitytoolkit.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
  ]
}

# The project itself and the Firebase resource on it are created by hand in the
# console — a personal Google account lacks org-level projectCreator, and
# enabling the Google sign-in provider has to happen in the console anyway
# because it mints an OAuth client as a side effect.
# See docs/decisions/0007-terraform-and-ci-identity.md.

resource "google_project_service" "enabled" {
  for_each = toset(local.services)

  project = var.project_id
  service = each.value

  # Leave APIs on if this config is destroyed; disabling them would break the
  # console and anything else in the project.
  disable_on_destroy = false
}

# ---------------------------------------------------------------------------
# Firestore
# ---------------------------------------------------------------------------

resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.firestore_location
  type        = "FIRESTORE_NATIVE"

  concurrency_mode            = "OPTIMISTIC"
  app_engine_integration_mode = "DISABLED"

  delete_protection_state = "DELETE_PROTECTION_ENABLED"
  deletion_policy         = "ABANDON"

  depends_on = [google_project_service.enabled]

  lifecycle {
    # location_id is immutable in the API; this makes the failure loud and early
    # rather than a destroy-and-recreate that silently loses every project.
    prevent_destroy = true
  }
}

# NOTE: Firestore rules and indexes are NOT managed here. They are deployed by
# the Firebase CLI from .github/workflows/deploy.yml, so there is exactly one
# owner of firestore.rules and one review path for changing it.

# ---------------------------------------------------------------------------
# Hosting
# ---------------------------------------------------------------------------

# The default site (site_id == project_id) is created with the project, so it is
# only referenced, never declared. `staging` is optional and Blaze-only.

resource "google_firebase_hosting_site" "staging" {
  provider = google-beta
  count    = var.enable_staging_site ? 1 : 0

  project = var.project_id
  site_id = "${var.project_id}-staging"

  depends_on = [google_project_service.enabled]
}
