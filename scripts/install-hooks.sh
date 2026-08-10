#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
HOOKS_SRC="${SCRIPT_DIR}/hooks"
HOOKS_DST="${ROOT_DIR}/.git/hooks"

for HOOK in pre-commit; do
  SRC="${HOOKS_SRC}/${HOOK}"
  DST="${HOOKS_DST}/${HOOK}"

  if [ ! -f "${SRC}" ]; then
    echo "Warning: ${SRC} not found, skipping"
    continue
  fi

  cp "${SRC}" "${DST}"
  chmod +x "${DST}"
  echo "${HOOK} hook installed at ${DST}"
done

# Remove the obsolete project-managed commit-msg hook without touching a custom
# hook the developer may have installed independently.
LEGACY_COMMIT_MSG="${HOOKS_DST}/commit-msg"
LEGACY_MARKER='scripts/hooks/check-bugfix-test.sh'
if [ -f "${LEGACY_COMMIT_MSG}" ] && grep -Fq "${LEGACY_MARKER}" "${LEGACY_COMMIT_MSG}"; then
  rm "${LEGACY_COMMIT_MSG}"
  echo "Removed obsolete project-managed commit-msg hook at ${LEGACY_COMMIT_MSG}"
fi
