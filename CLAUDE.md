# Vidra

Canonical engineering rules. Agent entrypoints link here; update this file before syncing a mirror. Product contracts live in [CONTEXT.md](CONTEXT.md). Read the applicable `client/CLAUDE.md` or `server/CLAUDE.md` before editing that layer.

Use current source, tests and `CONTEXT.md` for implementation scope. ADRs preserve historical decisions and may link to retired documents recoverable from Git history.

## Boundaries

- Client and server import their own code and `shared/`; neither imports the other.
- Shared code is pure types, schemas, constants and data utilities, without framework, network, database or filesystem dependencies. Run `npx tsc --noEmit` immediately after a shared contract change, before changing other files.
- Services use constructor injection and canonical domain imports. `container.resolve()` belongs only in DI configuration and route factories.
- Text LLM calls go through `aiService`. Cross-domain coordination belongs in a route factory or an orchestrator with explicit ports.
- Each text operation's model is chosen in `server/src/config/modelConfig.ts`; environment variables carry keys and timeouts, never model choices. Evaluate a candidate by pinning it in an eval run, then change the code.
- Client feature `api/` modules validate wire responses with Zod and transform when UI shapes differ. Fetch calls stay out of components. UI-only types belong to the feature.

## Current scope and behavior

Authoring, span labeling, suggestions, optimization, supplied reference admission, free pictures/clips and Sketch in `/app` remain active. Studio and the standalone Live editor retired into `/app` ([ADR-0027](docs/adr/0027-studio-and-the-live-editor-retire-into-app.md)); Studio records stay readable. Generic sessions, words/take ancestry, authentication, durable media grants, receipts, leases and attachment recovery support the loop.

Named asset/trigger libraries, depth/convergence, continuity generation, storyboards/character preprocessing, recommendation, coherence/observation endpoints, paid intake and broad replay workers are retired. Historical session/camera/model fields remain readable. `video-generation/refunds/` preserves the existing ledger and failed-refund recovery for previously charged jobs. Free intake reserves zero credits; a charged job without a refunder fails closed.

- Browsing and selection preserve working words/settings. Restore them through explicit **Reuse setup**.
- Repeatedly used panels persist across context changes; opening an unrelated panel does not close them.
- Dispatch snapshots visible words, inputs, model, settings and destination. A retry after a lost response reuses its authoritative receipt and original take identity.
- Durable completion precedes attachment. Attachment repair reuses stored media/destination without regeneration or refunds.
- Preserve the Studio daily spend cap and ledger that bound every native request, and the Sketch bounds. Free testing does not authorize paid offerings, provider spend or schedules.

The URL prefix `/api/preview` remains compatible with saved media. Say picture, clip or take for artifacts. Draft/render is a model tier, not lifecycle. Generation offers come from `shared/videoModels.ts`; historical ids and prompt compilation have separate contracts.

## Changes and checks

Preserve ADRs as project records. Cleanup must not delete or replace their history; describe current implementation status in `CONTEXT.md`.

Read impacted modules/contracts first. Follow the `studio/` frontend pattern and the thin orchestrator/specialized services pattern in `prompt-optimization/`. Split by responsibility, not line count. Preserve independently owned work and credential/environment files.

Use explicit exported/async return types, `unknown` and guards instead of `any`, and Zod at input/persistence boundaries. Prefer `undefined` except for deliberate nullable wire fields. If a type fix needs to widen more than three interfaces, find the root cause. Keep dependency upgrades and test infrastructure changes separate from production changes.

Add the smallest useful behavioral test. Auth, authorization, payment and user-data changes require a negative path. Exclusive tests retire with their implementation; tests for surviving data/recovery contracts stay. Server tests mock process-external boundaries (Firebase, SDKs, time, logging); client tests may mock their feature API.

Before **every commit**, all three gates must pass:

1. `npm run typecheck`
2. `npm run lint`
3. `npm run test:unit`

`npm run verify` runs these gates concurrently. A failed gate blocks a commit. There is no git pre-commit hook; run the gates yourself.

Assertions come from contracts; repair source unless the referenced contract has genuinely retired.

Before handoff, also run `npm run build`, and `npm run test:e2e` after UI changes. Emulator and native-media suites (`npm run test:integration`) run in CI. Run `npm run eval:golden-set` after span-labeling prompt or model changes. Run `npm run eval:improve-wording` (pin a candidate with `--provider`, `--model`, `--effort`) before changing Improve wording's model, effort or a profile's `wordingGuidance`.

## Runtime

Node 20+, ESM, React/Vite, Express/TypeScript. Commands live in `package.json`. Vite proxies `/api` to the API server; use that proxy in client URLs. Caches and the costly-route rate limiter are in-memory per instance; daily spend caps are the cost control.

Server startup needs valid Firebase Admin credentials via `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_SERVICE_ACCOUNT_PATH` or `GOOGLE_APPLICATION_CREDENTIALS`. Startup probes are skipped only in test mode. The Vite client runs independently, with API calls requiring the server.

Concurrent worktrees share main-checkout ports: run checks without servers there; browser/e2e work belongs in the main checkout or CI. Keep symlinked `.env` and credential files in place. Server-boot verification uses `NODE_ENV=test` and ephemeral ports.

For performance, establish a working baseline and measure one change at a time. Migrations require a clean dry run, expected counts/sample checks, explicit execution authorization and post-run verification.

## References

- [Service boundaries](docs/architecture/SERVICE_BOUNDARIES.md).
- [Media lifecycle](docs/architecture/admission-media-lifecycle.md).
- [Page 21 adoption](docs/design/page21-component-migration.md): current components/state journeys. Pages 22/23 do not authorize a new draft ownership model.
- [Issue tracker](docs/agents/issue-tracker.md) and [triage labels](docs/agents/triage-labels.md).
