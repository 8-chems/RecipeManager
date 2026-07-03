# 🍳 GCP Recipe Manager & Cloud Sandbox

A **full-stack cloud-native application** demonstrating Google Cloud Platform (GCP) integrations through a practical recipe management system. Built to serve as a hands-on sandbox for testing and learning core GCP services.

![Architecture](architecture_placeholder)

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Google Cloud Platform                        │
│                                                                     │
│   ┌─────────────────┐      ┌────────────────────────────────────┐  │
│   │  Cloud Storage  │      │          Cloud Run                  │  │
│   │  (GCS Bucket)   │◄────►│   ┌─────────────┐  ┌───────────┐  │  │
│   │  Recipe Images  │      │   │  React SPA  │  │ Express   │  │  │
│   └─────────────────┘      │   │  (Frontend) │  │ API       │  │  │
│                             │   └──────┬──────┘  └─────┬─────┘  │  │
│   ┌─────────────────┐      │          │                │         │  │
│   │  Cloud SQL      │      └──────────┼────────────────┼─────────┘  │
│   │  (PostgreSQL)   │◄────────────────┴────────────────┘            │
│   │  Recipes & Ing. │                                                │
│   └─────────────────┘                                                │
│                                                                     │
│   ┌─────────────────┐                                               │
│   │  BigQuery       │◄─── Audit Event Streaming Log                 │
│   │  recipe_events  │     (view, create, delete events)             │
│   └─────────────────┘                                               │
│                                                                     │
│   ┌─────────────────┐                                               │
│   │  Terraform      │──── Infrastructure as Code                    │
│   │  (IaC) config   │     (provisions all resources above)          │
│   └─────────────────┘                                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Repository Structure

```
RecipeManager/
│
├── frontend/                   # React + Vite SPA (Cloud Run / GCS)
│   ├── src/
│   │   ├── App.jsx             # Main app with all views and modals
│   │   └── index.css           # Dark theme design system
│   ├── index.html
│   └── package.json
│
├── backend/                    # Node.js + Express REST API (Cloud Run)
│   ├── server.js               # Express routes and bootstrap logic
│   ├── db.js                   # Cloud SQL (PostgreSQL) queries
│   ├── storage.js              # Google Cloud Storage image uploads
│   ├── bigquery.js             # BigQuery event streaming & analytics
│   ├── Dockerfile              # Multi-stage production container
│   ├── .env.example            # Environment variable template
│   └── package.json
│
├── terraform/                  # GCP Infrastructure as Code
│   ├── provider.tf             # Terraform + GCP provider setup
│   ├── variables.tf            # Input variable definitions
│   ├── gcs.tf                  # Cloud Storage bucket resource
│   ├── sql.tf                  # Cloud SQL PostgreSQL instance
│   ├── bigquery.tf             # BigQuery dataset + table schema
│   ├── iam.tf                  # Service account + role bindings
│   └── outputs.tf              # Provisioned resource outputs
│
├── scripts/
│   ├── setup.sh                # Linux/macOS bootstrap script
│   ├── setup.ps1               # Windows PowerShell bootstrap script
│   └── seed.js                 # Database & GCS seeder
│
├── docker-compose.yml          # Local development stack
├── .gitignore
└── README.md                   # This file
```

---

## 🚀 GCP Services Tested

| Service | Purpose | Terraform Resource |
|---|---|---|
| **Cloud SQL (PostgreSQL 15)** | Relational database storing recipes and ingredients | `google_sql_database_instance` |
| **Cloud Storage (GCS)** | Binary object bucket for storing recipe images | `google_storage_bucket` |
| **BigQuery** | Analytical data warehouse for audit/event streaming | `google_bigquery_dataset` + `google_bigquery_table` |
| **Cloud Run** | Serverless container hosting for Frontend & Backend | (manual deploy via `gcloud`) |
| **IAM** | Service account with least-privilege role bindings | `google_service_account` |

---

## ✅ Prerequisites

Before you begin, ensure you have:

| Tool | Version | Purpose |
|---|---|---|
| [Node.js](https://nodejs.org/) | v20+ | Running frontend and backend locally |
| [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) | Latest | `gcloud` CLI for deployments |
| [Terraform](https://developer.hashicorp.com/terraform/install) | v1.0+ | Provisioning GCP resources |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Latest | Local container orchestration |
| A GCP account | — | With billing enabled ([Free Tier works!](https://cloud.google.com/free)) |

> **💡 Note:** All GCP resources provisioned here are sandbox/free-tier eligible (db-f1-micro, us-central1 region, etc.)

---

## 🔑 Step 1 — Authenticate with Google Cloud

Open your terminal and authenticate your local GCP CLI:

```bash
# 1. Login with your Google account
gcloud auth login

# 2. Set up Application Default Credentials (ADC) for SDK libraries
gcloud auth application-default login

# 3. Create a new GCP project (or use an existing one)
gcloud projects create my-recipe-sandbox --name="Recipe Sandbox"

# 4. Set the project as your default context
gcloud config set project my-recipe-sandbox

# Note: The setup script in Step 2 will automatically detect and link your active billing account.
# If doing manual setup, link it here: https://console.cloud.google.com/billing
```

> **⚠️ Billing Note:** Cloud SQL and Cloud Run are **billable resources**. For pure testing, the db-f1-micro tier costs ~$7/month. Remember to run `terraform destroy` when done to avoid ongoing charges.

---

## ⚙️ Step 2 — Run the Bootstrap Script

This script automatically enables the required APIs, creates a Service Account, and generates your local config files.

**On Windows (PowerShell):**
```powershell
cd scripts
.\setup.ps1
```

**On Linux / macOS (Bash):**
```bash
cd scripts
chmod +x setup.sh
./setup.sh
```

When prompted, enter:
- Your **GCP Project ID** (e.g. `my-recipe-sandbox`)
- Your **region** (default: `us-central1`)
- A **database password** (default provided, change in production)

The script will:
1. ✅ Enable GCP APIs: `sqladmin`, `storage`, `bigquery`, `run`, `iam`, `cloudbuild`
2. ✅ Create a **Service Account** (`recipe-backend-sa`) with the minimum required roles
3. ✅ Generate `credentials.json` (your local auth key)
4. ✅ Create `terraform/terraform.tfvars` with your project values
5. ✅ Create `backend/.env` with your connection strings
6. ✅ Detect and link an active **Billing Account** automatically to the project

---

## 🌍 Step 3 — Provision GCP Infrastructure with Terraform

All cloud resources are declared as code in the `terraform/` folder.

```bash
# Navigate to the Terraform directory
cd terraform

# Initialize providers and download required plugins
terraform init

# Preview exactly what will be created (dry run — safe to run)
terraform plan

# Apply and provision all resources in GCP (~3-5 minutes)
terraform apply
```

Type `yes` when prompted for confirmation.

**Resources that will be created:**

```
+ google_storage_bucket.recipe_bucket          (GCS image store)
+ google_storage_bucket_iam_member.public_rule (public read access)
+ google_sql_database_instance.postgres        (Cloud SQL 15)
+ google_sql_database.recipe_db                (recipedb schema)
+ google_sql_user.db_admin                     (postgres user)
+ google_bigquery_dataset.recipe_dataset       (BQ analytics dataset)
+ google_bigquery_table.recipe_events          (streaming audit table)
+ google_service_account.backend_sa            (auto-imported IAM SA)
+ google_project_iam_member.sa_bindings (x4)   (IAM role bindings)

> **💡 Service Account Note:** Since the setup script pre-creates `recipe-backend-sa` to issue local credentials, Terraform uses a built-in `import` block to safely bring the service account into state without `alreadyExists` conflicts.
```

After apply completes, note the **outputs**:
```
db_connection_name   = "my-project:us-central1:recipe-db-instance"
db_public_ip         = "34.xx.xxx.xx"
gcs_bucket_name      = "my-recipe-sandbox-recipe-images"
bq_dataset_id        = "recipe_analytics"
service_account_email = "recipe-backend-sa@my-project.iam.gserviceaccount.com"
```

---

## 🔀 What to do next after Terraform Apply?

Depending on your target environment:

* **For Manual Cloud Deployment:** Go directly to [**Step 6 — Deploy to Cloud Run (Optional)**](#-step-6--deploy-to-cloud-run-optional) to run your manual builds and CLI deploys.
* **For GitHub CI/CD Automation:** Go to [**CI/CD One-Time Setup (Workload Identity Federation)**](#%EF%B8%8F-cicd-one-time-setup-workload-identity-federation) to initialize WIF and secrets.
* **For Local Integration Testing:** Go to [**Step 4A (Run Locally without Docker)**](#-step-4a--run-locally-without-docker) or [**Step 4B (Run Locally with Docker Compose)**](#-step-4b--run-locally-with-docker-compose).

---

## 💻 Step 4A — Run Locally (Without Docker)

This is the fastest way to develop and test your GCP integrations.

### 4A.1 — Start the Cloud SQL Auth Proxy (optional, for remote DB)

If you want to connect to your real Cloud SQL instance locally without exposing it to the public internet, use the Auth Proxy:

```bash
# Download the proxy binary (from GCP docs)
# Then run (replace INSTANCE_CONNECTION_NAME from terraform output):
cloud-sql-proxy my-project:us-central1:recipe-db-instance &
```

> **Alternative**: For local-only testing, use the **Docker Compose method** (Step 4B) which runs a local PostgreSQL container — no Cloud SQL required.

### 4A.2 — Start the Backend Server

```bash
# Navigate to backend
cd backend

# Install dependencies
npm install

# Verify your .env is populated correctly
cat .env  

# Start the API server in development mode (with auto-reload)
npm run dev
```

The backend will start on **[http://localhost:5000](http://localhost:5000)**.

Test it immediately:
```bash
# Check service health (tests SQL, GCS, and BQ connectivity)
curl http://localhost:5000/api/health | jq .
```

### 4A.3 — Start the Frontend

Open a **new terminal tab** and run:

```bash
cd frontend

# Install dependencies
npm install

# Start the Vite development server with hot-reload
npm run dev
```

The React app will be live at **[http://localhost:5173](http://localhost:5173)**.

---

## 🐳 Step 4B — Run Locally with Docker Compose

Start the entire stack (PostgreSQL + Backend + Frontend) with a single command:

```bash
# From the project root
docker compose up --build
```

> **Note:** The `docker-compose.yml` references `credentials.json` as a Docker Secret. If you don't have this file (running without GCP integration), comment out the `secrets:` sections and the `GOOGLE_APPLICATION_CREDENTIALS` environment variable.

| Service | URL |
|---|---|
| React Frontend | http://localhost:5173 |
| Express API | http://localhost:5000 |
| PostgreSQL | localhost:5432 |

---

## 🌱 Step 5 — Seed Sample Recipe Data

After your backend is running and connected to a database, populate it with sample recipes:

```bash
# Run from the project root
node scripts/seed.js
```

The seeder will:
- 🍕 Insert **3 sample recipes** (Pizza, Pad Thai, Lava Cake) into Cloud SQL
- 📸 Download cover photos and upload them to your **GCS bucket** (if configured)
- 📊 Stream mock view events to **BigQuery** to populate the analytics dashboard

---

## ☁️ Step 6 — Deploy to Cloud Run (Choose Deployment Path)

After running the Terraform apply to provision your core GCP resources, you can choose to deploy the frontend and backend applications to Google Cloud Run using either **Manual CLI Deployment** (faster for testing changes once) or **Automated CI/CD Deployment** (recommended, deploys on push using GitHub Actions).

---

### Option 6A: Manual Command-Line Deployment

This path is best if you want to quickly test your deployment from your local workstation using the `gcloud` developer CLI without configuring GitHub repositories or permissions.

#### 1. Deploy the Backend API
Build and deploy the backend container directly to Google Cloud Run using Cloud Build to build the container from source:
```bash
# Navigate to the backend directory
cd backend

# Deploy to Cloud Run (replace project details and database paths with your Terraform outputs)
gcloud run deploy recipe-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "GCP_PROJECT_ID=YOUR_PROJECT_ID,GCS_BUCKET_NAME=YOUR_BUCKET,BQ_DATASET_NAME=recipe_analytics,DB_HOST=/cloudsql/YOUR_INSTANCE_CONNECTION_NAME,DB_USER=postgres,DB_PASS=YOUR_DB_PASS,DB_NAME=recipedb" \
  --add-cloudsql-instances YOUR_INSTANCE_CONNECTION_NAME \
  --service-account recipe-backend-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

#### 2. Deploy the Frontend Website
Generate the client-side production dist assets and host them:
```bash
# Navigate to the frontend directory
cd ../frontend

# Build the production bundle
npm install
npm run build

# Host Option: Deploy and host static assets via Google Cloud Storage (GCS)
gsutil -m rsync -r dist/ gs://YOUR_BUCKET_NAME/frontend/
```
*Remember to update the `API_BASE` URL key in your local code to point to your live Cloud Run URL beforehand if deploying static pages.*

---

### Option 6B: Automated GitHub Actions CI/CD (Workload Identity Federation)

This path registers a secure trust relation between GitHub and Google Cloud using **Workload Identity Federation (WIF)**. GitHub Actions will authenticate using short-lived tokens instead of static Service Account JSON keys.

> [!IMPORTANT]
> Because the application container mounts to Cloud SQL on container boot-up, you **MUST** run Terraform apply before initiating your first GitHub push. (This ensures standard GCP database clusters exist first, preventing container start crash loops).

#### 1. Run the CI/CD Bootstrap Script (Locally)
Run the script once to enable target OIDC/credential APIs, build the Artifact Registry Docker repository, and generate the Google Cloud workload identity pool and provider bindings:

* **On Windows (PowerShell):**
  ```powershell
  cd scripts
  .\setup_cicd.ps1
  ```
* **On Linux / macOS (Bash):**
  ```bash
  cd scripts
  chmod +x setup_cicd.sh
  ./setup_cicd.sh
  ```
*When prompted, type your **GCP Project ID** and your **GitHub repository** path in the format `owner/repo` (e.g. `octocat/recipe-manager`).*

#### 2. Save Target Secrets to GitHub
The script outputs a list of secret keys. Access your GitHub repository settings under `Settings` ➔ `Secrets and variables` ➔ `Actions`, and register these values:

| Secret Name | Description | Where to get it |
|---|---|---|
| `GCP_PROJECT_ID` | Your GCP Project ID | `gcloud config get-value project` |
| `GCP_REGION` | Deployment region | e.g. `us-central1` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full WIF provider resource name | Output of `setup_cicd.ps1` |
| `GCP_SERVICE_ACCOUNT_EMAIL` | SA email used for deployments | Output of `setup_cicd.ps1` |
| `GCS_BUCKET_NAME` | GCS bucket name | Terraform output `gcs_bucket_name` |
| `BQ_DATASET_NAME` | BigQuery dataset | `recipe_analytics` |
| `DB_USER` | Database username | `postgres` |
| `DB_NAME` | Database name | `recipedb` |
| `DB_PASS` | Database password | Your chosen database password |
| `CLOUD_SQL_CONNECTION_NAME` | Cloud SQL connection string | Terraform output `db_connection_name` |

#### 3. Trigger the First Automated Build (Deploy Backend)
Commit and push your main branch:
```bash
git add .
git commit -m "feat: setup automation pipelines"
git push origin main
```
This triggers the `.github/workflows/backend-deploy.yml` action to construct and deploy your service.

#### 4. Link the Frontend to the Deployed Backend
1. Once the backend action deployment finishes, copy the output Cloud Run server URL (or check via command line: `gcloud run services describe recipe-backend --region us-central1 --format="value(status.url)"`).
2. Add this URL as your 11th GitHub secret named **`BACKEND_URL`**.
3. Rerun the **Deploy Frontend** action (or commit another push) to compile the frontend dist assets pointing to your live backend.

---

## 🔌 API Reference

The backend exposes the following RESTful endpoints:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Diagnostic check — tests SQL, GCS, BigQuery |
| `GET` | `/api/recipes` | List all recipes with ingredients |
| `GET` | `/api/recipes/:id` | Get single recipe (also fires BQ view event) |
| `POST` | `/api/recipes` | Create recipe + upload image to GCS |
| `DELETE` | `/api/recipes/:id` | Delete recipe (fires BQ delete event) |
| `GET` | `/api/analytics/top-viewed` | BigQuery: top viewed recipes |
| `GET` | `/api/analytics/events-breakdown` | BigQuery: all event type counts |

### POST /api/recipes — Payload

Uses `multipart/form-data` (supports image file upload):

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | ✅ | Recipe name |
| `description` | string | ❌ | Short description |
| `instructions` | string | ✅ | Full cooking steps |
| `prep_time` | number | ❌ | Prep time in minutes |
| `cook_time` | number | ❌ | Cook time in minutes |
| `servings` | number | ❌ | Number of servings |
| `ingredientsJson` | JSON string | ❌ | `[{"name":"...","amount":"...","unit":"..."}]` |
| `image` | File | ❌ | Image file — uploaded to GCS |

---

## 🗄️ Database Schema

**`recipes` table (Cloud SQL)**
```sql
CREATE TABLE recipes (
  id           SERIAL PRIMARY KEY,
  title        VARCHAR(255) NOT NULL,
  description  TEXT,
  instructions TEXT NOT NULL,
  prep_time    INT DEFAULT 0,
  cook_time    INT DEFAULT 0,
  servings     INT DEFAULT 1,
  image_url    TEXT,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**`recipe_ingredients` table**
```sql
CREATE TABLE recipe_ingredients (
  id         SERIAL PRIMARY KEY,
  recipe_id  INT REFERENCES recipes(id) ON DELETE CASCADE,
  name       VARCHAR(255) NOT NULL,
  amount     VARCHAR(100),
  unit       VARCHAR(50)
);
```

**BigQuery `recipe_events` table**
```
event_type    STRING  REQUIRED  (view | create | delete)
recipe_id     INTEGER NULLABLE
recipe_title  STRING  NULLABLE
timestamp     TIMESTAMP REQUIRED
details       STRING  NULLABLE  (JSON serialized context)
```

---

## 📊 Frontend Features

The React SPA has three views accessible from the sidebar:

### 🧾 Recipe Manager
- View all recipes from Cloud SQL in a responsive card grid
- Real-time ingredient-aware search filtering
- Open recipe detail modal (triggers a BigQuery view event)
- Upload new recipe with drag-and-drop image to GCS bucket
- Delete recipes with GCP audit logging to BigQuery

### 📈 GCP Monitor
- Live service health status for Cloud SQL, GCS, and BigQuery
- BigQuery bar chart of **Top 5 Viewed Recipes**
- BigQuery event distribution table for `view`, `create`, `delete`

### 📖 Setup Guide
- In-app walkthrough of commands for Terraform, local dev, and seeding

---

## 🧹 Teardown / Clean Up

When you're done testing, destroy all GCP resources to avoid charges:

```bash
cd terraform
terraform destroy
```

Type `yes` to confirm. Terraform will delete:
- Cloud SQL instance
- GCS bucket (including all images, since `force_destroy = true`)
- BigQuery dataset and table
- Service Account

---

## 💡 Common Issues & Troubleshooting

### Backend cannot connect to Cloud SQL

> **Reason:** Cloud SQL blocks all public IPs by default for security.

**Solution A (recommended):** Use the Cloud SQL Auth Proxy for local development:
```bash
cloud-sql-proxy PROJECT:REGION:INSTANCE
```

**Solution B (testing only):** Add your IP to authorized networks in `sql.tf`:
```hcl
authorized_networks {
  value = "YOUR.PUBLIC.IP.ADDRESS/32"
}
```

---

### GCS upload fails with permissions error

> **Reason:** Missing IAM role on the service account.

**Solution:** Ensure the SA has `roles/storage.objectUser` on the bucket. This is done automatically via `terraform/iam.tf`. Re-run `terraform apply` if needed.

---

### BigQuery INSERT fails with `not found: dataset`

> **Reason:** BigQuery dataset region mismatch or dataset was deleted.

**Solution:** The backend auto-creates the dataset on startup. Check the Node.js console logs. Ensure `GCP_PROJECT_ID` is set correctly in `.env`.

---

### `terraform apply` fails with `API not enabled`

> **Solution:** Run the bootstrap script first, or enable APIs manually:
> ```bash
> gcloud services enable sqladmin.googleapis.com storage.googleapis.com bigquery.googleapis.com
> ```

---

## 🔐 Security Notes

- **Never commit** your `credentials.json` or `.env` files — they are in `.gitignore`.
- The `db.user` password is stored in `terraform.tfvars` — keep this file local and out of git.
- In production, store secrets in **Google Secret Manager** and reference them from Cloud Run via `--set-secrets`.
- The GCS bucket is set to public read access for object URLs to work in `<img>` tags. For private images, generate signed URLs instead.

---

## 🏷️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, Vanilla CSS |
| Backend | Node.js 20, Express 4, Multer |
| Database | PostgreSQL 15 on Cloud SQL |
| Object Storage | Google Cloud Storage |
| Analytics | Google BigQuery |
| Infrastructure | Terraform 1.x (hashicorp/google ~5.0) |
| Containerization | Docker, Docker Compose |
| Deployment | GCP Cloud Run (serverless) |
| CI/CD | GitHub Actions (Workload Identity Federation) |
