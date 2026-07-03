# Create BigQuery Dataset for analytical logs
resource "google_bigquery_dataset" "recipe_dataset" {
  dataset_id                  = var.bq_dataset_id
  friendly_name               = "Recipe Analytics Dataset"
  description                 = "Analytical and telemetry dataset tracking recipes interactions"
  location                    = "US" # BigQuery datasets usually placed in US multi-region
  default_table_expiration_ms = 3600000 * 24 * 30 # expire after 30 days for sandbox efficiency (optional)
}

# Create BigQuery Table for events stream
resource "google_bigquery_table" "recipe_events" {
  dataset_id = google_bigquery_dataset.recipe_dataset.dataset_id
  table_id   = "recipe_events"
  deletion_protection = false

  schema = <<EOF
[
  {
    "name": "event_type",
    "type": "STRING",
    "mode": "REQUIRED",
    "description": "The event category e.g. view, create, delete"
  },
  {
    "name": "recipe_id",
    "type": "INTEGER",
    "mode": "NULLABLE",
    "description": "Database key mapping the recipe"
  },
  {
    "name": "recipe_title",
    "type": "STRING",
    "mode": "NULLABLE",
    "description": "Shorthand snapshot of the recipe name"
  },
  {
    "name": "timestamp",
    "type": "TIMESTAMP",
    "mode": "REQUIRED",
    "description": "When the API telemetry captured this action"
  },
  {
    "name": "details",
    "type": "STRING",
    "mode": "NULLABLE",
    "description": "Serialised supplementary event fields"
  }
]
EOF
}
