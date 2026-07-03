# =============================================================
# setup_cicd.ps1
# One-time script to configure Workload Identity Federation
# between your GitHub repository and Google Cloud Platform.
#
# Run this ONCE from your local machine after 'gcloud auth login'.
# It outputs the values you need to add as GitHub Secrets.
# =============================================================

$ErrorActionPreference = "Stop"

$ProjectID = Read-Host "Your GCP Project ID"
$GitHubRepo = Read-Host "Your GitHub repo (format: owner/repo-name)"
$Region = "us-central1"

$ProjectNumber = (& gcloud projects describe $ProjectID --format="value(projectNumber)")
$SA_NAME = "recipe-backend-sa"
$SA_EMAIL = "$SA_NAME@$ProjectID.iam.gserviceaccount.com"
$PoolId = "github-pool"
$ProviderName = "github-provider"
$ArtifactRepo = "recipe-manager"

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "  GCP CI/CD Workload Identity Setup" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# ── 1. Enable APIs ───────────────────────────────────────────────────────────
Write-Host "`n[1/7] Enabling required APIs..." -ForegroundColor Yellow
& gcloud services enable `
    iam.googleapis.com `
    iamcredentials.googleapis.com `
    artifactregistry.googleapis.com `
    run.googleapis.com `
    sqladmin.googleapis.com `
    storage.googleapis.com `
    bigquery.googleapis.com `
    secretmanager.googleapis.com `
    --project=$ProjectID

# ── 2. Create Service Account ─────────────────────────────────────────────────
Write-Host "`n[2/7] Ensuring Service Account exists..." -ForegroundColor Yellow
$saCheck = & gcloud iam service-accounts list --project=$ProjectID --format="value(email)" --filter="email=$SA_EMAIL"
if (-not $saCheck) {
    & gcloud iam service-accounts create $SA_NAME `
        --display-name="Recipe Manager Deployments SA" `
        --project=$ProjectID
}

# ── 3. Grant IAM Roles ────────────────────────────────────────────────────────
Write-Host "`n[3/7] Binding IAM roles to Service Account..." -ForegroundColor Yellow
$roles = @(
    "roles/run.admin",
    "roles/iam.serviceAccountUser",
    "roles/artifactregistry.writer",
    "roles/cloudsql.client",
    "roles/storage.objectUser",
    "roles/bigquery.dataEditor",
    "roles/bigquery.jobUser",
    "roles/secretmanager.secretAccessor"
)
foreach ($role in $roles) {
    & gcloud projects add-iam-policy-binding $ProjectID `
        --member="serviceAccount:$SA_EMAIL" `
        --role=$role `
        --quiet
}

# ── 4. Create Artifact Registry Repo ─────────────────────────────────────────
Write-Host "`n[4/7] Creating Artifact Registry repository..." -ForegroundColor Yellow
$arCheck = & gcloud artifacts repositories list --location=$Region --project=$ProjectID --format="value(name)" --filter="name:$ArtifactRepo"
if (-not $arCheck) {
    & gcloud artifacts repositories create $ArtifactRepo `
        --repository-format=docker `
        --location=$Region `
        --description="Recipe Manager Docker images" `
        --project=$ProjectID
}

# ── 5. Create Workload Identity Pool ─────────────────────────────────────────
Write-Host "`n[5/7] Creating Workload Identity Pool..." -ForegroundColor Yellow
$poolCheck = & gcloud iam workload-identity-pools list --location=global --project=$ProjectID --format="value(name)" --filter="name:$PoolId"
if (-not $poolCheck) {
    & gcloud iam workload-identity-pools create $PoolId `
        --project=$ProjectID `
        --location=global `
        --display-name="GitHub Actions Pool"
}

# ── 6. Create OIDC Provider ───────────────────────────────────────────────────
Write-Host "`n[6/7] Creating GitHub OIDC Provider..." -ForegroundColor Yellow
$providerCheck = & gcloud iam workload-identity-pools providers list `
    --workload-identity-pool=$PoolId `
    --location=global --project=$ProjectID `
    --format="value(name)" --filter="name:$ProviderName"

if (-not $providerCheck) {
    & gcloud iam workload-identity-pools providers create-oidc $ProviderName `
        --project=$ProjectID `
        --location=global `
        --workload-identity-pool=$PoolId `
        --display-name="GitHub OIDC Provider" `
        --issuer-uri="https://token.actions.githubusercontent.com" `
        --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" `
        --attribute-condition="assertion.repository=='$GitHubRepo'"
}

# ── 7. Allow GitHub to impersonate the SA ────────────────────────────────────
Write-Host "`n[7/7] Binding Workload Identity to Service Account..." -ForegroundColor Yellow
$PoolFullName = & gcloud iam workload-identity-pools describe $PoolId `
    --project=$ProjectID `
    --location=global `
    --format="value(name)"

& gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL `
    --project=$ProjectID `
    --role="roles/iam.workloadIdentityUser" `
    --member="principalSet://iam.googleapis.com/$PoolFullName/attribute.repository/$GitHubRepo"

# ── Collect outputs ──────────────────────────────────────────────────────────
$ProviderFullName = & gcloud iam workload-identity-pools providers describe $ProviderName `
    --workload-identity-pool=$PoolId `
    --location=global --project=$ProjectID `
    --format="value(name)"

$CloudSQLConn = "NOT_YET_PROVISIONED_run_terraform_first"
try {
    $CloudSQLConn = & gcloud sql instances describe recipe-db-instance `
        --project=$ProjectID `
        --format="value(connectionName)" 2>$null
} catch {}

Write-Host "`n==============================================================" -ForegroundColor Green
Write-Host "   ✅  Workload Identity Federation setup complete!" -ForegroundColor Green
Write-Host "==============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Add the following as GitHub Secrets in:"
Write-Host "  https://github.com/$GitHubRepo/settings/secrets/actions" -ForegroundColor Blue
Write-Host ""
Write-Host "  Secret Name                      | Value" -ForegroundColor Cyan
Write-Host "  ---------------------------------|----------------------------------------------"
Write-Host "  GCP_PROJECT_ID                   | $ProjectID"
Write-Host "  GCP_REGION                       | $Region"
Write-Host "  GCP_WORKLOAD_IDENTITY_PROVIDER   | $ProviderFullName"
Write-Host "  GCP_SERVICE_ACCOUNT_EMAIL        | $SA_EMAIL"
Write-Host "  GCS_BUCKET_NAME                  | $ProjectID-recipe-images"
Write-Host "  BQ_DATASET_NAME                  | recipe_analytics"
Write-Host "  DB_USER                          | postgres"
Write-Host "  DB_NAME                          | recipedb"
Write-Host "  DB_PASS                          | (your DB password)"
Write-Host "  CLOUD_SQL_CONNECTION_NAME        | $CloudSQLConn"
Write-Host "  BACKEND_URL                      | (Cloud Run backend URL, set after 1st deploy)"
Write-Host "==============================================================" -ForegroundColor Green
