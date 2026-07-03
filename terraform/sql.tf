resource "google_sql_database_instance" "postgres" {
  name             = "recipe-db-instance"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier = "db-f1-micro"

    ip_configuration {
      ipv4_enabled = true
      # No authorized networks are added here to enforce secure connection 
      # using Cloud SQL Auth Proxy (which connects via IAM credentials)
      # or you can optionally add public CIDR rules for manual local testing:
      # authorized_networks {
      #   value = "0.0.0.0/0"
      # }
    }

    # Backup & maintenance can be turned down/off for cost saving in sandbox environments
    backup_configuration {
      enabled = false
    }
  }

  deletion_protection = false # Set false so we can clean-test and destroy environment easily
}

resource "google_sql_database" "recipe_db" {
  name     = var.db_name
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "db_admin" {
  name     = var.db_user
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
}
