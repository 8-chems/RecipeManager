#!/bin/bash
# GCP Sandbox Bootstrapper - Setup GCP APIs, Service Accounts, and local configs

set -e

# Visual formatting helpers
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=====================================================${NC}"
echo -e "${BLUE}      GCP Recipe Manager & Sandbox Bootstrapper      ${NC}"
echo -e "${BLUE}=====================================================${NC}"

read -p "Enter your Google Cloud Project ID (if empty, we generate a random one): " PROJECT_ID
if [ -z "$PROJECT_ID" ]; then
    RANDOM_STR=$(LC_ALL=C tr -dc 'a-z' </dev/urandom | head -c 6)
    PROJECT_ID="recipe-sandbox-$RANDOM_STR"
    echo -e "Auto-generated Project ID: $PROJECT_ID"
fi

read -p "Enter GCP deployment region [us-central1]: " REGION
REGION=${REGION:-us-central1}

read -p "Enter Database admin password [PgSecurePassw0rdRecipe]: " DB_PASS
DB_PASS=${DB_PASS:-PgSecurePassw0rdRecipe}

# 1.5 Auto-Create Project if it doesn't exist
echo -e "\nChecking if project '$PROJECT_ID' exists..."
if ! gcloud projects describe "$PROJECT_ID" --format="value(projectId)" &>/dev/null; then
    echo -e "\nProject '$PROJECT_ID' not found. Creating it now..."
    if ! gcloud projects create "$PROJECT_ID" --name="$PROJECT_ID"; then
        echo -e "\nError: Failed to create project. Does that name already exist globally? Try a more unique name!"
        exit 1
    fi
    echo -e "\nProject successfully created!"
fi

# 1.6 Manage Billing Account association
echo -e "\nChecking billing status for project '$PROJECT_ID'..."
BILLING_ENABLED=$(gcloud billing projects describe "$PROJECT_ID" --format="value(billingEnabled)" 2>/dev/null || echo "false")
if [ "$BILLING_ENABLED" != "true" ]; then
    echo -e "Billing is not enabled on project '$PROJECT_ID'. Searching for active billing accounts..."
    ACTIVE_BILLING_ACCOUNT=$(gcloud billing accounts list --format="value(name)" --filter="open=true" 2>/dev/null | head -n 1)
    if [ -n "$ACTIVE_BILLING_ACCOUNT" ]; then
        echo -e "Found open billing account: $ACTIVE_BILLING_ACCOUNT. Linking details..."
        if ! gcloud billing projects link "$PROJECT_ID" --billing-account="$ACTIVE_BILLING_ACCOUNT"; then
            echo -e "\nError: Failed to automatically link billing account."
            echo -e "\n⚠️ IMPORTANT: You MUST link a Billing Account before you can use Cloud SQL or Cloud Run."
            echo -e "Go to: https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
            read -p "Press Enter once you have linked a billing account to continue..."
        fi
    else
        echo -e "\n⚠️ IMPORTANT: You MUST link a Billing Account before you can use Cloud SQL or Cloud Run."
        echo -e "Go to: https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
        read -p "Press Enter once you have linked a billing account to continue..."
    fi
else
    echo -e "\nBilling is already enabled for project '$PROJECT_ID'."
fi

# Set current active project context
echo -e "\nSetting active GCP project to: $PROJECT_ID..."
gcloud config set project "$PROJECT_ID" || {
    echo -e "${RED}Failed to set project. Ensure you are logged in using 'gcloud auth login'.${NC}"
    exit 1
}

# 2. Enable necessary GCP APIs
echo -e "\n${YELLOW}Enabling GCP REST APIs (SQLAdmin, Storage, BigQuery, IAM)...${NC}"
gcloud services enable \
    sqladmin.googleapis.com \
    storage.googleapis.com \
    bigquery.googleapis.com \
    run.googleapis.com \
    iam.googleapis.com \
    cloudbuild.googleapis.com

# 3. Create service account and key credentials for local development
SA_NAME="recipe-backend-sa"
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

# Check if Service Account already exists, if not create it
if ! gcloud iam service-accounts describe "$SA_EMAIL" &>/dev/null; then
    echo -e "\n${YELLOW}Creating Service Account: ${SA_NAME}...${NC}"
    gcloud iam service-accounts create "$SA_NAME" \
        --description="Service account for local Recipe Manager backend client" \
        --display-name="Recipe Manager Sandbox SA"
else
    echo -e "\n${GREEN}Service Account ${SA_NAME} already exists. Skipping creation...${NC}"
fi

# Generate credentials key file for CLI/Local running
KEY_PATH="../credentials.json"
echo -e "\n${YELLOW}Generating access key.json credentials for Service Account...${NC}"
gcloud iam service-accounts keys create "$KEY_PATH" \
    --iam-account="$SA_EMAIL" || {
    echo -e "${YELLOW}Warning: Key could not be generated. You might have run out of key limit (10 keys max) or lack permissions.${NC}"
    echo -e "You can continue, but you might need to use Application Default Credentials (ADC) local environment.${NC}"
}

# 4. Generate local configurations files
echo -e "\n${YELLOW}Structuring Terraform parameters (terraform/terraform.tfvars)...${NC}"
cat <<EOT > ../terraform/terraform.tfvars
project_id  = "$PROJECT_ID"
region      = "$REGION"
db_password = "$DB_PASS"
EOT
echo -e "${GREEN}Created: terraform/terraform.tfvars${NC}"

# Generate backend local .env configurations
cat <<EOT > ../backend/.env
PORT=5000
NODE_ENV=development
DB_USER=postgres
DB_PASS=$DB_PASS
DB_NAME=recipedb
DB_HOST=127.0.0.1
DB_PORT=5432
GCP_PROJECT_ID=$PROJECT_ID
GCS_BUCKET_NAME=$PROJECT_ID-recipe-images
BQ_DATASET_NAME=recipe_analytics
GOOGLE_APPLICATION_CREDENTIALS=../credentials.json
EOT
echo -e "${GREEN}Created: backend/.env${NC}"

echo -e "\n${GREEN}=====================================================${NC}"
echo -e "${GREEN}           Environment Initialisation Complete!     ${NC}"
echo -e "${GREEN}=====================================================${NC}"
echo -e "Next steps:"
echo -e "  1. Provision GCP infrastructure using Terraform: "
echo -e "     ${BLUE}cd terraform && terraform init && terraform apply${NC}"
echo -e "  2. Connect to database locally and run seed script."
echo -e "     Read the README.md guide for full details!"
echo -e "====================================================="
