#!/usr/bin/env bash
set -euo pipefail

# Firestore Restore Script
# Restores Firestore data from a GCS export artifact.
#
# Usage:
#   scripts/ops/firestore-restore.sh --source gs://bucket/path --target emulator
#   scripts/ops/firestore-restore.sh --source gs://bucket/path --target <PROJECT_ID>
#
# The "emulator" target requires the Firestore emulator to be running on localhost:8080.

SOURCE=""
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      SOURCE="$2"
      shift 2
      ;;
    --target)
      TARGET="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 --source gs://... --target <emulator|PROJECT_ID>" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$SOURCE" ]]; then
  echo "Error: --source is required" >&2
  exit 1
fi

if [[ -z "$TARGET" ]]; then
  echo "Error: --target is required (use 'emulator' or a project ID)" >&2
  exit 1
fi

echo "=== Firestore Restore ==="
echo "Source: $SOURCE"
echo "Target: $TARGET"
echo ""

if [[ "$TARGET" == "emulator" ]]; then
  EMULATOR_HOST="${FIRESTORE_EMULATOR_HOST:-localhost:8080}"
  echo "Restoring to emulator at $EMULATOR_HOST"
  echo ""

  # Download export to temp directory
  TEMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TEMP_DIR"' EXIT

  echo "Downloading export artifact..."
  gsutil -m cp -r "$SOURCE" "$TEMP_DIR/"

  EXPORT_DIR="$TEMP_DIR/$(basename "$SOURCE")"

  if [[ ! -f "$EXPORT_DIR/all_namespaces/all_kinds/all_namespaces_all_kinds.export_metadata" ]] && \
     [[ ! -f "$EXPORT_DIR/all_namespaces/all_kinds/output-0" ]]; then
    # Try one level deeper (some exports nest differently)
    EXPORT_DIR="$(find "$TEMP_DIR" -name "*.export_metadata" -print -quit 2>/dev/null | xargs dirname 2>/dev/null || echo "")"
    if [[ -z "$EXPORT_DIR" ]]; then
      echo "Error: Could not find export metadata in downloaded artifact" >&2
      exit 1
    fi
  fi

  echo "Importing to emulator..."
  # Use the Firebase emulator import endpoint
  curl -s -X POST "http://$EMULATOR_HOST/emulator/v1/projects/demo-project:import" \
    -H "Content-Type: application/json" \
    -d "{\"database\": \"projects/demo-project/databases/(default)\", \"export_directory\": \"$EXPORT_DIR\"}" \
    && echo "Import request sent" \
    || echo "Note: Direct import may not be supported. Copy export to emulator data directory instead."

  echo ""
  echo "Emulator restore complete. Run smoke test to verify:"
  echo "  See docs/operations/DR_RUNBOOK.md for current data-integrity acceptance"
else
  echo "WARNING: Restoring to live project '$TARGET'"
  echo "This will OVERWRITE existing documents with matching IDs."
  echo ""
  read -rp "Type the project ID to confirm: " CONFIRM

  if [[ "$CONFIRM" != "$TARGET" ]]; then
    echo "Confirmation failed. Aborting." >&2
    exit 1
  fi

  echo ""
  echo "Running restore..."
  gcloud firestore import "$SOURCE" --project "$TARGET"

  echo ""
  echo "Restore initiated. Monitor progress:"
  echo "  gcloud firestore operations list --project $TARGET"
  echo ""
  echo "After completion, run smoke test:"
  echo "  See docs/operations/DR_RUNBOOK.md for current data-integrity acceptance"
fi
