#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# ── Legacy service import restrictions ──────────────────────────────────────

legacy_pattern='@services/EnhancementService\b'
credits_singleton_pattern="import\\s*\\{[^}]*\\buserCreditService\\b[^}]*\\}\\s*from ['\\\"]@services/credits/UserCreditService['\\\"]"
storage_singleton_pattern="import\\s*\\{[^}]*\\bgetStorageService\\b[^}]*\\}\\s*from ['\\\"]@services/storage/StorageService['\\\"]"

legacy_hits="$(rg -n "$legacy_pattern" server/src client/src tests || true)"
credits_hits="$(rg -n -P "$credits_singleton_pattern" server/src/routes server/src/middleware || true)"
storage_hits="$(rg -n -P "$storage_singleton_pattern" server/src/routes server/src/middleware || true)"

legacy_count=0
credits_count=0
storage_count=0

if [[ -n "$legacy_hits" ]]; then
  legacy_count="$(printf '%s\n' "$legacy_hits" | wc -l | tr -d ' ')"
fi
if [[ -n "$credits_hits" ]]; then
  credits_count="$(printf '%s\n' "$credits_hits" | wc -l | tr -d ' ')"
fi
if [[ -n "$storage_hits" ]]; then
  storage_count="$(printf '%s\n' "$storage_hits" | wc -l | tr -d ' ')"
fi

# ── Shared layer purity ────────────────────────────────────────────────────
# shared/ must be pure: no Node.js built-ins, no React, no framework code.

shared_node_pattern="from ['\"](?:node:)?(fs|path|http|https|child_process|crypto|os|net|stream|events|buffer|worker_threads)['\"/]"
shared_react_pattern="from ['\"]react['\"]"

shared_node_hits="$(rg -n -P "$shared_node_pattern" shared/ || true)"
shared_react_hits="$(rg -n "$shared_react_pattern" shared/ || true)"

shared_node_count=0
shared_react_count=0

if [[ -n "$shared_node_hits" ]]; then
  shared_node_count="$(printf '%s\n' "$shared_node_hits" | wc -l | tr -d ' ')"
fi
if [[ -n "$shared_react_hits" ]]; then
  shared_react_count="$(printf '%s\n' "$shared_react_hits" | wc -l | tr -d ' ')"
fi

# ── DI discipline: no container.resolve in services/middleware ──────────────
# Services and middleware receive dependencies via constructor injection.

container_resolve_pattern='container\.resolve'

container_resolve_hits="$(rg -n "$container_resolve_pattern" server/src/services server/src/middleware || true)"

container_resolve_count=0

if [[ -n "$container_resolve_hits" ]]; then
  container_resolve_count="$(printf '%s\n' "$container_resolve_hits" | wc -l | tr -d ' ')"
fi

# ── Domain type ownership: ToolSidebar/types only inside ToolSidebar ───────
# Other client code imports domain types from @features/generation-controls.

# Both `@components/*` and `@/components/*` resolve to client/src/components,
# so a fence that names only one spelling reports green while the other is live.
toolsidebar_types_pattern='@/?components/ToolSidebar/types'

toolsidebar_hits="$(rg -n "$toolsidebar_types_pattern" --glob '!**/ToolSidebar/**' client/src || true)"

toolsidebar_count=0

if [[ -n "$toolsidebar_hits" ]]; then
  toolsidebar_count="$(printf '%s\n' "$toolsidebar_hits" | wc -l | tr -d ' ')"
fi

# ── Report ─────────────────────────────────────────────────────────────────

total=$((legacy_count + credits_count + storage_count + shared_node_count + shared_react_count + container_resolve_count + toolsidebar_count))

echo "Architecture forbidden import checks"
echo "- legacy root service imports: $legacy_count"
echo "- routes/middleware credits singleton imports: $credits_count"
echo "- routes/middleware storage singleton imports: $storage_count"
echo "- shared/ Node.js built-in imports: $shared_node_count"
echo "- shared/ React imports: $shared_react_count"
echo "- services/middleware container.resolve calls: $container_resolve_count"
echo "- ToolSidebar/types imports outside ToolSidebar: $toolsidebar_count"

if (( legacy_count > 0 )); then
  echo ""
  echo "Legacy root service imports (must be zero):"
  printf '%s\n' "$legacy_hits"
fi

if (( credits_count > 0 )); then
  echo ""
  echo "Route/middleware credits singleton imports (must be zero):"
  printf '%s\n' "$credits_hits"
fi

if (( storage_count > 0 )); then
  echo ""
  echo "Route/middleware storage singleton imports (must be zero):"
  printf '%s\n' "$storage_hits"
fi

if (( shared_node_count > 0 )); then
  echo ""
  echo "Shared layer Node.js built-in imports (must be zero):"
  printf '%s\n' "$shared_node_hits"
fi

if (( shared_react_count > 0 )); then
  echo ""
  echo "Shared layer React imports (must be zero):"
  printf '%s\n' "$shared_react_hits"
fi

if (( container_resolve_count > 0 )); then
  echo ""
  echo "Services/middleware container.resolve calls (must be zero):"
  printf '%s\n' "$container_resolve_hits"
fi

if (( toolsidebar_count > 0 )); then
  echo ""
  echo "ToolSidebar/types imports outside ToolSidebar (must be zero):"
  printf '%s\n' "$toolsidebar_hits"
fi

if (( total > 0 )); then
  exit 1
fi

echo "All forbidden import checks passed."
