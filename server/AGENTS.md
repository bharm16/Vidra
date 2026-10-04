# Server (Backend)

Express API server for Vidra.

Root `AGENTS.md` rules apply here — especially the non-negotiable rules and commit protocol.

## Stack

- Node.js 20, Express, TypeScript via tsx
- ESM (`"type": "module"`)
- LLM providers: OpenAI, Gemini, Groq (routed through `aiService` only)
- Firebase Admin for auth and storage
- Stripe for payments
- Redis (optional) for caching
- Pino for structured logging

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

## Service Placement

- Single domain logic (e.g., new enhancement feature) → extend the domain service
- Cross-domain coordination (e.g., preview + optimization) → orchestrator in routes or new orchestration service
- Request/response shaping only → keep in route handler
- Shared utility (pure function, no dependencies) → `utils/`
- Never import a service from another domain directory for reuse — extract to shared or use route-level orchestration

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

### Error Handling

- Use typed error classes (ValidationError, NotFoundError, etc.)
- Log errors with context using Pino
- Return appropriate HTTP status codes

### Boundary Rule

- **NEVER** import from `client/src/` — only from `#shared/*` or server-local code
- Routes return general-purpose DTOs, not shapes tailored to specific UI components
- If a server change seems to require a `shared/` type change, stop and ask whether a server-local type would suffice
