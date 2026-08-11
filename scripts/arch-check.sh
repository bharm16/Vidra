#!/usr/bin/env bash
#
# Architecture gate: both madge cycle scans and the forbidden-import grep are
# independent whole-tree reads, so they run concurrently — the gate costs the
# slower madge scan (~7s) rather than the three-step sum (~13s).

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LOG_DIR="$(mktemp -d)"
trap 'rm -rf "$LOG_DIR"' EXIT

npm run -s arch:cycles:client >"$LOG_DIR/client.log" 2>&1 &
client_pid=$!
npm run -s arch:cycles:server >"$LOG_DIR/server.log" 2>&1 &
server_pid=$!
bash scripts/arch-forbidden-imports.sh >"$LOG_DIR/forbidden.log" 2>&1 &
forbidden_pid=$!

failed=0
for entry in "client-cycles:$client_pid" "server-cycles:$server_pid" "forbidden-imports:$forbidden_pid"; do
  name="${entry%%:*}"
  pid="${entry##*:}"
  if wait "$pid"; then
    echo "✔ $name"
  else
    echo "✖ $name FAILED — output:"
    cat "$LOG_DIR/${name%%-*}.log" 2>/dev/null || cat "$LOG_DIR/forbidden.log"
    failed=1
  fi
done

exit $failed
