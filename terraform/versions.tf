terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.0, < 8.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = ">= 6.0, < 8.0"
    }
  }

  # Bucket is supplied at init time so the project ID is not hardcoded:
  #   terraform init -backend-config="bucket=${PROJECT_ID}-tfstate"
  # Create the bucket first — see docs/firebase-setup.md step 5.
  backend "gcs" {
    prefix = "choreo-planner"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}
