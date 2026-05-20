# Server workspace (server/)

## Stack

- Node.js 20, Express
- TypeScript executed via tsx
- ESM (package.json has "type": "module")
- Integrations: LLM providers, Firebase Admin, Stripe, Redis (optional)

## Structure

- server/index.ts Entry point
- server/src/app.ts Express app setup
- server/src/server.ts HTTP server wiring
- server/src/services/ Business logic (PromptOptimizationService pattern)
- server/src/routes/ HTTP routes
- server/src/clients/ External API clients
- server/src/llm/ LLM orchestration
- server/src/middleware/ Express middleware
- server/src/schemas/ Validation schemas (use Zod)
- server/src/contracts/ Request/response contracts
- server/src/utils/ Shared helpers

## Domain Glossary

These terms have specific meanings in this codebase. Do not conflate them.

| Term                          | Meaning                                                                | Service Path                                               | Route                              |
| ----------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| **Span labeling**             | ML categorization of prompt phrases into taxonomy categories           | `llm/span-labeling/`                                       | `/api/llm/label-spans`             |
| **Enhancement / Suggestions** | AI-generated alternative phrases for a user-selected span              | `services/enhancement/`                                    | `/api/suggestions`, `/api/enhance` |
| **Optimization**              | Two-stage prompt rewriting (Groq fast draft → OpenAI refinement)       | `services/prompt-optimization/`                            | `/api/optimize` (buffered)         |
| **Continuity**                | Shot-to-shot visual consistency (frame-bridge, style-match)            | `services/continuity/`                                     | `/api/continuity`                  |
| **Convergence**               | Motion/visual convergence pipeline                                     | `services/convergence/`                                    | `/api/motion`                      |
| **Video Concept**             | Guided wizard: subject → action → location → camera → lighting → style | `services/video-concept/`                                  | via `/api` routes                  |
| **Model Intelligence**        | AI-powered model recommendation                                        | `services/model-intelligence/`                             | `/api/model-intelligence`          |
| **Preview**                   | Image (Flux Schnell) and video (Wan 2.2) draft generation              | `services/image-generation/`, `services/video-generation/` | `/api/preview`                     |
| **Generation**                | Final video render via Sora, Veo, Kling, Luma, Runway                  | `services/video-generation/`                               | `/api/preview` (shared routes)     |

**Service imports:** Use canonical domain paths — `services/enhancement/EnhancementService.ts`, `services/video-concept/VideoConceptService.ts`. Domain directories are the only source.

See also: `docs/architecture/SERVICE_BOUNDARIES.md`.

## DI Registration

Services are registered via domain-scoped files in `src/config/services/`:

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
| `payment.services.ts`          | paymentService, billingProfileStore, webhook + repair workers                                                                                                                                                                                                       |
| `session.services.ts`          | sessionService, assetService, referenceImageRepository                                                                                                                                                                                                              |
| `video-jobs.services.ts`       | requestIdempotency, video job processing                                                                                                                                                                                                                            |

Container: `src/config/services.config.ts`. Initialization: `services.initialize.ts`. Routes consume via factories in `src/config/routes.config.ts`.

Dependency rules:

- **Constructor injection** only — never `container.resolve()` outside route factories or DI config.
- `aiService` is the **only** LLM routing layer. Never call provider clients directly.
- Cross-domain dependencies flow through route layer or orchestrator, not direct imports.

## Feature Flags

Canonical registry: `src/config/feature-flags.ts` (Zod schema, ~25 flags grouped by Mode / Worker / Killswitch / Provider / Experimental / Debug). Full table with defaults lives in root `CLAUDE.md`. The load-bearing flag for day-to-day work:

| Flag                       | Default | Effect                                                              |
| -------------------------- | ------- | ------------------------------------------------------------------- |
| `ENABLE_CONVERGENCE=false` | `true`  | `continuitySessionService` resolves to **`null`**. Must null-check. |

Legacy `*_DISABLED` env var names still work but emit a deprecation warning at startup — migrate to the canonical `*_ENABLED` form.

## Route → Client API Map

Server route files map to client-side API files. Reference this when adding/modifying routes to ensure the client is updated.

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
| `/api/sessions/*`                       | `sessions.routes.ts`                      | (uses ApiClient directly)                           |
| `/api/video/*`                          | `video.routes.ts`                         | `services/VideoConceptApi.ts`                       |
| `/api/assets/*`                         | `asset.routes.ts`                         | `features/assets/`                                  |
| `/api/reference-images/*`               | `reference-images.routes.ts`              | `features/reference-images/`                        |
| `/health`                               | `health.routes.ts`                        | (not called from client)                            |

## Architecture pattern

- Follow PromptOptimizationService pattern in server/src/services/prompt-optimization/.
  - Thin orchestrator + specialized services + templates/ (.md)
- Keep controllers/routes thin; put business logic in services.

## Conventions

- Use Zod at boundaries for validation.
- Prefer structured logging utilities (see docs/architecture/typescript/LOGGING_PATTERNS.md).
- Keep orchestration separate from implementation details.

## Integration tests

Read `docs/architecture/typescript/TEST_GUIDE.md` Part 3 before writing any integration test.

**Write tests from contracts, not implementations.** Read the files below for what the code promises. Do NOT read service implementations when writing assertions.

Contract sources:

- `server/src/config/services.config.ts` — all service registrations and factory functions
- `server/src/config/services.initialize.ts` — initialization order and health checks
- `server/src/app.ts` — middleware stack and route mounting
- `server/src/routes/*.routes.ts` — route paths and Zod schemas
- `server/src/schemas/*.ts` — validation contracts
- `shared/taxonomy.ts` — category definitions

Off-limits for assertion writing:

- Service class bodies (e.g., `EnhancementService.ts` internals)
- Route handler function bodies
- LLM prompt templates

When generating integration tests:

1. Read contract files.
2. Write assertions from contracts.
3. Run — expect failures.
4. Report failures with root cause.
5. STOP. Ask user whether to fix source code or test spec.

When fixing failures: fix the source code by default, not the test. Never weaken assertions, add swallowing try/catch, or change expected values to match broken output.

Integration test gate: when modifying `services.config.ts`, `services.initialize.ts`, `app.ts`, `server.ts`, or `index.ts`, run:

```bash
PORT=0 npx vitest run tests/integration/bootstrap.integration.test.ts tests/integration/di-container.integration.test.ts --config config/test/vitest.integration.config.js
```
