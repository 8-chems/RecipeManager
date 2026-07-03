# Create GCS Bucket for Recipe Images
resource "google_storage_bucket" "recipe_bucket" {
  name          = "${var.project_id}-recipe-images"
  location      = var.region
  force_destroy = true # allows removing bucket with images on terraform destroy for easy clean testing

  uniform_bucket_level_access = true

  # CORS schema allowing frontend client fetches.
  cors {
    origin          = ["*"]
    method          = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  website {
    main_page_suffix = "index.html"
    not_found_page   = "404.html"
  }
}

# Grant public read access to all objects inside this bucket
resource "google_storage_bucket_iam_member" "public_rule" {
  bucket = google_storage_bucket.recipe_bucket.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}
