variable "project_id" {
  type        = string
  description = "The GCP/Firebase project ID, created by hand in the Firebase console."
}

variable "region" {
  type        = string
  description = "Default region for regional resources."
  default     = "europe-west1"
}

variable "firestore_location" {
  type        = string
  description = <<-EOT
    Firestore database location. PERMANENT — a database's location can never be
    changed after creation. Use a multi-region: "eur3" (Europe) or "nam5" (US).
  EOT
  default     = "eur3"

  validation {
    condition     = contains(["eur3", "nam5"], var.firestore_location)
    error_message = "Use a multi-region location: eur3 or nam5. Regional locations are cheaper but have no multi-region failover; if you want one, remove this validation deliberately."
  }
}

variable "github_repository" {
  type        = string
  description = "owner/repo — pins the Workload Identity provider so only this repository can impersonate the CI service accounts."

  validation {
    condition     = can(regex("^[^/]+/[^/]+$", var.github_repository))
    error_message = "Must be in owner/repo form, e.g. DianaAnton/choreo-planner."
  }
}

variable "enable_staging_site" {
  type        = bool
  description = <<-EOT
    Create a second Hosting site for staging. Requires the Blaze plan (multi-site
    hosting is not available on Spark). PR preview channels work either way, so
    leave this false unless you specifically want a persistent staging URL.
  EOT
  default     = false
}

variable "state_bucket" {
  type        = string
  description = "Terraform state bucket name, used to grant the CI plan account read access. Defaults to <project_id>-tfstate."
  default     = null
}
