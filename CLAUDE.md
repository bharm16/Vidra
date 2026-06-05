# Vidra

Interactive editing canvas for AI video prompts with semantic span labeling, click-to-enhance suggestions, and fast previews.

## Tech Stack

- **Monorepo**: Node.js >= 20, ESM (`"type": "module"` in all package.json files)
- **Client**: React 18 + Vite, Tailwind CSS + DaisyUI, Radix UI primitives, TypeScript (migration in progress)
- **Server**: Express + tsx (TypeScript), LLM providers (OpenAI, Gemini, Groq), Firebase Admin, Stripe
- **Shared**: Import via `#shared/*` path alias
- **Testing**: Vitest (unit), Playwright (e2e), fast-check (property)

## Runtime Constraints

- ESM only — no `require()`, no `__dirname` (use `import.meta.url` + `fileURLToPath`)
- Node 20+ — top-level await, `structuredClone`, native fetch all available
- Vite dev server proxies `/api` to port 3001 — never hardcode URLs in client code
- Firebase Admin requires `GOOGLE_APPLICATION_CREDENTIALS` env var at startup
- Redis is optional — all caching falls back to in-memory when `REDIS_URL` is unset

## Server Startup Requirement

The Express server runs `admin.auth().listUsers()` and `firestore.listCollections()` on startup (`server/src/config/services.initialize.ts`). Without valid Firebase credentials, the server exits with `FATAL: Application failed to start`. Skipped only when `NODE_ENV=test`.

Provide one of: `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_SERVICE_ACCOUNT_PATH`, or `GOOGLE_APPLICATION_CREDENTIALS`. The Vite client (`npm run dev`) runs without the server — UI development works fine, but `/api/*` calls will fail.

## Repository Structure

```
client/          # React frontend (Vite) — see client/CLAUDE.md
server/          # Express API + services — see server/CLAUDE.md
shared/          # Shared types and utilities (contract layer)
packages/        # Workspace packages (@promptstudio/system)
config/          # Build, lint, and test configuration
scripts/         # Dev tools, migrations, evaluations
docs/            # Architecture docs (see docs/architecture/)
tests/           # E2E, load, and evaluation suites
```

## Domain Glossary

These terms have specific meanings in this codebase. Do not conflate them.

| Term                          | Meaning                                                                                                     | Server Path                                                                      | Route                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------- |
| **Span labeling**             | ML categorization of prompt phrases into taxonomy categories (subject, camera, lighting…) for UI highlights | `server/src/llm/span-labeling/`                                                  | `/api/llm/label-spans`                   |
| **Enhancement / Suggestions** | AI-generated alternative phrases for a user-selected span (click-to-enhance)                                | `server/src/services/enhancement/`                                               | `/api/suggestions`, `/api/enhancement/*` |
| **Optimization**              | Two-stage prompt rewriting pipeline (Groq fast draft → OpenAI refinement)                                   | `server/src/services/prompt-optimization/`                                       | `/api/optimize` (buffered)               |
| **Continuity**                | Shot-to-shot visual consistency in multi-shot sequences                                                     | `server/src/services/continuity/`                                                | `/api/continuity`                        |
| **Convergence**               | Motion and visual convergence pipeline (iterative refinement toward target)                                 | `server/src/services/convergence/`                                               | `/api/motion`                            |
| **Model Intelligence**        | AI-powered model recommendation based on prompt analysis                                                    | `server/src/services/model-intelligence/`                                        | `/api/model-intelligence`                |
| **Preview**                   | Image (Flux Schnell) and video (Wan 2.2) draft generation before final render                               | `server/src/services/image-generation/`, `server/src/services/video-generation/` | `/api/preview`                           |
| **Generation**                | Final video render via Sora, Veo, Kling, Luma, Runway                                                       | `server/src/services/video-generation/`                                          | `/api/preview` (shared routes)           |

## Service Architecture

### DI Registration

Services are registered via domain-scoped files in `server/src/config/services/`:

| Registration File                | Registers                                                                                                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core.services.ts`               | metrics, Firebase clients, face embedding, imageObservation, llmJudge                                                                                                                                                                                               |
| `cache.services.ts`              | cacheService, spanLabelingCache                                                                                                                                                                                                                                     |
| `credit.services.ts`             | userCreditService, creditReconciliation                                                                                                                                                                                                                             |
| `storage.services.ts`            | storageService, videoContentAccess, videoAssetRetention                                                                                                                                                                                                             |
| `llm.services.ts`                | aiModelService, concurrency                                                                                                                                                                                                                                         |
| `enhancement.services.ts`        | enhancementService, videoPromptService, sceneDetectionService, promptCoherenceService                                                                                                                                                                               |
| `optimization.services.ts`       | promptOptimizationService, templateService                                                                                                                                                                                                                          |
| `image-generation.services.ts`   | videoPromptDetector, videoToImageTransformer, storyboardFramePlanner, replicateFluxSchnellProvider, replicateFluxKontextFastProvider, imageGenerationService, storyboardPreviewService                                                                              |
| `video-generation.services.ts`   | videoGenerationService, keyframeGenerationService, faceSwapService, consistentVideoService, capabilitiesProbeService, providerCircuitManager, videoWorkerHeartbeatStore, videoJobHandler, videoJobWorker, videoJobSweeper, dlqReprocessorWorker, videoJobReconciler |
| `continuity.services.ts`         | continuitySessionService (gated — see Feature Flags below)                                                                                                                                                                                                          |
| `payment.services.ts`            | paymentService, billingProfileStore, webhook + repair workers                                                                                                                                                                                                       |
| `model-intelligence.services.ts` | modelIntelligenceService, modelIntelligenceAvailabilityGate                                                                                                                                                                                                         |
| `session.services.ts`            | sessionService, assetService, referenceImageRepository                                                                                                                                                                                                              |
| `video-jobs.services.ts`         | videoJobStore, requestIdempotencyService                                                                                                                                                                                                                            |

The container is created in `server/src/config/services.config.ts` and initialized in `services.initialize.ts`. Routes consume services via factory functions in `server/src/config/routes.config.ts`.

### Dependency Rules

- Services receive dependencies through **constructor injection** — never call `container.resolve()` outside of route factory functions or DI config files.
- The `aiService` is the **only** LLM routing layer. Never call provider clients (claude, groq, gemini) directly from business services.
- Cross-domain dependencies flow through the route layer or an orchestrator service, not via direct imports.

### Frontend-Backend Decoupling

The client and server are **strictly decoupled**. Neither side may import from the other.

- `client/src/` **NEVER** imports from `server/src/` — and vice versa
- The only shared code lives in `shared/` (types, constants, Zod schemas, and pure utility functions — never I/O or framework-dependent logic)
- Changes to `shared/` are **contract changes** — run `tsc --noEmit` immediately after modifying

**Shared layer rule:** Code in `shared/` must be pure — no Node.js APIs, no React, no `fetch`,
no file I/O, no database access. Pure functions that operate on data (validation, parsing,
condition matching) are acceptable and encouraged to prevent client/server implementation drift.

**Anti-corruption layer:** Each client feature's `api/` directory insulates UI from server DTOs:

```
Server DTO → feature/api/schemas.ts (Zod) → feature/api/*.ts (transform) → hook → component
```

Cross-layer change protocol: see `.claude/skills/cross-layer-change/SKILL.md`.

## Feature Flags

Server flags are declared in [`server/src/config/feature-flags.ts`](server/src/config/feature-flags.ts) — that file is the source of truth. Update the registry, then run `npx tsx scripts/generate-flag-docs.ts --write` to refresh the table below.

<!-- BEGIN: feature-flag-table -->

<!-- Auto-generated by scripts/generate-flag-docs.ts. Do not edit by hand. -->
<!-- Source of truth: server/src/config/feature-flags.ts -->

#### Mode

| Env Var              | Default | Legacy Aliases | Description                                                                                     |
| -------------------- | ------- | -------------- | ----------------------------------------------------------------------------------------------- |
| `ENABLE_CONVERGENCE` | `true`  | —              | Enables continuity/convergence services. When false, continuitySessionService resolves to null. |

#### Worker

| Env Var                     | Default | Legacy Aliases | Description                                                                            |
| --------------------------- | ------- | -------------- | -------------------------------------------------------------------------------------- |
| `VIDEO_JOB_WORKER_DISABLED` | `false` | —              | Forces video worker loops off even when PROCESS_ROLE=worker. Used for emergency drain. |

#### Killswitch

| Env Var                          | Default | Legacy Aliases | Description                                                    |
| -------------------------------- | ------- | -------------- | -------------------------------------------------------------- |
| `WEBHOOK_RECONCILIATION_ENABLED` | `true`  | —              | Stripe webhook reconciliation background service.              |
| `BILLING_PROFILE_REPAIR_ENABLED` | `true`  | —              | Billing profile repair background worker.                      |
| `CREDIT_REFUND_SWEEPER_ENABLED`  | `true`  | —              | Credit refund sweeper background service.                      |
| `CREDIT_RECONCILIATION_ENABLED`  | `true`  | —              | Credit reconciliation background service.                      |
| `VIDEO_JOB_SWEEPER_ENABLED`      | `true`  | —              | Video job stale-task sweeper.                                  |
| `VIDEO_DLQ_REPROCESSOR_ENABLED`  | `true`  | —              | Dead-letter-queue reprocessor for failed video jobs.           |
| `VIDEO_ASSET_RETENTION_ENABLED`  | `true`  | —              | Video asset cleanup/retention service.                         |
| `VIDEO_ASSET_RECONCILER_ENABLED` | `false` | —              | Video asset orphan-detection reconciler. Opt-in (default off). |

#### Provider

| Env Var                  | Default | Legacy Aliases | Description                                                                                                |
| ------------------------ | ------- | -------------- | ---------------------------------------------------------------------------------------------------------- |
| `ALLOW_UNHEALTHY_GEMINI` | `false` | —              | Use Gemini even when the provider health check fails. Useful for dev/debug; not recommended in production. |

#### Experimental

| Env Var                   | Default | Legacy Aliases | Description                                                                                |
| ------------------------- | ------- | -------------- | ------------------------------------------------------------------------------------------ |
| `ENABLE_FACE_EMBEDDING`   | `false` | —              | Enables face embedding service for continuity quality gates. Requires Replicate API token. |
| `CONTINUITY_CLIP_ENABLED` | `true`  | —              | Enables CLIP embedding in continuity quality gate checks.                                  |
| `DEPTH_WARMUP_ON_STARTUP` | `true`  | —              | Controls depth estimation service warmup during server boot.                               |

#### Debug

| Env Var                    | Default      | Legacy Aliases | Description                                                                                                    |
| -------------------------- | ------------ | -------------- | -------------------------------------------------------------------------------------------------------------- |
| `UNHANDLED_REJECTION_MODE` | `classified` | —              | How unhandled promise rejections are categorized. `strict` exits the process; `classified` logs and continues. |

<!-- END: feature-flag-table -->

**Rule:** Code consuming `continuitySessionService` must always null-check — the service is legitimately `null` when `ENABLE_CONVERGENCE=false`.

## Route → Service → Client API Map

| Route                                              | Server Route File                         | Client API/Service                                  |
| -------------------------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| `POST /api/optimize`                               | `optimize.routes.ts`                      | `services/PromptOptimizationApi.ts`                 |
| `POST /api/enhancement/*`, `POST /api/suggestions` | `enhancement.routes.ts`, `suggestions.ts` | `services/EnhancementApi.ts`                        |
| `POST /api/llm/label-spans`                        | `labelSpansRoute.ts`                      | `features/span-highlighting/api/spanLabelingApi.ts` |
| `/api/preview/*`                                   | `preview.routes.ts`                       | `features/preview/api/`                             |
| `/api/payment/*`                                   | `payment.routes.ts`                       | `api/billingApi.ts`                                 |
| `/api/motion/*`                                    | `motion.routes.ts`                        | `api/motionApi.ts`                                  |
| `/api/storage/*`                                   | `storage.routes.ts`                       | `api/storageApi.ts`                                 |
| `/api/capabilities`                                | `capabilities.routes.ts`                  | `services/CapabilitiesApi.ts`                       |
| `/api/continuity/*`                                | `continuity.routes.ts`                    | `features/continuity/api/`                          |
| `/api/model-intelligence/*`                        | `model-intelligence.routes.ts`            | `features/model-intelligence/api/`                  |
| `/api/sessions/*`                                  | `sessions.routes.ts`                      | (no dedicated client — uses ApiClient directly)     |
| `/api/assets/*`                                    | `asset.routes.ts`                         | `features/assets/`                                  |
| `/api/reference-images/*`                          | `reference-images.routes.ts`              | `features/reference-images/`                        |
| `/health`                                          | `health.routes.ts`                        | (not called from client)                            |

**Rule:** API calls never go directly in React components. Use `client/src/api/` for thin fetch wrappers or `client/src/services/` for stateful clients. Feature-scoped APIs live in `client/src/features/<name>/api/`.

## Commands

```bash
npm start           # Dev orchestrator (client + server)
npm run dev         # Vite client only
npm run server      # API server only
npm run restart     # Kill ports 3001/5173 and restart dev
npm run build       # Production build
npm run lint        # ESLint
npm run lint:fix    # ESLint with auto-fix
npm run lint:all    # ESLint + Stylelint
npm run format      # Prettier format all files
npm run test:unit   # Run unit tests
npm run test:e2e    # Playwright e2e tests
npm run test:coverage # Unit tests with coverage report
npm run test:regression      # Run only regression tests
npm run test:regression:list  # Audit all regression test files
npm run eval:golden-set      # Relaxed F1 vs blessed baseline (gate mode)
npm run eval:golden-set:bless # Bless a fresh baseline for the active provider
npm run architecture:map        # Print architecture map JSON to stdout
npm run architecture:map:write  # Regenerate docs/architecture/architecture-map.json
npm run architecture:map:check  # CI drift gate — fails when JSON is stale
```

## Span Labeling Evaluation

Two distinct evals run against the span labeling subsystem — keep them separate.

| Eval                         | Script                                                                                  | Metric                                                               | Cadence                                                |
| ---------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ |
| **LLM-as-judge**             | `npm run eval:span` (legacy spawner) → `scripts/evaluation/span-labeling-evaluation.ts` | Coverage / Precision / Granularity / Taxonomy (1–5 via GPT-4o judge) | On-demand                                              |
| **Relaxed F1 vs golden set** | `npm run eval:golden-set` → `scripts/evaluation/golden-set-relaxed-f1.ts`               | Per-category F1 vs blessed baseline; gate exit code                  | Nightly via `.github/workflows/span-labeling-eval.yml` |

The Relaxed F1 gate is **deterministic** (hand-labeled ground truth) and uses [`scripts/evaluation/baseline-gate.ts`](scripts/evaluation/baseline-gate.ts) for per-category regression detection. Baselines live in `scripts/evaluation/golden-set-baselines/{provider}.json` — see the README there for the bless workflow.

## Operating in a Worktree (Parallel Agents)

When this checkout is a git worktree (e.g., a Conductor.build workspace) running alongside other agents, additional restrictions apply.

**Detect worktree status:**

```bash
git rev-parse --git-common-dir
# Output `.git` → main checkout. Anything else → worktree.
```

### Never start servers in a worktree

Ports 3001 (server) and 5173 (Vite) are shared with the main checkout and other worktrees. Forbidden inside a worktree:

- `npm start`, `npm run dev`, `npm run server`, `npm run restart` — port collisions
- `npm run test:e2e`, any Playwright command (including targeted specs) — browser process conflicts; defer e2e to the main checkout or CI
- Long-running watchers: `npm run test:watch`, `tsc --watch`, `vite --watch`

Use these for verification — fast, deterministic, no port binding:

```bash
npx tsc --noEmit            # type check
npm run lint                # ESLint
npm run test:unit           # unit tests, no server boot
npx vitest run <path>       # targeted tests
```

In a worktree, skip step 4 of "Validation Order Before Handoff" below — e2e runs in the main checkout or CI only.

### Use `NODE_ENV=test` for any code path that boots the server

Worktrees may not have valid Firebase credentials. The startup probe (`admin.auth().listUsers()` / `firestore.listCollections()`) hard-exits without them. If a verification step requires executing server boot code, set `NODE_ENV=test` to skip the probe — same gate the test suite uses. The Integration Test Gate command in the next section is already correct for worktrees.

### Treat the worktree as ephemeral

- `.env` and `gcs-service-account.json` are typically symlinked from the main checkout — do not move, copy, or rewrite them
- `node_modules/` is local to this worktree — `npm install` is fine; do not symlink it from another checkout
- The worktree is destroyed after merge — do not store work-critical state outside the repo (e.g., in `~/`)
- If verification genuinely requires a running server, stop and flag it for the human reviewer rather than starting one

## Commit Protocol (MANDATORY)

Before EVERY commit, run all three checks in order:

1. `npx tsc --noEmit` — must exit 0
2. `npx eslint --config config/lint/eslint.config.js . --quiet` — must have 0 errors
3. `npm run test:unit` — must pass all shards

If any check fails, DO NOT commit. Fix the failures first.

A pre-commit hook enforces checks 1-2 automatically, plus: **fix commits must include a regression test** (the hook rejects `fix:` / `fix(` commits without new test blocks). Run `bash scripts/install-hooks.sh` after cloning.

### Integration Test Gate (Service Changes)

When modifying `server/src/config/services.config.ts`, `services.initialize.ts`, `app.ts`, `server.ts`, or `server/index.ts`, also run:

```bash
PORT=0 npx vitest run tests/integration/bootstrap.integration.test.ts tests/integration/di-container.integration.test.ts --config config/test/vitest.integration.config.js
```

## Primary Workflows

### 1) Feature Workflow

1. Read relevant scope docs and impacted modules first (`client/`, `server/`, `shared/`).
2. Implement using established patterns:
   - Frontend: `client/src/features/preview/` style (orchestrator + hooks + api + components).
   - Backend: `server/src/services/prompt-optimization/` style (thin orchestrator + specialized services).
3. Add/update tests close to changed behavior.
4. Run targeted verification first, then full checks before handoff.

## Validation Order Before Handoff

1. `npx tsc --noEmit`
2. `npm run lint:all`
3. `npm run test:unit`
4. `npm run test:e2e` (or targeted e2e spec if scope is narrow)
5. `npm run build`

### Commit Scope Rules

- Maximum ~10 files per commit unless it's a mechanical refactor (rename, import path change)
- If a fix requires touching 20+ files, stop and reconsider — there's probably a root cause fix that touches 2-3 files
- Never combine dependency upgrades with code changes in the same commit
- Never combine test infrastructure changes with production code changes

### Change Scope Limits

- Type changes to shared interfaces: must run `tsc --noEmit` BEFORE continuing to other files
- Dependency version bumps: isolated commit, nothing else in it
- If fixing types requires adding `| null` or `| undefined` to more than 3 interfaces, STOP — find the root cause instead of widening types
- If a test fix requires changing the production type to make it pass, that's a production code change — treat it accordingly

## Code Rules

### SRP / Separation of Concerns

Before modifying code, ask:

1. How many distinct responsibilities does this file have?
2. How many reasons to change? (different stakeholders, different triggers)
3. If only 1 responsibility → don't split, even if over line threshold

### File Splitting: When to Actually Split

| Type       | Split When                          |
| ---------- | ----------------------------------- |
| Components | Mixed presentation + business logic |
| Hooks      | Managing unrelated state domains    |
| Services   | Multiple reasons to change          |
| Utils      | Functions with different concerns   |

Do NOT split files solely because they exceed a line threshold. Do NOT create components only used in one place. Do NOT extract code that always changes together. Do NOT add indirection without improving cohesion. Do NOT use `?.` more than 2 levels deep (fix your types instead).

### TypeScript Rules

- **No `any`**: Use `unknown` + type guards, generics, or `Record<string, unknown>`
- **No JSDoc types**: Use TypeScript annotations (JSDoc OK for descriptions/examples)
- **No magic strings**: Lift to union types or `as const` arrays
- **Zod at boundaries**: Validate API responses, user input, URL params, localStorage
- **Explicit return types**: Required for exported functions and async functions
- **Prefer `undefined`**: Over `null` (except when API explicitly returns null)

## UX Behavioral Rules

These are architectural constraints, not styling opinions.

1. **Browsing is read-only. Editing is explicit.** Viewing past state never mutates the current working prompt or settings. Any state restoration requires a deliberate, labeled action. If clicking something can lose the user's work, the design is wrong.

2. **Tools persist. Navigation interrupts.** Panels the user checks repeatedly must remain visible while switching contexts. Opening one panel should not close an unrelated panel.

## Procedural Workflows

These are on-demand — loaded via skills when the task applies:

- **Bugfix protocol:** `.claude/skills/bugfix/SKILL.md` — invariant-first regression tests at the failure boundary. **Read this before every bugfix.**
- **Integration tests:** `docs/architecture/typescript/TEST_GUIDE.md` Part 3
- **Cross-layer changes:** `.claude/skills/cross-layer-change/SKILL.md`
- **New feature scaffolding:** `.claude/skills/new-feature/SKILL.md`

## Active Programs

Cross-cutting initiatives in flight. Read the program doc before working on any of its sub-projects — it's where the end state and decomposition live.

- **Measurement Program** — [`docs/superpowers/programs/measurement.md`](docs/superpowers/programs/measurement.md) — every surface emits operational + quality telemetry to PostHog with traffic-source discrimination. Sub-project #0 (source discriminator + synthetic-traffic harness) in design.

## Subsystem Guides

- Frontend-specific: `client/CLAUDE.md`
- Backend-specific: `server/CLAUDE.md`
- Architecture rules: `docs/architecture/CLAUDE_CODE_RULES.md`
- Service boundaries: `docs/architecture/SERVICE_BOUNDARIES.md`

## Agent skills

### Issue tracker

GitHub Issues on `bharm16/Vidra`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
