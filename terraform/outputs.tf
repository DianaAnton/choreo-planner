output "hosting_prod_site_id" {
  description = "Hosting site ID for production (the default site created with the project)."
  value       = var.project_id
}

output "hosting_staging_site_id" {
  description = "Hosting site ID for staging, or null when enable_staging_site is false."
  value       = var.enable_staging_site ? google_firebase_hosting_site.staging[0].site_id : null
}

output "firestore_location" {
  description = "Where the Firestore database lives. Immutable."
  value       = google_firestore_database.default.location_id
}

output "github_actions_config" {
  description = "Everything GitHub Actions needs. Set these as repository variables — none of them are secrets."
  value = {
    GCP_PROJECT_ID             = var.project_id
    GCP_WIF_PROVIDER           = google_iam_workload_identity_pool_provider.github.name
    GCP_DEPLOY_SERVICE_ACCOUNT = google_service_account.deployer.email
    GCP_PLAN_SERVICE_ACCOUNT   = google_service_account.planner.email
    TF_STATE_BUCKET            = local.state_bucket
  }
}
