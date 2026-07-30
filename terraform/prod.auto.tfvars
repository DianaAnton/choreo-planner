# Committed on purpose: none of these are secrets, and CI and your laptop must
# feed Terraform identical inputs. If CI passed -var flags while you used a
# local terraform.tfvars, an apply on merge could silently flip settings back
# and forth between runs.
#
# *.auto.tfvars is loaded automatically by both `plan` and `apply`.

# Must match the project ID from the Firebase console (docs/firebase-setup.md
# step 1) — it may have a random suffix if the name was already taken.
project_id = "choreo-planner"

# PERMANENT once applied. eur3 is the Europe multi-region: europe-west1
# (Belgium) + europe-west4 (Netherlands). Not Ireland — GCP has no Ireland
# region. Deleting the database is the only way to change this.
firestore_location = "eur3"

# Pins Workload Identity Federation to this repository only.
github_repository = "DianaAnton/choreo-planner"

# Persistent staging URL. Requires Blaze; PR preview channels work without it.
enable_staging_site = false
