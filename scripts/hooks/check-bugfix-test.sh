#!/usr/bin/env bash
set -euo pipefail

# check-bugfix-test.sh
#
# Enforces the bugfix protocol on fix commits:
#
#   1. A commit whose subject starts with fix: or fix( must add at least one
#      new test block (it()/test()) in a *.regression.test.* file — not just
#      any test file. The regression naming is what the audit tooling
#      (test:regression, test:regression:list) keys on.
#   2. Every staged/changed regression test file must pass the mock-boundary
#      quality check (scripts/check-regression-test-quality.sh): server-side
#      regression tests mock only process-external boundaries.
#
# Waivers:
#   - A line starting with "No-Seam:" in the commit message body declares
#     that no correct test seam exists for this fix (and why). The commit is
#     allowed through, and the declaration is preserved in history. Use it
#     honestly: an absent seam is an architecture finding, not a free pass.
#   - SKIP_BUGFIX_TEST_CHECK=1 skips everything (non-code fixes: docs, config).
#
# Used by: commit-msg hook (passes the message file as $1), CI pipeline.

if [ "${SKIP_BUGFIX_TEST_CHECK:-0}" = "1" ]; then
  echo "   Bugfix test check skipped (SKIP_BUGFIX_TEST_CHECK=1)"
  exit 0
fi

# Resolve the full commit message: hook argument, then COMMIT_EDITMSG
# (pre-commit context), then HEAD (CI context).
GIT_DIR="$(git rev-parse --git-dir)"
if [ "${1:-}" != "" ] && [ -f "${1:-}" ]; then
  FULL_MSG="$(cat "$1")"
elif [ -f "${GIT_DIR}/COMMIT_EDITMSG" ]; then
  FULL_MSG="$(cat "${GIT_DIR}/COMMIT_EDITMSG")"
else
  FULL_MSG="$(git log -1 --format=%B HEAD 2>/dev/null || echo '')"
fi
SUBJECT="$(printf '%s\n' "$FULL_MSG" | head -1)"

# Pick the diff source once: staged changes (pre-commit) or HEAD (CI).
staged_diff() {
  if git diff --cached --name-only 2>/dev/null | grep -q .; then
    git diff --cached "$@" 2>/dev/null || true
  else
    git diff "HEAD~1..HEAD" "$@" 2>/dev/null || true
  fi
}

changed_files() {
  if git diff --cached --name-only 2>/dev/null | grep -q .; then
    git diff --cached --name-only --diff-filter=ACMR -- "$@" 2>/dev/null || true
  else
    git diff "HEAD~1..HEAD" --name-only --diff-filter=ACMR -- "$@" 2>/dev/null || true
  fi
}

# --- Gate 2 runs on every commit that touches regression tests -------------
CHANGED_REGRESSION="$(changed_files '*.regression.test.*')"
if [ -n "$CHANGED_REGRESSION" ]; then
  echo "   Checking mock boundaries in changed regression tests..."
  # shellcheck disable=SC2086 # repo paths contain no spaces
  if ! bash "$(git rev-parse --show-toplevel)/scripts/check-regression-test-quality.sh" $CHANGED_REGRESSION; then
    echo ""
    echo "   ✗ REJECTED: a changed regression test mocks internal modules."
    exit 1
  fi
fi

# --- Gate 1 applies only to fix commits -------------------------------------
if ! printf '%s\n' "$SUBJECT" | grep -qiE '^fix[:(]'; then
  exit 0
fi

echo "   Fix commit detected: checking for regression test..."

if printf '%s\n' "$FULL_MSG" | grep -qiE '^no-seam:[[:space:]]*[^[:space:]]'; then
  echo "   ✓ No-Seam waiver declared in commit body (no correct test seam);"
  echo "     the missing seam is an architecture finding — track it."
  exit 0
fi

DIFF_OUTPUT="$(staged_diff --unified=0 -- '*.regression.test.*')"

if printf '%s\n' "$DIFF_OUTPUT" | grep -qE '^\+.*(it\(|test\()'; then
  echo "   ✓ Regression test found in fix commit"
  exit 0
fi

echo ""
echo "   ✗ REJECTED: Fix commit must include a regression test."
echo ""
echo "   Your commit message starts with 'fix:' or 'fix(' but the staged"
echo "   changes contain no new test blocks (it() or test()) in a"
echo "   *.regression.test.* file."
echo ""
echo "   The bugfix protocol requires every fix to include a regression test"
echo "   that asserts the violated invariant, at a seam that exercises the"
echo "   real bug pattern. See: docs/architecture/BUGFIX_PROTOCOL.md"
echo ""
echo "   If no correct seam exists, declare it in the commit body:"
echo "     No-Seam: <why no seam reaches this bug>"
echo "   If this is a non-code fix (docs, config), skip with:"
echo "     SKIP_BUGFIX_TEST_CHECK=1 git commit ..."
echo ""
exit 1
