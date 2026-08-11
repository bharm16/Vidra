#!/usr/bin/env bash
#
# Type-check gate.
#
# Two configs, because they check different things:
#
#   root            every file — client, server, shared, tests, scripts — under
#                   the strict settings in tsconfig.json.
#   server/tsconfig narrows `lib` to ES2022 with `types: ["node"]`. That is the
#                   only check that catches server code reaching for a DOM
#                   global, which the root config permits because its default
#                   lib includes DOM.
#
# They are independent, so they run concurrently: the gate costs the slower of
# the two rather than their sum. Both are incremental — the build info lives
# under node_modules/.cache, so a warm run only re-checks what changed.
#
# The client config is deliberately absent. It extends root, narrows nothing,
# and its only extra input (client/vite.config.ts) does not exist — so running
# it re-checks client/src under settings root already applied.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CACHE_DIR="node_modules/.cache/typecheck"
mkdir -p "$CACHE_DIR"

run_tsc() {
  local label="$1"
  local out="$2"
  shift 2
  npx tsc --noEmit --incremental --tsBuildInfoFile "$CACHE_DIR/$label.tsbuildinfo" "$@" >"$out" 2>&1
}

root_out="$(mktemp)"
server_out="$(mktemp)"
trap 'rm -f "$root_out" "$server_out"' EXIT

run_tsc root "$root_out" &
root_pid=$!
run_tsc server "$server_out" --project server/tsconfig.json &
server_pid=$!

wait "$root_pid"; root_status=$?
wait "$server_pid"; server_status=$?

failed=0

if [[ $root_status -ne 0 ]]; then
  echo "✖ tsc (root) failed"
  cat "$root_out"
  failed=1
fi

if [[ $server_status -ne 0 ]]; then
  echo "✖ tsc (server/tsconfig.json) failed"
  cat "$server_out"
  failed=1
fi

if [[ $failed -ne 0 ]]; then
  exit 1
fi

echo "✔ Type check passed (root + server)."
