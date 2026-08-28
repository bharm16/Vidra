#!/bin/bash
set -euo pipefail

PROJECT_ID="${1:?usage: setup-gcs.sh <gcp-project-id> [environment]}"
ENVIRONMENT="${2:-dev}"
BUCKET_NAME="vidra-media-${ENVIRONMENT}"
SERVICE_ACCOUNT="vidra-storage-${ENVIRONMENT}"

# 1. Create bucket
gcloud storage buckets create "gs://${BUCKET_NAME}" \
  --project="${PROJECT_ID}" \
  --location="US" \
  --default-storage-class="STANDARD" \
  --uniform-bucket-level-access \
  --public-access-prevention

# 2. Enable Autoclass
gcloud storage buckets update "gs://${BUCKET_NAME}" \
  --enable-autoclass

# 3. Set CORS — browsers load signed GCS URLs directly (GET) and upload
#    studio reference images via signed PUT (S-12 attach flow).
#    config/gcs-cors.json is the single committed record of the bucket
#    policy; this used to be an inline heredoc that had already drifted
#    ahead of a stale copy of that file.
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
gcloud storage buckets update "gs://${BUCKET_NAME}" --cors-file="${REPO_ROOT}/config/gcs-cors.json"

# 4. Set lifecycle rules
cat > lifecycle.json << EOF_LIFECYCLE
{
  "rule": [
    {
      "action": {"type": "Delete"},
      "condition": {"age": 7, "matchesPrefix": ["users/"], "matchesSuffix": ["/previews/images/"]}
    },
    {
      "action": {"type": "Delete"},
      "condition": {"age": 14, "matchesPrefix": ["users/"], "matchesSuffix": ["/previews/videos/"]}
    },
    {
      "action": {"type": "Delete"},
      "condition": {"age": 30, "matchesPrefix": ["users/"], "matchesSuffix": ["/generations/"]}
    }
  ]
}
EOF_LIFECYCLE

gcloud storage buckets update "gs://${BUCKET_NAME}" --lifecycle-file=lifecycle.json
rm lifecycle.json

# 5. Create service account
gcloud iam service-accounts create "${SERVICE_ACCOUNT}" \
  --display-name="Vidra Storage Service Account" \
  --project="${PROJECT_ID}"

# 6. Grant permissions
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET_NAME}" \
  --member="serviceAccount:${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# 7. Create key for local development
gcloud iam service-accounts keys create ./gcs-service-account.json \
  --iam-account="${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Setup complete!"
echo "Set GOOGLE_APPLICATION_CREDENTIALS=./gcs-service-account.json"
echo "Set GCS_BUCKET_NAME=${BUCKET_NAME}"
