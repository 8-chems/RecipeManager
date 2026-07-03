output "db_connection_name" {
  value       = google_sql_database_instance.postgres.connection_name
  description = "The Cloud SQL Instance connection string (used by Auth Proxy/Cloud Run)"
}

output "db_public_ip" {
  value       = google_sql_database_instance.postgres.public_ip_address
  description = "The Cloud SQL Instance public IP address"
}

output "gcs_bucket_name" {
  value       = google_storage_bucket.recipe_bucket.name
  description = "The name of GCS Bucket created for images"
}

output "bq_dataset_id" {
  value       = google_bigquery_dataset.recipe_dataset.dataset_id
  description = "The BigQuery dataset ID"
}

output "service_account_email" {
  value       = google_service_account.backend_sa.email
  description = "The generated service account email"
}
