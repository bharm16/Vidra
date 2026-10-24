#!/usr/bin/env bash
set -euo pipefail

# Firestore Restore Script
# Restores Firestore data from a GCS export artifact.
#
# Usage:
#   scripts/ops/firestore-restore.sh --source gs://bucket/path --target emulator
#   scripts/ops/firestore-restore.sh --source gs://bucket/path --target <PROJECT_ID>
#
# Emulator restores start a fresh, temporary Firestore instance using Firebase CLI --import.
# Pass --project demo-<name> --expect <acceptance.json>; an occupied port fails closed.

SOURCE=""
TARGET=""
EMULATOR_PROJECT=""
EXPECTATIONS=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

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
    --project)
      EMULATOR_PROJECT="$2"
      shift 2
      ;;
    --expect)
      EXPECTATIONS="$2"
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
  if [[ -z "$EMULATOR_PROJECT" || -z "$EXPECTATIONS" ]]; then
    echo "Emulator restore requires --project demo-<name> and --expect <acceptance.json>" >&2
    exit 1
  fi
  TEMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TEMP_DIR"' EXIT
  export VIDRA_RESTORE_PROJECT="$EMULATOR_PROJECT"
  export VIDRA_RESTORE_EXPECTATIONS="$(cd "$(dirname "$EXPECTATIONS")" && pwd)/$(basename "$EXPECTATIONS")"
  export VIDRA_RESTORE_HOST="${FIRESTORE_EMULATOR_HOST:-127.0.0.1:8080}"
  export VIDRA_RESTORE_CONFIG="$TEMP_DIR/firebase.json"
  export VIDRA_RESTORE_PROOF="$TEMP_DIR/verified.json"
  export VIDRA_RESTORE_TOKEN="$(basename "$TEMP_DIR")"
  export VIDRA_RESTORE_VERIFIER="$SCRIPT_DIR/firestore-restore-verify.ts"
  export VIDRA_RESTORE_TSX="$REPO_DIR/node_modules/.bin/tsx"
  "$VIDRA_RESTORE_TSX" "$VIDRA_RESTORE_VERIFIER" --validate

  [[ "$SOURCE" == gs://* ]] || { echo "Source must be a GCS export URI" >&2; exit 1; }
  echo "Downloading export artifact..."
  mkdir "$TEMP_DIR/export"
  gsutil -m cp -r "$SOURCE" "$TEMP_DIR/export/"
  IMPORTS=()
  while IFS= read -r metadata; do IMPORTS+=("$(dirname "$metadata")"); done < <(find "$TEMP_DIR/export" -name firebase-export-metadata.json -type f)
  if [[ ${#IMPORTS[@]} -eq 0 ]]; then
    while IFS= read -r metadata; do IMPORTS+=("$(dirname "$metadata")"); done < <(find "$TEMP_DIR/export" -name '*.overall_export_metadata' -type f)
  fi
  [[ ${#IMPORTS[@]} -eq 1 ]] || { echo "Expected one Firebase or managed Firestore export root" >&2; exit 1; }
  echo "Importing into a fresh emulator for $EMULATOR_PROJECT; acceptance is still pending."
  firebase emulators:exec --only firestore --project "$EMULATOR_PROJECT" --config "$VIDRA_RESTORE_CONFIG" --import "${IMPORTS[0]}" '
    "$VIDRA_RESTORE_TSX" "$VIDRA_RESTORE_VERIFIER"
  '
  "$VIDRA_RESTORE_TSX" "$VIDRA_RESTORE_VERIFIER" --proof

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
