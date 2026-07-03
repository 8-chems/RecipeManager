variable "project_id" {
  type        = string
  description = "The Google Cloud Platform ID where resources will be created"
}

variable "region" {
  type        = string
  description = "GCP deployment region"
  default     = "us-central1"
}

variable "zone" {
  type        = string
  description = "GCP deployment zone"
  default     = "us-central1-a"
}

variable "db_user" {
  type        = string
  description = "Database administrator username"
  default     = "postgres"
}

variable "db_password" {
  type        = string
  description = "Database administrator password"
  default     = "PgSecurePassw0rdRecipe"
  sensitive   = true
}

variable "db_name" {
  type        = string
  description = "PostgreSQL initial database name"
  default     = "recipedb"
}

variable "bq_dataset_id" {
  type        = string
  description = "BigQuery dataset name"
  default     = "recipe_analytics"
}
