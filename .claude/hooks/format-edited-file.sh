#!/usr/bin/env bash
# PostToolUse formatter for files an agent edits or writes.
#
# Prettier runs only on new files and on files whose committed version is
# already prettier-clean. Files written in the repo's dense style are left
# as they are, so an edit to one stays a small diff instead of a whole-file
# reformat. Never blocks the edit.
set -uo pipefail

file=$(jq -r '.tool_input.file_path // empty')
[[ "$file" =~ \.(ts|tsx|js|jsx|css|md|json)$ && -f "$file" ]] || exit 0

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0
prettier=(npx --no-install prettier --config config/lint/.prettierrc)

# A file in the last commit keeps its style unless that style is prettier's.
committed_path=$(git ls-files --full-name --error-unmatch -- "$file" 2>/dev/null) || committed_path=""
if [[ -n "$committed_path" ]] && git cat-file -e "HEAD:$committed_path" 2>/dev/null; then
  committed=$(git show "HEAD:$committed_path") || exit 0
  formatted=$(printf '%s\n' "$committed" | "${prettier[@]}" --stdin-filepath "$file" 2>/dev/null) || exit 0
  [[ "$committed" == "$formatted" ]] || exit 0
fi

"${prettier[@]}" --write "$file" >/dev/null 2>&1 || true
exit 0
