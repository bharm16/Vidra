# Codex Agent Guide (Vidra / PromptCanvas)

> **Sync note:** Canonical rules live in `CLAUDE.md`. This file adapts them for Codex.
> When updating shared rules, update `CLAUDE.md` first, then sync here.
> Do not replace existing `CLAUDE.md` / `GEMINI.md` files; use this as Codex-specific operating guidance.

## Non-Negotiable Rules

These constraints are absolute. No task justifies violating them.

- `client/src/` **NEVER** imports from `server/src/` — and vice versa
- No `container.resolve()` outside DI config files or route factory functions
- All LLM calls go through `aiService` — never call provider clients directly
- `continuitySessionService` may be `null` — always guard before access
- `fix:` commits must include a `*.regression.test.ts` — pre-commit hook enforces this
- Never mock the service being fixed in a regression test
- Never weaken an existing test to accommodate a fix
- Fixes should modify ≤5 files. If >5, stop and find the root cause fix
- Never combine dependency upgrades with code changes in the same commit
- Import only from canonical domain paths (`@services/enhancement/*`, not `@services/EnhancementService`)

## Project Snapshot

- Monorepo: Node.js 20+, ESM (`"type": "module"`).
- Client: React 18 + Vite + Tailwind + `@promptstudio/system` (design system) + Radix UI primitives.
- Server: Express + TypeScript (`tsx`) with LLM/Firebase/Stripe integrations.
- Shared imports: `#shared/*`.

## Domain Glossary

These terms have specific meanings in this codebase. Do not conflate them.

| Term                          | Meaning                                                                                                     | Server Path                                                                      | Route                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------- |
| **Span labeling**             | ML categorization of prompt phrases into taxonomy categories (subject, camera, lighting…) for UI highlights | `server/src/llm/span-labeling/`                                                  | `/llm/label-spans`                 |
| **Enhancement / Suggestions** | AI-generated alternative phrases for a user-selected span (click-to-enhance)                                | `server/src/services/enhancement/`                                               | `/api/suggestions`, `/api/enhance` |
| **Optimization**              | Two-stage prompt rewriting pipeline (Groq fast draft → OpenAI refinement)                                   | `server/src/services/prompt-optimization/`                                       | `/api/optimize` (buffered)         |
| **Continuity**                | Shot-to-shot visual consistency in multi-shot sequences (frame-bridge, style-match)                         | `server/src/services/continuity/`                                                | `/api/continuity`                  |
| **Convergence**               | Motion and visual convergence pipeline (iterative refinement toward target)                                 | `server/src/services/convergence/`                                               | `/api/motion`                      |
| **Video Concept**             | Guided wizard flow: subject → action → location → camera → lighting → style                                 | `server/src/services/video-concept/`                                             | via `/api` routes                  |
| **Model Intelligence**        | AI-powered model recommendation based on prompt analysis                                                    | `server/src/services/model-intelligence/`                                        | `/api/model-intelligence`          |
| **Preview**                   | Image (Flux Schnell) and video (Wan 2.2) draft generation before final render                               | `server/src/services/image-generation/`, `server/src/services/video-generation/` | `/api/preview`                     |
| **Generation**                | Final video render via Sora, Veo, Kling, Luma, Runway                                                       | `server/src/services/video-generation/`                                          | `/api/preview` (shared routes)     |

See also: `docs/architecture/SERVICE_BOUNDARIES.md` for span-labeling vs. video-prompt-analysis boundary rules.

## Service Architecture

### DI Registration

Services are registered via domain-scoped files in `server/src/config/services/`:

| Registration File              | Registers                                                                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core.services.ts`             | metrics, Firebase clients, face embedding, imageObservation, llmJudge                                                                                                                                                                                               |
| `cache.services.ts`            | cacheService, spanLabelingCache                                                                                                                                                                                                                                     |
| `credit.services.ts`           | userCreditService, creditReconciliation                                                                                                                                                                                                                             |
| `storage.services.ts`          | storageService, videoContentAccess, videoAssetRetention                                                                                                                                                                                                             |
| `llm.services.ts`              | aiModelService, concurrency                                                                                                                                                                                                                                         |
| `enhancement.services.ts`      | enhancementService, videoService, sceneDetection                                                                                                                                                                                                                    |
| `video-generation.services.ts` | videoGenerationService, keyframeGenerationService, faceSwapService, consistentVideoService, capabilitiesProbeService, providerCircuitManager, videoWorkerHeartbeatStore, videoJobHandler, videoJobWorker, videoJobSweeper, dlqReprocessorWorker, videoJobReconciler |
| `continuity.services.ts`       | continuitySessionService (gated — see Feature Flags below)                                                                                                                                                                                                          |
| `session.services.ts`          | sessionService, assetResolver, referenceImageProcessing                                                                                                                                                                                                             |
| `video-jobs.services.ts`       | requestIdempotency, video job processing                                                                                                                                                                                                                            |

The container is created in `server/src/config/services.config.ts` and initialized in `services.initialize.ts`. Routes consume services via factory functions in `server/src/config/routes.config.ts`.

### Service Placement

- Single domain logic (e.g., new enhancement feature) → extend the domain service
- Cross-domain coordination (e.g., preview + optimization) → orchestrator in routes or new orchestration service
- Request/response shaping only → keep in route handler
- Shared utility (pure function, no dependencies) → `utils/`
- Never import a service from another domain directory for reuse — extract to shared or use route-level orchestration

### Frontend-Backend Decoupling

The client and server are **strictly decoupled**. Neither side may import from the other.

- The only shared code lives in `shared/` (types, constants, Zod schemas — never runtime logic).
- Changes to `shared/` are **contract changes** that affect both sides — run `tsc --noEmit` immediately after modifying.

**Anti-corruption layer:** Each client feature's `api/` directory insulates UI from server DTOs:

```
Server DTO → feature/api/schemas.ts (Zod) → feature/api/*.ts (transform) → hook → component
```

**Cross-layer change protocol:**

1. Update the `shared/` contract first.
2. Run `tsc --noEmit` — fix compilation errors on both sides.
3. Update the server route/service.
4. Update the client feature `api/` layer (schemas + transforms).
5. UI components should not need changes if the anti-corruption layer is working correctly.

## Feature Flags

| Flag                       | Default | Effect When Set                                                                                                    |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `ENABLE_CONVERGENCE=false` | `true`  | Disables continuity service registration. `continuitySessionService` resolves to **`null`** from the DI container. |

## Primary Workflows

### 1) Feature Workflow

1. Read relevant scope docs and impacted modules first (`client/`, `server/`, `shared/`).
2. Implement using established patterns:
   - Frontend: `client/src/features/preview/` style (orchestrator + hooks + api + components).
   - Backend: `server/src/services/prompt-optimization/` style (thin orchestrator + specialized services).
3. Add/update tests close to changed behavior.
4. Run targeted verification first, then full checks before handoff.

### 2) Bugfix Workflow

Read `.agents/skills/bugfix/SKILL.md` before every bugfix.

Key principle: invariant-first regression tests at the failure boundary. Never mock the service being fixed. The pre-commit hook rejects `fix:` commits without new test blocks.

### 3) Performance Workflow

1. Start app and verify baseline behavior.
2. Use highlight/perf scripts to measure before/after.
3. Change one variable at a time and keep a short measurement note.
4. Validate no regression in unit/e2e smoke tests.

### 4) Data Migration / Backfill Workflow

1. Run dry-run modes first where available.
2. Validate expected record count/sample output.
3. Execute real migration only after dry-run is clean.
4. Re-check key API paths and logs.

### 5) Integration Tests

Read `.agents/skills/integration-test/SKILL.md` before writing integration tests.

Key principle: write tests from contracts, not implementations. Default to fixing source code, not tests.

## Command Reference

### Setup / Dev

```bash
npm install
npm start           # Dev orchestrator (client + server)
npm run dev         # Vite client only
npm run server      # API server only
npm run restart     # Kill ports 3001/5173 and restart dev
```

### Build / Lint / Format

```bash
npm run build
npm run lint
npm run lint:fix
npm run lint:all
npm run format
npm run format:check
```

### Test

```bash
npm run test:unit
npm run test:coverage
npm run test:e2e
npm run test:e2e:debug
npm run test:regression
npm run test:regression:list
npm run test:all
```

### Evaluations / Quality Gates

```bash
npm run eval:span
npm run eval:suggestions
npm run eval:optimization
npm run eval:regression
npm run quality:gate
```

### Architecture Gates

```bash
npm run arch:check
npm run arch:cycles:client
npm run arch:cycles:server
npm run arch:forbidden-imports
```

### Performance / Diagnostics

```bash
npm run verify-keys
npm run highlight-stats
npm run highlight-stats:watch
npm run perf:monitor
npm run perf:stats
npm run perf:metrics
```

### Migrations

```bash
npm run migrate:rerender:dry
npm run migrate:rerender
npm run migrate:backfill:dry
npm run migrate:backfill
```

## Commit Protocol (MANDATORY)

Before EVERY commit, run all three checks in order:

1. `npx tsc --noEmit` — must exit 0
2. `npx eslint --config config/lint/eslint.config.js . --quiet` — must have 0 errors
3. `npm run test:unit` — must pass all shards

If any check fails, DO NOT commit. Fix the failures first.

A pre-commit hook enforces checks 1-2 automatically, plus: **fix commits must include a regression test** (the hook rejects `fix:` / `fix(` commits without new test blocks). Run `bash scripts/install-hooks.sh` to install it.

### Integration Test Gate (Service Changes)

When modifying files in `server/src/config/services.config.ts`, `server/src/config/services.initialize.ts`, `server/src/app.ts`, `server/src/server.ts`, or `server/index.ts`, also run:

```bash
PORT=0 npx vitest run tests/integration/bootstrap.integration.test.ts tests/integration/di-container.integration.test.ts --config config/test/vitest.integration.config.js
```

If these fail, the change broke application startup or DI wiring. Fix the source code, not the tests.

### Commit Scope Rules

- Maximum ~10 files per commit unless it's a mechanical refactor (rename, import path change).
- If a fix requires touching 20+ files, stop and reconsider — there's probably a root cause fix that touches 2-3 files.
- Never combine dependency upgrades with code changes in the same commit.
- Never combine test infrastructure changes with production code changes.

### Change Scope Limits

- Type changes to shared interfaces: must run `tsc --noEmit` BEFORE continuing to other files.
- Dependency version bumps: isolated commit, nothing else in it.
- If fixing types requires adding `| null` or `| undefined` to more than 3 interfaces, STOP — find the root cause instead of widening types.
- If a test fix requires changing the production type to make it pass, that's a production code change — treat it accordingly.

## Code Rules

### SRP / File Splitting

Before modifying code, ask: how many distinct responsibilities does this file have? How many reasons to change?

| Type       | Split When                          |
| ---------- | ----------------------------------- |
| Components | Mixed presentation + business logic |
| Hooks      | Managing unrelated state domains    |
| Services   | Multiple reasons to change          |
| Utils      | Functions with different concerns   |

Do NOT split files solely because they exceed a line threshold.

### TypeScript Rules

- **No `any`**: Use `unknown` + type guards, generics, or `Record<string, unknown>`
- **No magic strings**: Lift to union types or `as const` arrays
- **Zod at boundaries**: Validate API responses, user input, URL params, localStorage
- **Explicit return types**: Required for exported functions and async functions
- **Prefer `undefined`**: Over `null` (except when API explicitly returns null)
- Do NOT use `?.` more than 2 levels deep (fix your types instead)

## UX Behavioral Rules

These are architectural constraints, not styling opinions.

1. **Browsing is read-only. Editing is explicit.** Viewing past state never mutates the current working prompt or settings. Any state restoration requires a deliberate, labeled action. If clicking something can lose the user's work, the design is wrong.

2. **Tools persist. Navigation interrupts.** Panels the user checks repeatedly must remain visible while switching contexts. Opening one panel should not close an unrelated panel.

## Validation Order Before Handoff

1. `npx tsc --noEmit`
2. `npm run lint:all`
3. `npm run test:unit`
4. `npm run test:e2e` (or targeted e2e spec if scope is narrow)
5. `npm run build`

## References

- Route/service/client mapping: `docs/architecture/ROUTE_MAP.md`
- Service boundaries: `docs/architecture/SERVICE_BOUNDARIES.md`
- Bugfix protocol: `.agents/skills/bugfix/SKILL.md`
- Integration tests: `.agents/skills/integration-test/SKILL.md`
- Architecture rules: `docs/architecture/CLAUDE_CODE_RULES.md`
- Root CLAUDE.md: `CLAUDE.md`

## Cursor Cloud specific instructions

### Services Overview

| Service     | Port      | Command          | Notes                                             |
| ----------- | --------- | ---------------- | ------------------------------------------------- |
| Vite client | 5173      | `npm run dev`    | React frontend; works independently of the server |
| Express API | 3001      | `npm run server` | Requires Firebase Admin credentials (see below)   |
| Both        | 5173+3001 | `npm start`      | Concurrently runs both via `scripts/dev/start.ts` |

### Firebase Credentials (Server Startup Blocker)

The Express server runs `admin.auth().listUsers()` and `firestore.listCollections()` on every startup (in `server/src/config/services.initialize.ts`). Without a valid Firebase service account, the server exits with `FATAL: Application failed to start`. This check is **only** skipped when `NODE_ENV=test`.

To start the server, you need **one** of:

- `FIREBASE_SERVICE_ACCOUNT_JSON` env var containing the full service account JSON
- `FIREBASE_SERVICE_ACCOUNT_PATH` env var pointing to an existing JSON file on disk
- `GOOGLE_APPLICATION_CREDENTIALS` env var pointing to an existing JSON file on disk

If these secrets are configured but reference file paths that don't exist on disk, the server will fail.

### Running Without the Server

The Vite client (`npm run dev`) runs independently and renders the full UI. API calls to `/api/*` and `/llm/*` will fail, but all frontend-only development (components, styling, state management) works fine.

### Key Environment Config

- Redis is optional; comment out `REDIS_URL` to use in-memory cache fallback.
- The `.env` file is created manually; required-var list lives in `server/src/config/env.ts` (Zod schema) and is validated at startup.

### Commands Reference

Standard commands are documented in root `CLAUDE.md` under **Commands**. Key ones:

- Lint: `npm run lint` (ESLint), `npm run lint:css` (Stylelint), `npm run lint:all` (both)
- Type check: `npx tsc --noEmit`
- Unit tests: `npm run test:unit` (Vitest, ~5700+ tests)
- Build: `npm run build` (Vite production build)
- Pre-commit checks run automatically via git hooks installed by `npm install` (`prepare` script)

### Pre-existing Test Failures

There are 5 pre-existing unit test failures related to `LlmClientFactory` provider detection and `DepthEstimationService` availability checks. These are not environment-related.
