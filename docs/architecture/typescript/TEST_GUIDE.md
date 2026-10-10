# Test guidance

Canonical gates and mock boundaries live in [CLAUDE.md](../../../CLAUDE.md).

## Unit and regression tests

Protect observable behavior at its smallest useful seam. Auth, authorization, payment/refund and user-data changes require negative paths. Tests beside a retired implementation retire with it; active receipt, media ownership, stored-record and attachment contracts remain tested.

Server regression tests mock process-external boundaries such as Firebase, SDKs, Redis, time and logging. Client tests may mock a feature's `api/` boundary. Avoid reproducing a service's internal implementation in assertions.

Run selected paths with `npx vitest run <path> --config config/test/vitest.unit.config.js`, then run the required complete gates. Use bounded workers under resource pressure; report actual failures and skips.

## Replay

`npm run test:replay` runs the authoring and cross-mode golden paths and their outbound guard. A passing replay proves fixture-backed wiring and recovery, not current provider availability, quality or hosted qualification. Preserve the outbound guard and honest fixture provenance.

## Part 3: Integration contracts

Read registrations, routes, schemas and ports before writing assertions. Test startup, DI resolution, actual request validation/ownership, and data round trips against their promised contracts. Fix source when it breaks that promise; update tests only when the contract genuinely changes or retires.

For DI/startup/lifecycle changes:

```bash
PORT=0 npx vitest run tests/integration/bootstrap.integration.test.ts tests/integration/di-container.integration.test.ts --config config/test/vitest.integration.config.js
```

Cross-mode replay and real-adapter/emulator qualification remain distinct suites. Use the existing suites/configuration instead of bypassing a failed gate or relaxing assertions. External infrastructure absence is reported as a skip/non-verification, not a passing partial proof.

## Current ownership

- Admission/claims: `server/src/services/admission/` and `admission/idempotency/`.
- Video execution/attachment: `server/src/services/video-generation/runtime/`.
- Legacy refund/debt compatibility: `server/src/services/video-generation/refunds/`.
- Generic sessions and durable media: session, storage and owned-media services.

Current acceptance examples are the free HTTP intake contracts in `tests/unit/`, the admission/runtime tests beside their owners, and `tests/integration/cross-mode-golden-path.integration.test.ts`. Retired credit/payment/continuity/depth endpoints are not test scaffolding targets.
