#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

MODEL_DIR="${SPAN_LABELING_MODEL_DIR:-${ROOT_DIR}/server/src/llm/span-labeling/nlp/models}"
MODEL_FILE="${MODEL_DIR}/model.onnx"
MODEL_SOURCE_URI="${SPAN_LABELING_MODELS_GCS_URI:-}"

if [[ -f "${MODEL_FILE}" ]]; then
  echo "Span-labeling models already present at ${MODEL_DIR}; skipping download."
  exit 0
fi

if [[ -z "${MODEL_SOURCE_URI}" ]]; then
  echo "Warning: SPAN_LABELING_MODELS_GCS_URI is not set and no local model assets were found."
  echo "Skipping model download. The resulting image will be missing span-labeling"
  echo "models; any runtime code path requiring them will fail with a clear error."
  echo ""
  echo "For production builds, set SPAN_LABELING_MODELS_GCS_URI as a build-arg or env"
  echo "(for example: gs://your-bucket/span-labeling/models/) and rerun:"
  echo "  npm run download-models"
  echo ""
  echo "For CI/dev/PR builds where models aren't required, this skip is intentional"
  echo "and lets the build proceed."
  exit 0
fi

if [[ "${MODEL_SOURCE_URI}" != gs://* ]]; then
  echo "SPAN_LABELING_MODELS_GCS_URI must be a gs:// URI. Received: ${MODEL_SOURCE_URI}"
  exit 1
fi

mkdir -p "$(dirname "${MODEL_DIR}")"
TMP_DIR="$(mktemp -d "${MODEL_DIR%/}.tmp.XXXXXX")"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

parse_bucket_name() {
  local uri="$1"
  local without_scheme
  without_scheme="${uri#gs://}"
  echo "${without_scheme%%/*}"
}

download_with_gsutil() {
  echo "Downloading span-labeling models via gsutil from ${MODEL_SOURCE_URI} ..."
  gsutil -m cp -r "${MODEL_SOURCE_URI%/}/." "${TMP_DIR}/"
}

download_with_gcloud() {
  echo "Downloading span-labeling models via gcloud from ${MODEL_SOURCE_URI} ..."
  gcloud storage cp --recursive "${MODEL_SOURCE_URI%/}/." "${TMP_DIR}/"
}

download_with_node_sdk() {
  echo "Downloading span-labeling models via @google-cloud/storage from ${MODEL_SOURCE_URI} ..."

  MODEL_SOURCE_URI="${MODEL_SOURCE_URI}" DEST_DIR="${TMP_DIR}" MODEL_SCRIPT_DIR="${SCRIPT_DIR}" node --import tsx --input-type=module <<'NODE'
import { Storage } from '@google-cloud/storage';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sourceUri = process.env.MODEL_SOURCE_URI;
const destinationDir = process.env.DEST_DIR;
const scriptDirectory = process.env.MODEL_SCRIPT_DIR;

if (!sourceUri || !destinationDir || !scriptDirectory) {
  throw new Error('MODEL_SOURCE_URI, DEST_DIR and MODEL_SCRIPT_DIR are required');
}
const { modelDownloadPath } = await import(pathToFileURL(path.join(scriptDirectory, 'lib/modelDownloadPath.ts')).href);

const match = /^gs:\/\/([^/]+)\/?(.*)$/.exec(sourceUri);
if (!match) {
  throw new Error(`Invalid gs:// URI: ${sourceUri}`);
}

const bucketName = match[1];
let prefix = (match[2] || '').replace(/^\/+|\/+$/g, '');
if (prefix.length > 0) {
  prefix = `${prefix}/`;
}

const storage = new Storage();
const bucket = storage.bucket(bucketName);
const [files] = await bucket.getFiles({ prefix });

const objects = files.filter((file) => file.name !== prefix && !file.name.endsWith('/'));
if (objects.length === 0) {
  throw new Error(`No model files found at ${sourceUri}`);
}
// Validate the complete list before creating directories or downloading bytes.
const targets = objects.map(file => ({ file, destination: modelDownloadPath(destinationDir, file.name, prefix) }));

const concurrency = 4;
let index = 0;

const worker = async () => {
  while (true) {
    const current = index;
    index += 1;
    if (current >= targets.length) break;

    const { file, destination: destinationPath } = targets[current];

    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await file.download({ destination: destinationPath });
  }
};

await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log(`Downloaded ${objects.length} object(s) from ${sourceUri}`);
NODE
}

mkdir -p "${MODEL_DIR}"

if command -v gsutil >/dev/null 2>&1; then
  download_with_gsutil
elif command -v gcloud >/dev/null 2>&1; then
  if gcloud storage ls "gs://$(parse_bucket_name "${MODEL_SOURCE_URI}")" >/dev/null 2>&1; then
    download_with_gcloud
  else
    download_with_node_sdk
  fi
else
  download_with_node_sdk
fi

if [[ -z "$(find "${TMP_DIR}" -type f -print -quit)" ]]; then
  echo "Download completed but no files were fetched from ${MODEL_SOURCE_URI}."
  exit 1
fi

rm -rf "${MODEL_DIR}"
mkdir -p "${MODEL_DIR}"
cp -R "${TMP_DIR}/." "${MODEL_DIR}/"

if [[ ! -f "${MODEL_FILE}" ]]; then
  echo "Downloaded assets, but required file is missing: ${MODEL_FILE}"
  exit 1
fi

echo "Span-labeling models downloaded to ${MODEL_DIR}"
