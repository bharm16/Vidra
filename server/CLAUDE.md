# Server (Backend)

Express API server for the Vidra video prompt editor.

Commit protocol, TypeScript rules, and change scope limits are defined in the root `CLAUDE.md` — all rules apply here.
Root `AGENTS.md` rules apply here — especially the non-negotiable rules and commit protocol.

## Stack

- Node.js 20, Express, TypeScript via tsx
- ESM (`"type": "module"`)
- LLM providers: OpenAI, Gemini, Groq (routed through `aiService` only)
- Firebase Admin for auth and storage
- Stripe for payments
- Redis (optional) for caching
- Pino for structured logging

## Commands

```bash
npm run server      # Start dev server (port 3001)
npm run server:e2e  # Start server in test mode

# Integration test gate (run when modifying DI config, app.ts, server.ts, or server/index.ts):
PORT=0 npx vitest run tests/integration/bootstrap.integration.test.ts tests/integration/di-container.integration.test.ts --config config/test/vitest.integration.config.js
```

## Structure

```
server/
├── index.ts               # Entry point
├── src/
│   ├── app.ts             # Express app setup
│   ├── server.ts          # HTTP server wiring
│   ├── config/
│   │   └── services/      # DI registration (domain-scoped)
│   ├── services/          # Business logic (domain subdirectories)
│   ├── routes/            # HTTP route handlers
│   ├── clients/           # External API clients (LLM, etc.)
│   ├── llm/               # LLM orchestration and span labeling
│   ├── middleware/         # Express middleware
│   ├── schemas/           # Zod validation schemas
│   ├── contracts/         # Request/response contracts
│   └── utils/             # Shared helpers
```

## Architecture Pattern

Follow the **PromptOptimizationService** pattern in `server/src/services/prompt-optimization/`:

```
ServiceName/
├── ServiceNameService.ts  # Thin orchestrator (delegates, no business logic)
├── services/              # Specialized sub-services
│   ├── SubService1.ts
│   └── SubService2.ts
├── templates/             # External .md prompt templates
│   └── template.md
└── types.ts               # Service-specific types
```

## Conventions

### Routes

- Keep route handlers thin — all business logic in services
- Validate request body with Zod schemas
- Return consistent response shapes: `{ success: true, data }` or `{ success: false, error }`

### Services

- Single responsibility per service
- Inject dependencies via constructor — never call `container.resolve()` in service code
- Use external `.md` files for LLM prompt templates
- Structured logging with Pino

### LLM Access

- All LLM calls go through `aiService` — never call provider clients directly
- Provider clients live in `clients/` with adapters
- Rate limits and retries handled at client level

### Frontend-Backend Boundary

- **NEVER** import from `client/src/` — only from `#shared/*` or server-local code
- Routes return general-purpose DTOs, not shapes tailored to specific UI components
- If a server change seems to require a `shared/` type change, stop and ask whether a server-local type would suffice
- For genuine cross-layer changes: see `.claude/skills/cross-layer-change/SKILL.md`

### Error Handling

- Use typed error classes (ValidationError, NotFoundError, etc.)
- Log errors with context using Pino
- Return appropriate HTTP status codes

## Reference Docs

- Logging patterns: `docs/architecture/typescript/LOGGING_PATTERNS.md`
