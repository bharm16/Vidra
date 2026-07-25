#!/usr/bin/env bash
set -euo pipefail

# check-regression-test-quality.sh
#
# Audits *.regression.test.* files for the anti-pattern that makes
# regression tests ineffective: vi.mock() of internal modules. A regression
# test that mocks its subject's collaborators pins wiring, not behavior —
# it stays green while the product breaks.
#
# Scope of the ban (server-side tests):
#   Only process-external boundaries may be mocked. Everything else runs
#   for real; if a test cannot run its collaborators for real, it sits at
#   the wrong seam — move it up one layer (route-level, or the replay
#   suite). See docs/architecture/BUGFIX_PROTOCOL.md.
#
# Client-side exemption (client/src/** and *.tsx files):
#   For jsdom component/hook tests the network seam IS the feature's api
#   module, and isolating a component from heavy children/contexts is
#   standard practice — so the internal-mock ban does not apply there.
#   The client's regression realism comes from asserting rendered outcomes,
#   not from unmocked collaborators.
#
# External boundaries that ARE acceptable to mock (server-side):
#   - firebase, @firebase/*, @/config/firebase
#   - openai, @google/generative-ai, groq-sdk (LLM providers)
#   - stripe, redis, ioredis
#   - node:* builtins (fs, http — filesystem/network)
#   - pino / @infrastructure/Logger (observability boundary; often the
#     assertion channel for "logged and skipped" invariants)
#   - uuid (external package; mocked for determinism)
#   - @utils/sleep (time boundary; stubbing it = fake timers)
#   - lucide-react (icon assets in jsdom)
#
# Usage:
#   check-regression-test-quality.sh              scan the whole repo
#   check-regression-test-quality.sh FILE...      scan only FILE... (used by
#                                                 the pre-commit hook on the
#                                                 staged set)
#
# Run: npm run test:regression:quality
# CI:  Part of test.yml regression-quality job

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Allowed mock patterns (external boundaries only)
ALLOWED_MOCKS=(
  'firebase'
  '@firebase/'
  '@/config/firebase'
  'openai'
  '@google/generative-ai'
  'groq-sdk'
  'stripe'
  'redis'
  'ioredis'
  'node:'
  'pino'
  'lucide-react'
  'uuid'
  '@infrastructure/Logger'
  '@utils/sleep'
)

if [ "$#" -gt 0 ]; then
  # Scoped mode: scan only the given files (non-regression args are skipped).
  FILES="$(printf '%s\n' "$@" | grep -E '\.regression\.test\.' || true)"
else
  FILES="$(find "$ROOT" -name '*.regression.test.*' -not -path '*/node_modules/*' | sort)"
fi

if [ -z "$FILES" ]; then
  echo "No regression test files to scan."
  exit 0
fi

VIOLATIONS=0
TOTAL=0
EXEMPT=0

echo "=== Regression Test Quality Check ==="
echo ""

while IFS= read -r FILE; do
  [ -f "$FILE" ] || FILE="$ROOT/$FILE"
  [ -f "$FILE" ] || continue

  REL="${FILE#"$ROOT/"}"

  # Client-side exemption: the api module is the client's wire boundary.
  case "$REL" in
    client/src/* | *.tsx)
      EXEMPT=$((EXEMPT + 1))
      continue
      ;;
  esac

  TOTAL=$((TOTAL + 1))

  # Extract all vi.mock() targets from the file
  MOCKS=$(grep -oE "vi\.mock\(['\"][^'\"]+['\"]" "$FILE" 2>/dev/null | sed "s/vi\.mock(['\"]//;s/['\"]$//" || true)

  if [ -z "$MOCKS" ]; then
    continue
  fi

  FILE_HAS_VIOLATION=0

  while IFS= read -r MOCK_TARGET; do
    IS_ALLOWED=0

    for PATTERN in "${ALLOWED_MOCKS[@]}"; do
      if echo "$MOCK_TARGET" | grep -q "$PATTERN"; then
        IS_ALLOWED=1
        break
      fi
    done

    if [ "$IS_ALLOWED" -eq 0 ]; then
      if [ "$FILE_HAS_VIOLATION" -eq 0 ]; then
        echo "❌ $REL"
        FILE_HAS_VIOLATION=1
      fi
      echo "   vi.mock('$MOCK_TARGET') — mocks an internal service"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  done <<< "$MOCKS"

  if [ "$FILE_HAS_VIOLATION" -eq 1 ]; then
    echo ""
  fi
done <<< "$FILES"

echo "---"
echo "Scanned $TOTAL server-side regression test file(s); $EXEMPT client-side file(s) exempt."

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "⚠️  Found $VIOLATIONS internal mock(s) in regression tests."
  echo ""
  echo "Server-side regression tests must mock only external boundaries:"
  echo "  ✓ LLM APIs (openai, groq-sdk, @google/generative-ai)"
  echo "  ✓ Firebase (firebase, @firebase/*, @/config/firebase)"
  echo "  ✓ Stripe, Redis, filesystem, network (node:*)"
  echo "  ✓ Logging (@infrastructure/Logger, pino), time (@utils/sleep), uuid"
  echo ""
  echo "Internal modules should NOT be mocked in regression tests."
  echo "If you need to mock an internal module, the test sits at the wrong"
  echo "seam — move it up one layer (HTTP route, or the replay suite)."
  echo ""
  echo "See: docs/architecture/BUGFIX_PROTOCOL.md"
  echo ""
  echo "To add an allowed external mock pattern, edit:"
  echo "  scripts/check-regression-test-quality.sh (ALLOWED_MOCKS array)"
  exit 1
fi

echo "✅ All server-side regression tests mock only external boundaries."
exit 0
