---
name: route-map-sync
description: Use after adding, renaming, or removing an Express route in server/src/routes/. Verifies docs/architecture/ROUTE_MAP.md is consistent with the actual routes via npm run routemap:check, regenerates if needed, and flags drift in CLAUDE.md / AGENTS.md / GEMINI.md route tables.
disable-model-invocation: true
---

# Route Map Sync

This codebase has THREE places that document HTTP routes:

1. `docs/architecture/ROUTE_MAP.md` — auto-generated, source of truth for the agent context layer
2. `CLAUDE.md` § "Route → Service → Client API Map" — hand-curated table
3. `AGENTS.md` § "References" (points to `ROUTE_MAP.md`) plus the curated tables in `GEMINI.md` and `server/GEMINI.md` (`server/CLAUDE.md` carries route _conventions_, not a table)

When a route is added, renamed, or removed, all of these can drift. This skill enforces consistency. For a deep multi-file audit, dispatch the `route-contract-auditor` subagent (`.claude/agents/route-contract-auditor.md`).

## When to invoke

- After creating, renaming, or deleting any `*.routes.ts` file in `server/src/routes/`
- After changing any route path inside an existing routes file
- Before merging a PR that touches `server/src/routes/`

## Workflow

### 1. Detect changed routes

```bash
git diff --name-only HEAD -- 'server/src/routes/**/*.ts'
```

If no files in `server/src/routes/` changed, no sync is needed.

### 2. Run the route map check

```bash
npm run routemap:check
```

This compares the actual routes registered in the Express app against `docs/architecture/ROUTE_MAP.md`. It exits non-zero if they diverge.

### 3. Regenerate if needed

```bash
npm run routemap:generate
```

This rewrites `docs/architecture/ROUTE_MAP.md` based on the current routes.

### 4. Manually audit hand-curated tables

The script does NOT update tables embedded in `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `server/CLAUDE.md`, or `server/GEMINI.md`. After regenerating ROUTE_MAP.md, scan for the route in those files and update by hand.

For each newly added/changed/removed route, locate the row in:

- `CLAUDE.md` § "Route → Service → Client API Map"
- `GEMINI.md` § "Route → Service → Client API Map"
- `server/CLAUDE.md` (if present)
- `server/GEMINI.md` § "Route → Client API Map"
- `AGENTS.md` (currently delegates to ROUTE_MAP.md — verify reference is still accurate)

Each row should have: route, server route file, client API file. Use the format already in the table.

### 5. Verify client API client exists or is being added

If the route is new, confirm there's a corresponding client API file at one of:

- `client/src/api/<name>Api.ts` — thin fetch wrapper
- `client/src/services/<Name>Api.ts` — stateful client
- `client/src/features/<feature>/api/` — feature-scoped

If not, this is a cross-layer change — invoke `.claude/skills/cross-layer-change/SKILL.md`.

### 6. Run validation

```bash
npx tsc --noEmit
npm run lint
```

### 7. Commit

Route file change + ROUTE_MAP.md regen + hand-edited tables should ALL be in the same commit. They're one logical change.

## Common pitfalls

- **Forgetting hand-curated tables**: The script only updates `ROUTE_MAP.md`. The four other context files require manual edits.
- **Adding a route without a client API file**: Routes without clients become dead ends — check immediately whether the client side is also being added.
- **Generic DTOs vs UI-shaped DTOs**: Route responses should be general-purpose, not tailored to a single UI component. See server/CLAUDE.md § "Frontend-Backend Boundary".

## Related

- Generator: `scripts/generate-route-map.ts`
- Project rule: API calls never go directly in React components — use `client/src/api/`, `client/src/services/`, or `client/src/features/<name>/api/`
- Cross-layer: `.claude/skills/cross-layer-change/SKILL.md`
