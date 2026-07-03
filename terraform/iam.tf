# Create modern Dedicated Service Account for Sandbox integrations
import {
  to = google_service_account.backend_sa
  id = "projects/${var.project_id}/serviceAccounts/recipe-backend-sa@${var.project_id}.iam.gserviceaccount.com"
}

resource "google_service_account" "backend_sa" {
  account_id   = "recipe-backend-sa"
  display_name = "Recipe Sandbox Backend Service Account"
  description  = "Service account for Express API backend to query SQL, upload to GCS, write to BQ"
}

# Attach IAM roles to the Service Account
locals {
  sa_roles = [
    "roles/cloudsql.client",      # needed to connect to Cloud SQL database
    "roles/storage.objectUser",   # read-write access to GCS bucket objects
    "roles/bigquery.dataEditor",  # stream insert rows to BigQuery tables
    "roles/bigquery.jobUser",    # execute query jobs inside BigQuery
  ]
}

resource "google_project_iam_member" "sa_bindings" {
  for_each = toset(local.sa_roles)
  project  = var.project_id
  role     = each.key
  member   = "serviceAccount:${google_service_account.backend_sa.email}"
}
