# GCP Sandbox Bootstrapper - PowerShell Script for Windows users
# Setup GCP APIs, Service Accounts, and local configs

$ErrorActionPreference = 'Stop'

Write-Host "=====================================================" -ForegroundColor Blue
Write-Host "      GCP Recipe Manager & Sandbox Bootstrapper      " -ForegroundColor Blue
Write-Host "=====================================================" -ForegroundColor Blue

$ProjectID = Read-Host "Enter your Google Cloud Project ID (if empty, we generate a random one)"
if ([string]::IsNullOrWhiteSpace($ProjectID)) {
    $randomStr = -join ((97..122) | Get-Random -Count 6 | % {[char]$_})
    $ProjectID = "recipe-sandbox-$randomStr"
    Write-Host "Auto-generated Project ID: $ProjectID" -ForegroundColor Cyan
}

$Region = Read-Host "Enter GCP deployment region [us-central1]"
if ([string]::IsNullOrWhiteSpace($Region)) {
    $Region = "us-central1"
}

$DB_PASS = Read-Host "Enter Database admin password [PgSecurePassw0rdRecipe]"
if ([string]::IsNullOrWhiteSpace($DB_PASS)) {
    $DB_PASS = "PgSecurePassw0rdRecipe"
}

# 1.5 Auto-Create Project if it doesn't exist
Write-Host "`nChecking if project '$ProjectID' exists..." -ForegroundColor Yellow
$projectExists = $true
try {
    $existingProject = & gcloud projects describe $ProjectID --format="value(projectId)" 2>$null
    if ([string]::IsNullOrEmpty($existingProject)) { $projectExists = $false }
} catch {
    $projectExists = $false
}

if (-not $projectExists) {
    Write-Host "Project '$ProjectID' not found. Creating it now..." -ForegroundColor Cyan
    & gcloud projects create $ProjectID --name="$ProjectID"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create project. Does that name already exist globally? Try a more unique name instead!"
        Exit
    }
    Write-Host "Project successfully created!" -ForegroundColor Green
}

# 1.6 Manage Billing Account association
Write-Host "`nChecking billing status for project '$ProjectID'..." -ForegroundColor Yellow
$billingEnabled = & gcloud billing projects describe $ProjectID --format="value(billingEnabled)" 2>$null
if ($billingEnabled -ne "True") {
    Write-Host "Billing is not enabled on project '$ProjectID'. Searching for active billing accounts..." -ForegroundColor Yellow
    $activeBillingAccount = & gcloud billing accounts list --format="value(name)" --filter="open=true" 2>$null | Select-Object -First 1
    if (-not [string]::IsNullOrEmpty($activeBillingAccount)) {
        Write-Host "Found open billing account: $activeBillingAccount. Linking details..." -ForegroundColor Cyan
        try {
            & gcloud billing projects link $ProjectID --billing-account=$activeBillingAccount
        } catch {
            Write-Host "Failed to automatically link billing account: $_" -ForegroundColor Red
            Write-Host "`n⚠️ IMPORTANT: You MUST link a Billing Account before you can use Cloud SQL or Cloud Run." -ForegroundColor Red
            Write-Host "Go to: https://console.cloud.google.com/billing/linkedaccount?project=$ProjectID" -ForegroundColor Yellow
            Read-Host "Press Enter once you have linked a billing account to continue..."
        }
    } else {
        Write-Host "`n⚠️ IMPORTANT: You MUST link a Billing Account before you can use Cloud SQL or Cloud Run." -ForegroundColor Red
        Write-Host "Go to: https://console.cloud.google.com/billing/linkedaccount?project=$ProjectID" -ForegroundColor Yellow
        Read-Host "Press Enter once you have linked a billing account to continue..."
    }
} else {
    Write-Host "Billing is already enabled for project '$ProjectID'." -ForegroundColor Green
}

# Set current active project context
Write-Host "`nSetting active GCP project to: $ProjectID..." -ForegroundColor Yellow
& gcloud config set project $ProjectID

# 2. Enable necessary GCP APIs
Write-Host "`nEnabling GCP REST APIs (SQLAdmin, Storage, BigQuery, IAM, CloudBuild)..." -ForegroundColor Yellow
& gcloud services enable `
    sqladmin.googleapis.com `
    storage.googleapis.com `
    bigquery.googleapis.com `
    run.googleapis.com `
    iam.googleapis.com `
    cloudbuild.googleapis.com

# 3. Create service account and key credentials for local development
$SA_NAME = "recipe-backend-sa"
$SA_EMAIL = "$SA_NAME@$ProjectID.iam.gserviceaccount.com"

# Check if Service Account already exists, if not create it
$saExists = $true
try {
    & gcloud iam service-accounts describe $SA_EMAIL --format="value(email)" 2>$null
} catch {
    $saExists = $false
}

if (-not $saExists) {
    Write-Host "`nCreating Service Account: $SA_NAME..." -ForegroundColor Yellow
    & gcloud iam service-accounts create $SA_NAME `
        --description="Service account for local Recipe Manager backend client" `
        --display-name="Recipe Manager Sandbox SA"
} else {
    Write-Host "`nService Account $SA_NAME already exists. Skipping creation..." -ForegroundColor Green
}

# Generate credentials key file for CLI/Local running
$KEY_PATH = "../credentials.json"
Write-Host "`nGenerating access key.json credentials for Service Account..." -ForegroundColor Yellow
try {
    & gcloud iam service-accounts keys create $KEY_PATH --iam-account=$SA_EMAIL
} catch {
    Write-Host "Warning: Key could not be generated. You might have run out of key limit (10 keys max) or lack permissions." -ForegroundColor Yellow
    Write-Host "You can continue, but you might need to use Application Default Credentials (ADC) local environment." -ForegroundColor Yellow
}

# 4. Generate local configurations files
Write-Host "`nStructuring Terraform parameters (terraform/terraform.tfvars)..." -ForegroundColor Yellow
$tfvarsContent = @"
project_id  = "$ProjectID"
region      = "$Region"
db_password = "$DB_PASS"
"@
$tfvarsContent | Out-File -FilePath "..\terraform\terraform.tfvars" -Encoding utf8
Write-Host "Created: terraform/terraform.tfvars" -ForegroundColor Green

# Generate backend local .env configurations
$envContent = @"
PORT=5000
NODE_ENV=development
DB_USER=postgres
DB_PASS=$DB_PASS
DB_NAME=recipedb
DB_HOST=127.0.0.1
DB_PORT=5432
GCP_PROJECT_ID=$ProjectID
GCS_BUCKET_NAME=$ProjectID-recipe-images
BQ_DATASET_NAME=recipe_analytics
GOOGLE_APPLICATION_CREDENTIALS=../credentials.json
"@
$envContent | Out-File -FilePath "..\backend\.env" -Encoding utf8
Write-Host "Created: backend/.env" -ForegroundColor Green

Write-Host "`n=====================================================" -ForegroundColor Green
Write-Host "           Environment Initialisation Complete!     " -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green
Write-Host "Next steps:"
Write-Host "  1. Provision GCP infrastructure using Terraform:"
Write-Host "     cd terraform; terraform init; terraform apply" -ForegroundColor Blue
Write-Host "  2. Connect to database locally and run seed script."
Write-Host "     Read the README.md guide for full details!"
Write-Host "====================================================="
