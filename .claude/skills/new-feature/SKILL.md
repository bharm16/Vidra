---
name: new-feature
description: Scaffold a new feature following Vidra's established architecture patterns. Use when the user asks to add a new feature, create a new service, or build a new UI component.
allowed-tools:
  - read_file
  - write_file
  - bash
  - grep
  - edit
---

## New Feature Scaffolding

### Frontend Feature (Client)

Follow the feature-slice pattern (orchestrator + hooks + api + components). Reference: `client/src/features/studio/`

```
client/src/features/<feature-name>/
├── <FeatureName>.tsx        # Orchestrator (~500 lines max, heuristic)
├── hooks/
│   └── use<FeatureName>.ts  # useReducer for state, discriminated union actions
├── api/
│   ├── schemas.ts           # Zod schemas for API response validation
│   └── <featureName>Api.ts  # Fetch wrappers (transform server DTOs → client types)
├── components/
│   └── <SubComponent>.tsx   # UI pieces (~200 lines max, heuristic)
├── types/
│   └── index.ts             # Client-only types (NOT in shared/)
└── config/
    └── constants.ts         # Feature constants
```

Rules:

- API calls only in `api/` — never fetch inline in components
- Zod-validate all API responses in `api/schemas.ts`
- UI components consume transformed client types, never raw server DTOs
- State via `useReducer` with discriminated union actions, not multiple `useState`

### Backend Service (Server)

Follow the **PromptOptimizationService** pattern. Reference: `server/src/services/prompt-optimization/`

```
server/src/services/<service-name>/
├── <ServiceName>Service.ts  # Thin orchestrator (delegates only, no business logic)
├── services/
│   └── <SubService>.ts      # Specialized sub-services
├── templates/
│   └── <template>.md        # External LLM prompt templates
└── types.ts                 # Service-specific types
```

Rules:

- Constructor injection for all dependencies
- LLM calls only through `aiService` — never call provider clients directly
- Prompt templates in external `.md` files, not inline strings
- Structured logging with Pino

### DI Registration

Register the new service in the appropriate file under `server/src/config/services/`:

| Domain                             | Registration File                                     |
| ---------------------------------- | ----------------------------------------------------- |
| Infrastructure (metrics, Firebase) | `core.services.ts`                                    |
| Infrastructure (cache)             | `cache.services.ts`                                   |
| Infrastructure (observability)     | `observability.services.ts`                           |
| Infrastructure (storage)           | `storage.services.ts`                                 |
| LLM clients                        | `llm.services.ts`                                     |
| Enhancement / analysis             | `enhancement.services.ts`, `optimization.services.ts` |
| Image generation                   | `image-generation.services.ts`                        |
| Video generation                   | `video-generation.services.ts`                        |
| Continuity                         | `continuity.services.ts`                              |
| Sessions                           | `session.services.ts`                                 |

After registration, add a route factory in `server/src/config/routes.config.ts`.

### Route Wiring

- Create `server/src/routes/<feature>.routes.ts`
- Register in `routes.config.ts`
- Add the Route → Service → Client API mapping to the root `CLAUDE.md` table

### Verification

```bash
npx tsc --noEmit
npx eslint --config config/lint/eslint.config.js . --quiet
npm run test:unit
PORT=0 npx vitest run tests/integration/di-container.integration.test.ts --config config/test/vitest.integration.config.js
```

The DI container integration test must still pass after adding a new service registration.
