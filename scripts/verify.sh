#!/usr/bin/env bash
#
# The commit gate: the same five checks CLAUDE.md mandates, overlapped instead
# of chained. The unit suite is the long pole (~2-3 min); the type check, lint,
# architecture check, and replay suite are all independent of it and of each
# other, so they run concurrently and finish inside the unit suite's first
# seconds. Wall-clock cost is the unit suite, not the sum of five gates.
#
# Each gate writes to its own log; a gate's output is printed only when it
# fails, plus the unit suite's totals on success so the pass/fail counts stay
# visible. Exit is nonzero if ANY gate fails — same contract as the old chain.
#
# Plain indexed arrays only: macOS ships bash 3.2, where `declare -A` is a
# parse error — and a parse error here once exited 0, which for a gate is the
# worst possible failure mode. `set -e` guards the setup phase for the same
# reason; it is dropped before the wait loop, where nonzero is data.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LOG_DIR="$(mktemp -d)"
trap 'rm -rf "$LOG_DIR"' EXIT

NAMES=(typecheck lint arch unit replay)
CMDS=(
  "npm run -s typecheck"
  "npm run -s lint:quiet"
  "npm run -s arch:check"
  "npm run -s test:unit"
  "npm run -s test:replay"
)
PIDS=()

for i in "${!NAMES[@]}"; do
  bash -c "${CMDS[$i]}" >"$LOG_DIR/${NAMES[$i]}.log" 2>&1 &
  PIDS[$i]=$!
done

set +e
failed=0
for i in "${!NAMES[@]}"; do
  if wait "${PIDS[$i]}"; then
    echo "✔ ${NAMES[$i]}"
  else
    echo "✖ ${NAMES[$i]} FAILED — output:"
    cat "$LOG_DIR/${NAMES[$i]}.log"
    failed=1
  fi
done

# Keep the suite totals visible on success; failures already printed in full.
if [[ $failed -eq 0 ]]; then
  grep -E "^ *(Test Files|Tests) " "$LOG_DIR/unit.log" || true
fi

exit $failed
