#!/usr/bin/env bash
# =============================================================
# setup_cicd.sh
# One-time script to configure Workload Identity Federation
# between your GitHub repository and Google Cloud Platform.
#
# Run this ONCE from your local machine after `gcloud auth login`.
# It outputs the values you need to add as GitHub Secrets.
# =============================================================

set -e

# ── Variables (edit these) ────────────────────────────────────────────────────
read -p "Your GCP Project ID: " PROJECT_ID
read -p "Your GitHub repo (format: owner/repo-name): " GITHUB_REPO
REGION="${REGION:-us-central1}"

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
SA_NAME="recipe-backend-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
POOL_NAME="github-pool"
POOL_ID="github-pool"
PROVIDER_NAME="github-provider"
ARTIFACT_REPO="recipe-manager"

echo ""
echo "========================================="
echo "  GCP CI/CD Workload Identity Setup"
echo "========================================="

# ── 1. Enable required APIs ───────────────────────────────────────────────────
echo "[1/7] Enabling required APIs..."
gcloud services enable \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  bigquery.googleapis.com \
  --project="$PROJECT_ID"

# ── 2. Create the Service Account (if it doesn't exist) ───────────────────────
echo "[2/7] Ensuring Service Account exists..."
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="Recipe Manager Deployments SA" \
    --project="$PROJECT_ID"
fi

# ── 3. Grant the SA roles needed for CI/CD deployments ───────────────────────
echo "[3/7] Binding IAM roles to Service Account..."
ROLES=(
  "roles/run.admin"               # deploy Cloud Run services
  "roles/iam.serviceAccountUser"  # act as service accounts
  "roles/artifactregistry.writer" # push Docker images
  "roles/cloudsql.client"         # access Cloud SQL
  "roles/storage.objectUser"      # upload to GCS
  "roles/bigquery.dataEditor"     # write to BigQuery
  "roles/bigquery.jobUser"        # run BQ queries
  "roles/secretmanager.secretAccessor" # read secrets (DB password)
)
for ROLE in "${ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$ROLE" \
    --quiet
done

# ── 4. Create Artifact Registry repository ────────────────────────────────────
echo "[4/7] Creating Artifact Registry repository: ${ARTIFACT_REPO}..."
if ! gcloud artifacts repositories describe "$ARTIFACT_REPO" \
     --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  gcloud artifacts repositories create "$ARTIFACT_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Recipe Manager Docker images" \
    --project="$PROJECT_ID"
fi

# ── 5. Create Workload Identity Pool ─────────────────────────────────────────
echo "[5/7] Creating Workload Identity Pool..."
if ! gcloud iam workload-identity-pools describe "$POOL_ID" \
     --location="global" --project="$PROJECT_ID" &>/dev/null; then
  gcloud iam workload-identity-pools create "$POOL_ID" \
    --project="$PROJECT_ID" \
    --location="global" \
    --display-name="GitHub Actions Pool"
fi

# ── 6. Create Workload Identity Provider (GitHub OIDC) ───────────────────────
echo "[6/7] Creating GitHub OIDC provider..."
if ! gcloud iam workload-identity-pools providers describe "$PROVIDER_NAME" \
     --workload-identity-pool="$POOL_ID" \
     --location="global" --project="$PROJECT_ID" &>/dev/null; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_NAME" \
    --project="$PROJECT_ID" \
    --location="global" \
    --workload-identity-pool="$POOL_ID" \
    --display-name="GitHub OIDC Provider" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='${GITHUB_REPO}'"
fi

# ── 7. Allow GitHub Actions to impersonate the SA ────────────────────────────
echo "[7/7] Binding Workload Identity to Service Account..."
WORKLOAD_IDENTITY_POOL_ID=$(gcloud iam workload-identity-pools describe "$POOL_ID" \
  --project="$PROJECT_ID" \
  --location="global" \
  --format="value(name)")

gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${WORKLOAD_IDENTITY_POOL_ID}/attribute.repository/${GITHUB_REPO}"

# ── Output values to add as GitHub Secrets ───────────────────────────────────
PROVIDER_FULL=$(gcloud iam workload-identity-pools providers describe "$PROVIDER_NAME" \
  --workload-identity-pool="$POOL_ID" \
  --location="global" \
  --project="$PROJECT_ID" \
  --format="value(name)")

CLOUD_SQL_CONNECTION=$(gcloud sql instances describe recipe-db-instance \
  --project="$PROJECT_ID" \
  --format="value(connectionName)" 2>/dev/null || echo "NOT_YET_PROVISIONED_run_terraform_first")

echo ""
echo "=============================================================="
echo "   ✅  Workload Identity Federation setup complete!"
echo "=============================================================="
echo ""
echo "  Add the following as GitHub Secrets in:"
echo "  https://github.com/${GITHUB_REPO}/settings/secrets/actions"
echo ""
echo "  Secret Name                      | Value"
echo "  ---------------------------------|----------------------------------------------"
echo "  GCP_PROJECT_ID                   | $PROJECT_ID"
echo "  GCP_REGION                       | $REGION"
echo "  GCP_WORKLOAD_IDENTITY_PROVIDER   | $PROVIDER_FULL"
echo "  GCP_SERVICE_ACCOUNT_EMAIL        | $SA_EMAIL"
echo "  GCS_BUCKET_NAME                  | ${PROJECT_ID}-recipe-images"
echo "  BQ_DATASET_NAME                  | recipe_analytics"
echo "  DB_USER                          | postgres"
echo "  DB_NAME                          | recipedb"
echo "  DB_PASS                          | (your DB password)"
echo "  CLOUD_SQL_CONNECTION_NAME        | $CLOUD_SQL_CONNECTION"
echo "  BACKEND_URL                      | (your Cloud Run backend URL, set after 1st deploy)"
echo "=============================================================="
