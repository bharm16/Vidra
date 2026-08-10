#!/usr/bin/env bash
set -euo pipefail

# List all regression test files in the codebase.
# Used for auditing: every file should test an invariant, not a specific fix.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== Regression Test Audit ==="
echo ""

# .claude/worktrees holds other agents' checkouts of this repo. Their tests are
# not this working tree's to audit — the same exclusion the sibling
# check-regression-test-quality.sh already makes. Anchored to $ROOT so that a
# run from inside a worktree still audits that tree instead of pruning it away.
FILES=$(find "$ROOT" \
  \( -path '*/node_modules' -o -path "$ROOT/.claude/worktrees" \) -prune -o \
  -name '*.regression.test.*' -print | sort)

if [ -z "$FILES" ]; then
  echo "No regression tests found (*.regression.test.*)."
  exit 0
fi

COUNT=$(echo "$FILES" | wc -l | tr -d ' ')
echo "Found $COUNT regression test file(s):"
echo ""

for FILE in $FILES; do
  REL="${FILE#"$ROOT/"}"
  # Extract describe block names for context
  DESCRIBES=$(grep -oE "describe\(['\"].*?['\"]" "$FILE" 2>/dev/null | head -3 | sed "s/describe(['\"]//;s/['\"]$//" || true)
  echo "  $REL"
  if [ -n "$DESCRIBES" ]; then
    echo "$DESCRIBES" | while IFS= read -r DESC; do
      echo "    → $DESC"
    done
  fi
  echo ""
done

echo "---"
echo "Each regression test should:"
echo "  1. Name the invariant it protects in the describe block"
echo "  2. Use property-based testing (fast-check) where applicable"
echo "  3. Mock only external boundaries, not peer services"
