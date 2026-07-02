# Project: Vidra (PromptCanvas)

## Purpose

- Interactive editing canvas for AI video prompts with semantic span labeling, click-to-enhance suggestions, and fast previews.

## Tech stack

- Monorepo, Node.js >= 20, ESM (package.json has "type": "module").
- Client: React 18 + Vite, Tailwind CSS + DaisyUI, TypeScript migration in progress.
- Server: Express + tsx (TypeScript), LLM providers (OpenAI, Gemini, Groq), Firebase, Stripe.
- Shared code is in shared/ and can be imported via #shared/\*.

## Repo layout

- client/ Frontend app (Vite + React)
- server/ API + services (Express)
- shared/ Shared types/utils
- packages/ Workspace packages (ex: @promptstudio/system)
- config/ Build/lint/test config
- scripts/ Dev tools, migrations, evals
- docs/ Architecture + TS migration docs
- tests/ E2E, load, and evaluation suites

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

**Service imports:** Use canonical domain paths — `services/enhancement/EnhancementService.ts`, `services/video-concept/VideoConceptService.ts`. Domain directories are the only source.

See also: `docs/architecture/SERVICE_BOUNDARIES.md`.

## Service Architecture

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
| `continuity.services.ts`       | continuitySessionService (gated — see Feature Flags)                                                                                                                                                                                                                |
| `session.services.ts`          | sessionService, assetResolver, referenceImageProcessing                                                                                                                                                                                                             |
| `video-jobs.services.ts`       | requestIdempotency, video job processing                                                                                                                                                                                                                            |

Container created in `server/src/config/services.config.ts`, initialized in `services.initialize.ts`. Routes consume services via factories in `server/src/config/routes.config.ts`.

Dependency rules:

- **Constructor injection** only — never `container.resolve()` outside route factories or DI config.
- `aiService` is the **only** LLM routing layer. Never call provider clients directly from business services.
- Cross-domain dependencies flow through route layer or orchestrator, not direct imports.

## Feature Flags

Canonical registry: `server/src/config/feature-flags.ts` (Zod schema, ~25 flags grouped by Mode / Worker / Killswitch / Provider / Experimental / Debug). Full table with defaults lives in root `CLAUDE.md`. The load-bearing flag for day-to-day work:

| Flag                       | Default | Effect                                                              |
| -------------------------- | ------- | ------------------------------------------------------------------- |
| `ENABLE_CONVERGENCE=false` | `true`  | `continuitySessionService` resolves to **`null`**. Must null-check. |

Legacy `*_DISABLED` env var names still work but emit a deprecation warning at startup — migrate to the canonical `*_ENABLED` form.

## Route → Service → Client API Map

| Route                                   | Server Route File                         | Client API/Service                                  |
| --------------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| `POST /api/optimize`                    | `optimize.routes.ts`                      | `services/PromptOptimizationApi.ts`                 |
| `POST /api/enhance`, `/api/suggestions` | `enhancement.routes.ts`, `suggestions.ts` | `services/EnhancementApi.ts`                        |
| `POST /api/llm/label-spans`             | `labelSpansRoute.ts`                      | `features/span-highlighting/api/spanLabelingApi.ts` |
| `/api/preview/*`                        | `preview.routes.ts`                       | `features/preview/api/`                             |
| `/api/payment/*`                        | `payment.routes.ts`                       | `api/billingApi.ts`                                 |
| `/api/motion/*`                         | `motion.routes.ts`                        | `api/motionApi.ts`                                  |
| `/api/storage/*`                        | `storage.routes.ts`                       | `api/storageApi.ts`                                 |
| `/api/capabilities`                     | `capabilities.routes.ts`                  | `services/CapabilitiesApi.ts`                       |
| `/api/continuity/*`                     | `continuity.routes.ts`                    | `features/continuity/api/`                          |
| `/api/model-intelligence/*`             | `model-intelligence.routes.ts`            | `features/model-intelligence/api/`                  |
| `POST /api/frame-verification`          | `frame-verification.routes.ts`           | `features/frame-verification/api/`                  |
| `/api/sessions/*`                       | `sessions.routes.ts`                      | (uses ApiClient directly)                           |
| `/api/video/*`                          | `video.routes.ts`                         | `services/VideoConceptApi.ts`                       |
| `/api/assets/*`                         | `asset.routes.ts`                         | `features/assets/`                                  |
| `/api/reference-images/*`               | `reference-images.routes.ts`              | `features/reference-images/`                        |
| `/health`                               | `health.routes.ts`                        | (not called from client)                            |

API calls never go directly in React components. Use `client/src/api/` for thin fetch wrappers, `client/src/services/` for stateful clients, or `client/src/features/<name>/api/` for feature-scoped APIs.

## Architecture rules

- Frontend: follow preview feature pattern in client/src/features/preview/.
  - Orchestrator component + hooks/useReducer + api/ + components/.
- Backend: follow PromptOptimizationService pattern in server/src/services/prompt-optimization/PromptOptimizationService.ts.
  - Thin orchestrator + specialized services + templates/ (.md).
- API calls live in client/src/api (not inline in components).
- Backend business logic lives in server/src/services.
- SRP/SoC: do not split files solely by line count; thresholds are warnings only.
- File size heuristics: orchestrators ~500 lines, UI components ~200, hooks ~150,
  specialized services ~300, utils ~100.
- Prefer TypeScript, avoid any, and use Zod at boundaries (see docs/architecture/typescript/).

## Environment

- Create a local `.env` file; obtain values from the team's secrets manager.
- The authoritative required-var list is the Zod schema in `server/src/config/env.ts` — the server fails fast at startup with a complete missing-var list.
- Required for local dev: `VITE_FIREBASE_*` and at least one LLM key (e.g. `OPENAI_API_KEY`).
- Feature-flag toggles live in `server/src/config/feature-flags.ts`; see the table in `CLAUDE.md`.

## Common commands

- npm start Dev orchestrator (see scripts/dev/start.ts)
- npm run dev Vite client only
- npm run server API server only
- npm run lint ESLint
- npm run lint:css Stylelint
- npm run test Vitest
- npm run test:e2e Playwright
- npm run build Vite build

## Integration tests

Read `docs/architecture/typescript/TEST_GUIDE.md` Part 3 before writing any integration test.

Cardinal rule: **write tests from contracts, not implementations.**

Contract files to read:

- `server/src/config/services.config.ts` (service registrations)
- `server/src/config/services.initialize.ts` (init order, health checks)
- `server/src/app.ts` (middleware, route mounting)
- `server/src/routes/*.routes.ts` (route paths, schemas)
- `server/src/schemas/*.ts` (Zod contracts)

Do NOT read service class internals, handler bodies, or prompt templates when writing assertions.

Workflow:

1. Read contract files.
2. Write assertions against what contracts promise.
3. Run tests — expect failures.
4. Report failures with root cause analysis.
5. STOP. Ask the user whether to fix source code or adjust the test spec.

When fixing failures: default to fixing source code, not the test. Never weaken assertions.

When modifying `services.config.ts`, `services.initialize.ts`, `app.ts`, `server.ts`, or `server/index.ts`, run:

```bash
PORT=0 npx vitest run tests/integration/bootstrap.integration.test.ts tests/integration/di-container.integration.test.ts --config config/test/vitest.integration.config.js
```

## Bugfix protocol

When fixing a bug, follow this sequence exactly:

1. **Identify the violated invariant.** Frame as a general rule: "For any X, property Y holds." Not a specific input→output.
2. **Write a failing regression test** named `*.regression.test.ts` that asserts the invariant.
   - Default to **property-based tests** (fast-check) when the invariant spans a class of inputs.
   - Use **integration tests** (real pipeline, mock only LLM/DB) when the bug involves service interactions. Never mock peer services to passthrough.
   - Use point tests only for pure functions with a single edge case.
   - The test MUST fail before the fix. Run it to confirm.
3. Fix root cause in service/hook layer, not symptom in UI/API layer.
4. Run the new test — must pass.
5. Run full existing suite (`npm run test:unit`) — all existing tests must pass without modification.

The pre-commit hook rejects `fix:` / `fix(` commits without new test blocks.

Test update rules during bugfixes:

- Never weaken an existing test to accommodate a fix. A failing existing test means your fix changed a contract — treat that as a separate decision.
- Never update a test and the source file it covers in the same logical change unless the contract itself is intentionally changing.
- A failing existing test after a bugfix is information. Investigate before touching the test.
- Default action: add a new test case, don't edit existing ones.

See: `docs/architecture/BUGFIX_PROTOCOL.md`

## Working notes

- Keep changes small and consistent with existing patterns.
- Update or add tests for behavior changes.
- See client/GEMINI.md and server/GEMINI.md for subsystem-specific guidance.
- Integration test guide: docs/architecture/typescript/TEST_GUIDE.md (Part 3).
