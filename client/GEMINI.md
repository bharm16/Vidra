# Client workspace (client/)

## Stack

- React 18 + Vite
- Tailwind CSS + @promptstudio/system (design system)
- TypeScript/JavaScript mix (migration in progress)

## Structure

- client/src/
  - App.tsx, main.tsx
  - components/, features/, pages/
  - hooks/, api/, services/, repositories/
  - schemas/, types/, utils/, styles/

## Domain Glossary

These terms have specific meanings in this codebase. Do not conflate them.

| Term                          | Meaning                                                                        | Client Feature/Service              | Server Route                       |
| ----------------------------- | ------------------------------------------------------------------------------ | ----------------------------------- | ---------------------------------- |
| **Span labeling**             | ML categorization of prompt phrases into taxonomy categories for UI highlights | `features/span-highlighting/`       | `/api/llm/label-spans`             |
| **Enhancement / Suggestions** | AI-generated alternative phrases for a user-selected span (click-to-enhance)   | `services/EnhancementApi.ts`        | `/api/suggestions`, `/api/enhance` |
| **Optimization**              | Two-stage prompt rewriting (Groq fast draft → OpenAI refinement)               | `services/PromptOptimizationApi.ts` | `/api/optimize-stream` (SSE)       |
| **Continuity**                | Shot-to-shot visual consistency in multi-shot sequences                        | `features/continuity/`              | `/api/continuity`                  |
| **Convergence**               | Motion/visual convergence pipeline                                             | `features/convergence/`             | `/api/motion`                      |
| **Model Intelligence**        | AI-powered model recommendation based on prompt analysis                       | `features/model-intelligence/`      | `/api/model-intelligence`          |
| **Preview**                   | Image (Flux Schnell) and video (Wan 2.2) draft generation before final render  | `features/preview/`                 | `/api/preview`                     |
| **Generation**                | Final video render via Sora, Veo, Kling, Luma, Runway                          | (shared with preview)               | `/api/preview` (shared routes)     |

## Service Architecture (Server Context)

Server DI registration files in `server/src/config/services/`:

| Registration File              | Registers                                                                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core.services.ts`             | metrics, Firebase clients, face embedding, core infrastructure                                                                                                                                                                                                      |
| `cache.services.ts`            | cacheService, spanLabelingCache                                                                                                                                                                                                                                     |
| `credit.services.ts`           | userCreditService, creditReconciliation                                                                                                                                                                                                                             |
| `storage.services.ts`          | storageService, videoContentAccess, videoAssetRetention                                                                                                                                                                                                             |
| `llm.services.ts`              | aiModelService, concurrency                                                                                                                                                                                                                                         |
| `enhancement.services.ts`      | enhancementService, videoService, sceneDetection                                                                                                                                                                                                                    |
| `video-generation.services.ts` | videoGenerationService, keyframeGenerationService, faceSwapService, consistentVideoService, capabilitiesProbeService, providerCircuitManager, videoWorkerHeartbeatStore, videoJobHandler, videoJobWorker, videoJobSweeper, dlqReprocessorWorker, videoJobReconciler |
| `continuity.services.ts`       | continuitySessionService (gated — may be `null`)                                                                                                                                                                                                                    |
| `session.services.ts`          | sessionService, assetResolver, referenceImageProcessing                                                                                                                                                                                                             |
| `video-jobs.services.ts`       | requestIdempotency, video job processing                                                                                                                                                                                                                            |

Know this when debugging API responses or adding new client→server integrations.

## Feature Flags

| Flag                       | Default | Client Impact                                                                |
| -------------------------- | ------- | ---------------------------------------------------------------------------- |
| `ENABLE_CONVERGENCE=false` | `true`  | Continuity endpoints return errors. Continuity UI should degrade gracefully. |

## Route → Client API Map

Use this to find the correct client file for a given backend route. Do not create duplicate API clients.

| Route                                   | Server Route File                         | Client API/Service                                  |
| --------------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| `POST /api/optimize-stream`             | `optimize.routes.ts`                      | `services/PromptOptimizationApi.ts`                 |
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

API placement rules:

- `client/src/api/` — thin fetch wrappers (billingApi, storageApi, motionApi)
- `client/src/services/` — stateful clients with caching/retry (PromptOptimizationApi, EnhancementApi)
- `client/src/features/<name>/api/` — feature-scoped APIs (spanLabelingApi, continuity, preview)
- **Never** put fetch/axios calls directly in React components.

## Architecture pattern

- Follow preview feature pattern in client/src/features/preview/.
  - Orchestrator component (max ~500 lines, heuristic)
  - hooks/ using useReducer for state
  - api/ for fetch calls
  - components/ for UI pieces (max ~200 lines, heuristic)
- Use config/ for constants and utils/ for pure functions.

## Conventions

- Prefer functional components and hooks.
- Keep UI styling in Tailwind/@promptstudio/system and reuse existing components/styles when possible.
- If a change needs backend data, add the client call in client/src/api first.

## Commit Protocol (MANDATORY)

Before EVERY commit, run all three checks in order:

1. `npx tsc --noEmit` — must exit 0
2. `npx eslint --config config/lint/eslint.config.js . --quiet` — must have 0 errors
3. `npm run test:unit` — must pass all shards

If any check fails, DO NOT commit. Fix the failures first.

A pre-commit hook enforces checks 1-2 automatically. Run `bash scripts/install-hooks.sh` after cloning.

### Commit Scope Rules

- Maximum ~10 files per commit unless it's a mechanical refactor (rename, import path change).
- If a fix requires touching 20+ files, stop and reconsider — there's probably a root cause fix that touches 2-3 files.
- Never combine dependency upgrades with code changes in the same commit.

### Change Scope Limits

- Type changes to shared interfaces: must run `tsc --noEmit` BEFORE continuing to other files.
- If fixing types requires adding `| null` or `| undefined` to more than 3 interfaces, STOP — find the root cause instead of widening types.
- If a test fix requires changing the production type to make it pass, that's a production code change, not a test fix.
