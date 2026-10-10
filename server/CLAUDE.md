# Server

Follow [../CLAUDE.md](../CLAUDE.md). Express, TypeScript/tsx, ESM, Firebase Admin, optional Redis and Pino.

- Use constructor injection and canonical domain imports. Keep response shaping in thin routes and coordinate domains through explicit ports at registration.
- Validate requests with Zod; use canonical envelopes from `middleware/respond.ts` and typed domain errors for error middleware.
- Text LLM calls go through `aiService`; SDK construction belongs in `clients/`. Keep service-owned prompt templates beside their owner.
- `admission/idempotency/` owns durable receipts. `video-generation/runtime/` owns records, leases, completion, terminal evidence and clip attachment recovery.
- `video-generation/refunds/` retains legacy charged-job/refund-debt compatibility. Free intake reserves zero credits; charged jobs require a refunder.
- Generic sessions and shared schemas still read historical continuity/camera/provider fields. Their execution backends are retired.
- Preserve media ownership, signed-URL grants and original take/session/version identity during recovery.

Read [integration-test guidance](../.agents/skills/integration-test/SKILL.md) before writing integration tests. Registration/startup changes require the root bootstrap/DI gate. Logging reference: [LOGGING_PATTERNS.md](../docs/architecture/typescript/LOGGING_PATTERNS.md).
