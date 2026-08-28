---
name: api-doc
description: Audit route coverage — the live OpenAPI spec (dev /api-docs route) vs ROUTE_MAP.md vs the documented route table in CLAUDE.md.
disable-model-invocation: true
---

## API Documentation Workflow

The committed spec artifact and its generator were deleted 2026-08-27 (zero
consumers; commit `89b42e9d`). The spec is now built fresh at request time by
`server/src/openapi/devRoute.ts` from `server/src/openapi/spec.ts`, served at
`GET /api-docs` when `NODE_ENV !== "production"`.

### Step 1: Get the live spec

If the dev server is running (port 3001):

```bash
curl -s http://localhost:3001/api-docs > /tmp/openapi.json
```

If no server is running, do NOT start one just for this — read
`server/src/openapi/spec.ts` directly; it is the source the route serves.

### Step 2: Regenerate the route map (the deterministic ground truth)

```bash
npm run routemap:generate
```

`docs/architecture/ROUTE_MAP.md` is the walker-generated inventory of every
mounted route. `npm run routemap:check` fails when it is stale.

### Step 3: Cross-check three sources

Compare, and report divergence between:

1. `docs/architecture/ROUTE_MAP.md` (ground truth — walker output)
2. The OpenAPI spec (`/api-docs` output or `spec.ts`)
3. The `CLAUDE.md` "Route → Service → Client API Map" table (curated, active
   surfaces only — it deliberately omits internal/frozen routes)

### Step 4: Report

```
## API Documentation Report

### Coverage Summary
- Routes in ROUTE_MAP.md: N
- Routes in OpenAPI spec: N
- Rows in CLAUDE.md table: N

### In code but missing from the spec
[...]

### In the spec but not mounted (stale spec.ts entries)
[...]

### CLAUDE.md table drift
[Active-surface routes missing from, or stale in, the curated table]
```

### Step 5: Update CLAUDE.md (if gaps found)

The CLAUDE.md table is curated — add missing ACTIVE-surface rows, correct
stale ones, and follow the existing format:

```
| Route | Server Route File | Client API/Service |
```

Edit the table atomically via Bash (the formatter hook corrupts markdown
tables on partial Edit-tool row changes).
