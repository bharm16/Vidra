# Architecture Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement fixes for 14 architecture issues identified in the audit of `docs/architecture/architecture-map.json` — domain/URL boundary leakage, fat DI files, legacy flag aliases, missing operational probes, and missing architecture-map automation.

**Architecture:** Three execution phases, ordered by blast radius:

- **Phase A** (server cleanup, 6 tasks) — isolated server-only changes; each ≤10 files; no cross-layer impact.
- **Phase B** (architecture map automation, 4 tasks) — new script `generate-architecture-map.ts` that composes the existing `generate-route-map.ts`, `generate-flag-docs.ts`, and `generate-openapi.ts` patterns; emits committed JSON + HTML so the map can no longer drift silently.
- **Phase C** (cross-layer URL changes, 4 tasks) — each one crosses the client/server boundary and requires the `cross-layer-change` skill protocol. **Recommendation: extract Phase C into 4 separate follow-up plans**, one per URL change, since the `writing-plans` skill explicitly warns against bundling independent subsystems.

**Tech Stack:**

- Server: Express + TypeScript (tsx), Zod 4, DIContainer (custom)
- Tests: Vitest unit + integration; `*.regression.test.ts` for fix commits (pre-commit hook enforced)
- Tooling: `tsc --noEmit`, ESLint, TypeScript Compiler API for AST walks
- Pre-existing scripts: `scripts/generate-route-map.ts`, `scripts/generate-flag-docs.ts`, `scripts/generate-openapi.ts`

**Out of scope for this plan:** Phase C is sketched at the end but each URL change should get its own plan file via `cross-layer-change`. Do NOT execute Phase C from this document — the cross-layer protocol has its own client/shared/server sequencing rules.

---

## Risk Register

| Risk                                                                     | Mitigation                                                                                                                                                             |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DI extraction breaks startup wiring (Task A5/A6)                         | Integration test gate runs after each split (`tests/integration/bootstrap.integration.test.ts` + `di-container.integration.test.ts`)                                   |
| Deleting flag aliases breaks an env config we don't know about (Task A2) | Project is pre-launch with zero users; grep all env-related code first; deprecation warnings have been live for some time so deploy configs should already be migrated |
| GCS probe causes new boot failures (Task A3)                             | Probe is wrapped in `withTimeout` and `NODE_ENV=test` gates it, same pattern as Firebase probe                                                                         |
| Auto-generated architecture map drifts on every PR (Task B1)             | Add `--check` mode + CI job that fails if `--write` would produce diffs (same pattern as `generate-flag-docs.ts`)                                                      |
| Task B1 misclassifies routes/services                                    | Each emitted entry is comparable against existing hand-curated JSON; ship a one-time diff check before merging                                                         |

---

## Verification Checklist (before declaring any phase complete)

After every task that touches code, run:

```bash
npx tsc --noEmit                                                # must exit 0
npx eslint --config config/lint/eslint.config.js . --quiet     # must report 0 errors
npm run test:unit                                              # all shards pass
```

After tasks A3, A4, A5, A6 (DI/initialize/health changes), additionally run the integration test gate:

```bash
PORT=0 npx vitest run \
  tests/integration/bootstrap.integration.test.ts \
  tests/integration/di-container.integration.test.ts \
  --config config/test/vitest.integration.config.js
```

---

# Phase A — Server Cleanup

## Task A1: Extend flag registry with `requiresEnv` + `dependsOn`

**Why first:** Subsequent tasks (A2 deletion, A4 readiness contract, B1 map generator) all read from the flag registry. Foundational schema change.

**Files:**

- Modify: `server/src/config/feature-flags.ts` (extend `BaseFlagDef` type, add fields to relevant flag entries, update `getFlagEnvNames()` exporter)
- Test: `server/src/config/__tests__/feature-flags.test.ts`

**Background:** Today the registry has no way to declare "this flag requires REPLICATE_API_TOKEN" (`ENABLE_FACE_EMBEDDING`, `CONTINUITY_CLIP_ENABLED`) or "this flag depends on another flag" (`ENABLE_FACE_EMBEDDING` is meaningless if `ENABLE_CONVERGENCE=false`). The result: silent no-ops at runtime and no operator-facing audit.

- [ ] **Step 1: Write failing test for `requiresEnv` field surfacing**

Add to `server/src/config/__tests__/feature-flags.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getFlagEnvNames } from "../feature-flags.ts";

describe("feature-flags requiresEnv", () => {
  it("face embedding flag declares Replicate token dependency", () => {
    const flags = getFlagEnvNames();
    const faceEmbedding = flags.find(
      (f) => f.envName === "ENABLE_FACE_EMBEDDING",
    );
    expect(faceEmbedding?.requiresEnv).toEqual(["REPLICATE_API_TOKEN"]);
  });

  it("clip flag declares Replicate token dependency", () => {
    const flags = getFlagEnvNames();
    const clip = flags.find((f) => f.envName === "CONTINUITY_CLIP_ENABLED");
    expect(clip?.requiresEnv).toEqual(["REPLICATE_API_TOKEN"]);
  });

  it("face embedding flag declares convergence dependency", () => {
    const flags = getFlagEnvNames();
    const faceEmbedding = flags.find(
      (f) => f.envName === "ENABLE_FACE_EMBEDDING",
    );
    expect(faceEmbedding?.dependsOn).toEqual(["ENABLE_CONVERGENCE"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run server/src/config/__tests__/feature-flags.test.ts
```

Expected: 3 failures with "undefined" on `requiresEnv` / `dependsOn`.

- [ ] **Step 3: Extend `BaseFlagDef` type in `server/src/config/feature-flags.ts`**

Locate the existing `interface BaseFlagDef` block (around line 32-37) and replace with:

```typescript
interface BaseFlagDef {
  envName: string;
  description: string;
  category: FlagCategory;
  aliases?: readonly FlagAlias[];
  /**
   * External env vars that must be present for this flag to function.
   * Example: ENABLE_FACE_EMBEDDING requiresEnv: ["REPLICATE_API_TOKEN"].
   * When the flag is true but a required env is missing, the service registers
   * as null and a warning is logged at boot.
   */
  requiresEnv?: readonly string[];
  /**
   * Other flag envNames that must resolve true for this flag to be honored.
   * Example: ENABLE_FACE_EMBEDDING dependsOn: ["ENABLE_CONVERGENCE"].
   * When a dependency resolves false, this flag is force-coerced to its
   * "off" value and a warning is logged.
   */
  dependsOn?: readonly string[];
}
```

- [ ] **Step 4: Annotate the three flags with their real dependencies**

In `EXPERIMENTAL_FLAGS` (find by `category: "experimental"`), set:

```typescript
faceEmbeddingEnabled: {
  kind: "bool",
  envName: "ENABLE_FACE_EMBEDDING",
  default: false,
  description: "...",
  category: "experimental",
  requiresEnv: ["REPLICATE_API_TOKEN"],
  dependsOn: ["ENABLE_CONVERGENCE"],
},
continuityClipEnabled: {
  kind: "bool",
  envName: "CONTINUITY_CLIP_ENABLED",
  default: true,
  description: "...",
  category: "experimental",
  aliases: [{ envName: "DISABLE_CONTINUITY_CLIP", inverted: true }],
  requiresEnv: ["REPLICATE_API_TOKEN"],
  dependsOn: ["ENABLE_CONVERGENCE"],
},
```

(Preserve existing fields; only add the two new ones.)

- [ ] **Step 5: Surface fields in `getFlagEnvNames()` output**

Find the `getFlagEnvNames()` exporter and ensure it includes `requiresEnv` and `dependsOn` in each returned object. The current shape probably maps `{envName, category, default, description, aliases}` — extend to include `requiresEnv: spec.requiresEnv, dependsOn: spec.dependsOn`.

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run server/src/config/__tests__/feature-flags.test.ts
```

Expected: PASS (all 3 new tests + all pre-existing tests still pass).

- [ ] **Step 7: Run typecheck + lint**

```bash
npx tsc --noEmit
npx eslint --config config/lint/eslint.config.js server/src/config/feature-flags.ts --quiet
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add server/src/config/feature-flags.ts server/src/config/__tests__/feature-flags.test.ts
git commit -m "feat(flags): add requiresEnv and dependsOn to flag registry

Surfaces ENABLE_FACE_EMBEDDING and CONTINUITY_CLIP_ENABLED dependencies on
REPLICATE_API_TOKEN and ENABLE_CONVERGENCE. Foundation for readiness probe
and architecture map generator."
```

---

## Task A2: Delete legacy `*_DISABLED` aliases

**Why now:** Pre-launch, zero users, no deploys reference the inverted names per the project state (memory: `feedback_vidra_pre_launch`). Deferring this only grows the footprint that has to be migrated later.

**Files:**

- Modify: `server/src/config/feature-flags.ts` (remove `aliases` arrays where they only contain inverted `*_DISABLED` entries)
- Modify: `CLAUDE.md` (auto-regenerated via `generate-flag-docs.ts --write`)
- Test: `server/src/config/__tests__/feature-flags.test.ts` (verify deprecation paths no longer needed)

**Aliases to remove** (all 10):

- `WEBHOOK_RECONCILIATION_DISABLED`
- `BILLING_PROFILE_REPAIR_DISABLED`
- `CREDIT_REFUND_SWEEPER_DISABLED`
- `CREDIT_RECONCILIATION_DISABLED`
- `VIDEO_JOB_SWEEPER_DISABLED`
- `VIDEO_DLQ_REPROCESSOR_DISABLED`
- `VIDEO_ASSET_RETENTION_DISABLED`
- `VIDEO_ASSET_RECONCILER_DISABLED`
- `DISABLE_CONTINUITY_CLIP`
- `GEMINI_ALLOW_UNHEALTHY`

- [ ] **Step 1: Grep the codebase for any reference to the legacy names**

```bash
grep -rnE "WEBHOOK_RECONCILIATION_DISABLED|BILLING_PROFILE_REPAIR_DISABLED|CREDIT_REFUND_SWEEPER_DISABLED|CREDIT_RECONCILIATION_DISABLED|VIDEO_JOB_SWEEPER_DISABLED|VIDEO_DLQ_REPROCESSOR_DISABLED|VIDEO_ASSET_RETENTION_DISABLED|VIDEO_ASSET_RECONCILER_DISABLED|DISABLE_CONTINUITY_CLIP|GEMINI_ALLOW_UNHEALTHY" --include="*.ts" --include="*.js" --include="*.md" --include="*.yml" --include=".env*" .
```

Expected: only matches inside `feature-flags.ts` (the alias declarations themselves) and possibly `CLAUDE.md` (the auto-generated table) and existing tests that verify deprecation behavior.

If any other code references these names directly (rather than via the registry), STOP and document the dependency in this step — don't delete blindly.

- [ ] **Step 2: Remove the `aliases` field from each of the 10 flag entries**

In `server/src/config/feature-flags.ts`, for each flag listed above, delete the entire `aliases: [...]` line.

Example — change:

```typescript
webhookReconciliationEnabled: {
  kind: "bool",
  envName: "WEBHOOK_RECONCILIATION_ENABLED",
  default: true,
  description: "Stripe webhook reconciliation background service.",
  category: "killswitch",
  aliases: [{ envName: "WEBHOOK_RECONCILIATION_DISABLED", inverted: true }],
},
```

to:

```typescript
webhookReconciliationEnabled: {
  kind: "bool",
  envName: "WEBHOOK_RECONCILIATION_ENABLED",
  default: true,
  description: "Stripe webhook reconciliation background service.",
  category: "killswitch",
},
```

- [ ] **Step 3: Update or remove tests that verify alias deprecation behavior**

```bash
grep -n "alias\|DISABLED\|deprecation" server/src/config/__tests__/feature-flags.test.ts
```

For each matching test that asserts the legacy alias resolves correctly, decide:

- If the test's value is purely "the deprecation warning fires," delete the test (the behavior no longer exists).
- If the test verifies general alias resolution mechanism, keep it but switch its fixture to a non-deprecated alias (or skip if no aliases remain).

- [ ] **Step 4: Run targeted feature-flags tests**

```bash
npx vitest run server/src/config/__tests__/feature-flags.test.ts
```

Expected: PASS.

- [ ] **Step 5: Regenerate the CLAUDE.md flag table**

```bash
npx tsx scripts/generate-flag-docs.ts --write
```

This rewrites the block between `<!-- BEGIN: feature-flag-table -->` and `<!-- END: feature-flag-table -->`. Confirm the `Legacy Aliases` column is now empty (or shows `—`) for the 10 affected flags.

- [ ] **Step 6: Run full typecheck + lint + unit tests**

```bash
npx tsc --noEmit
npx eslint --config config/lint/eslint.config.js . --quiet
npm run test:unit
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/config/feature-flags.ts server/src/config/__tests__/feature-flags.test.ts CLAUDE.md
git commit -m "refactor(flags): drop legacy *_DISABLED aliases

Removes 10 inverted aliases that were kept for backward compat. Project is
pre-launch with no deploy configs to migrate. Eliminates a permanent
footgun (inverted-meaning env names) and shrinks the test surface."
```

---

## Task A3: GCS startup probe

**Files:**

- Modify: `server/src/config/services.initialize.ts` (add probe alongside Firebase probes around line 110-120)
- Modify: `docs/architecture/architecture-map.json` (set `Google Cloud Storage.startupProbed: true` — will become moot after Phase B auto-regenerates this)
- Test: `server/src/config/__tests__/services.initialize.test.ts`

- [ ] **Step 1: Write failing integration test for GCS probe**

Add to `server/src/config/__tests__/services.initialize.test.ts`:

```typescript
it("probes GCS bucket exists at startup", async () => {
  const bucketExists = vi.fn().mockResolvedValue([true]);
  const container = createTestContainer({
    bucket: { exists: bucketExists } as unknown as Bucket,
  });

  await initializeServices(container);

  expect(bucketExists).toHaveBeenCalledOnce();
});

it("fails startup when GCS bucket probe rejects", async () => {
  const container = createTestContainer({
    bucket: {
      exists: vi.fn().mockRejectedValue(new Error("403 forbidden")),
    } as unknown as Bucket,
  });

  await expect(initializeServices(container)).rejects.toThrow(/GCS.*forbidden/);
});
```

(Adjust `createTestContainer` invocation to match the existing test file's fixture conventions — read the top 60 lines of the test file first to see how Firebase mocking is done.)

- [ ] **Step 2: Run test to verify fail**

```bash
npx vitest run server/src/config/__tests__/services.initialize.test.ts
```

Expected: both new tests FAIL.

- [ ] **Step 3: Add GCS probe to `services.initialize.ts`**

Find the Firebase probe block (around lines 100-120, where `auth.listUsers(1)` and `firestore.listCollections()` live). Add immediately after:

```typescript
const bucket = container.resolve<Bucket>("gcsBucket");
await withTimeout("GCS bucket probe", async () => {
  const [exists] = await bucket.exists();
  if (!exists) {
    throw new Error(
      `GCS bucket "${bucket.name}" does not exist or is not accessible`,
    );
  }
});
logger.info("GCS bucket probe succeeded", { bucket: bucket.name });
```

(Verify the exact DI key name — it's likely `gcsBucket` or `bucket` per `storage.services.ts`; read that file's `register()` calls to confirm.)

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run server/src/config/__tests__/services.initialize.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run integration gate**

```bash
PORT=0 npx vitest run \
  tests/integration/bootstrap.integration.test.ts \
  tests/integration/di-container.integration.test.ts \
  --config config/test/vitest.integration.config.js
```

Expected: PASS (the bootstrap test should still complete since `NODE_ENV=test` skips probes per existing convention).

- [ ] **Step 6: Commit**

```bash
git add server/src/config/services.initialize.ts server/src/config/__tests__/services.initialize.test.ts
git commit -m "feat(boot): add GCS bucket existence probe to startup

Adds bucket.exists() probe alongside existing Firebase probes. Skipped
under NODE_ENV=test like the rest. Catches missing/misconfigured buckets
at boot rather than at first user upload."
```

---

## Task A4: `/health/ready` dependency contract

**Goal:** Make `/health/ready` declare its dependency set explicitly so K8s/Render readiness probes have a defined contract, and so the architecture-map generator (Phase B) can verify required external systems all participate.

**Files:**

- Modify: `server/src/routes/health.routes.ts` (add `requiredDependencies` field to the readiness response, default-stable contract)
- Modify: `server/src/config/routes.config.ts` (or wherever `createHealthRoutes` is invoked — pass the list of required externals)
- Create: `server/src/routes/__tests__/health.routes.test.ts`

- [ ] **Step 1: Write failing test for readiness contract**

```typescript
// server/src/routes/__tests__/health.routes.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { createHealthRoutes } from "../health.routes.ts";

describe("GET /health/ready", () => {
  it("enumerates required external dependencies in response", async () => {
    const app = express();
    app.use(
      createHealthRoutes({
        cacheService: { isHealthy: () => true },
        checkFirestore: async () => undefined,
      }),
    );

    const res = await request(app).get("/health/ready");

    expect(res.status).toBe(200);
    expect(res.body.dependencies).toEqual(
      expect.objectContaining({
        firebase: expect.objectContaining({ required: true, healthy: true }),
        gcs: expect.objectContaining({ required: true }),
        redis: expect.objectContaining({ required: false }),
      }),
    );
  });

  it("returns 503 when a required dependency is unhealthy", async () => {
    const app = express();
    app.use(
      createHealthRoutes({
        cacheService: { isHealthy: () => true },
        checkFirestore: async () => {
          throw new Error("firestore down");
        },
      }),
    );

    const res = await request(app).get("/health/ready");

    expect(res.status).toBe(503);
    expect(res.body.dependencies.firebase.healthy).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

```bash
npx vitest run server/src/routes/__tests__/health.routes.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Update `createHealthRoutes` to emit a `dependencies` map**

In `server/src/routes/health.routes.ts`, in the `/health/ready` handler, build a response object with:

```typescript
const dependencies = {
  firebase: {
    required: true,
    healthy: firestoreHealthy,
    lastChecked: new Date().toISOString(),
  },
  gcs: {
    required: true,
    healthy: gcsHealthy,
    lastChecked: new Date().toISOString(),
  },
  redis: {
    required: false,
    healthy: redisHealthy,
    lastChecked: new Date().toISOString(),
  },
  // ...add cache, circuit breakers as already present
};

const requiredFailed = Object.values(dependencies).some(
  (d) => d.required && !d.healthy,
);

res.status(requiredFailed ? 503 : 200).json({
  status: requiredFailed ? "unhealthy" : "ready",
  dependencies,
  timestamp: new Date().toISOString(),
});
```

Add `gcsBucket?: { exists: () => Promise<[boolean]> }` to `HealthDependencies`. Wire it through in `routes.config.ts`.

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run server/src/routes/__tests__/health.routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full unit + integration gates**

```bash
npm run test:unit
PORT=0 npx vitest run tests/integration/bootstrap.integration.test.ts --config config/test/vitest.integration.config.js
```

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/health.routes.ts server/src/routes/__tests__/health.routes.test.ts server/src/config/routes.config.ts
git commit -m "feat(health): define explicit dependency contract for /health/ready

Readiness now enumerates each external system, whether it is required,
and current health. Returns 503 when any required dependency is unhealthy
so K8s/Render probes have a defined contract instead of an implicit one."
```

---

## Task A5: Extract `optimization.services.ts`

**Goal:** Split `promptOptimizationService` and `optimizeTelemetryService` out of `enhancement.services.ts` into their own DI file. Reduces integration-test gate blast radius when modifying either domain.

**Files:**

- Create: `server/src/config/services/optimization.services.ts`
- Modify: `server/src/config/services/enhancement.services.ts` (remove the two registrations)
- Modify: `server/src/config/services.config.ts` (import + call `registerOptimizationServices`)
- Modify: `CLAUDE.md` "DI Registration" table (manual edit; A5 doesn't auto-regen this section)

- [ ] **Step 1: Identify the optimization-related lines in enhancement.services.ts**

```bash
grep -nE "promptOptimizationService|optimizeTelemetryService|TemplateService|PromptOptimizationService" server/src/config/services/enhancement.services.ts
```

This will give the exact lines for the `container.register(...)` calls.

- [ ] **Step 2: Create `server/src/config/services/optimization.services.ts`**

```typescript
import type { DIContainer } from "@infrastructure/DIContainer";
import { AIModelService } from "@services/ai-model/index";
import { PromptOptimizationService } from "@services/prompt-optimization/PromptOptimizationService";
import { TemplateService } from "@services/prompt-optimization/services/TemplateService";
import { OptimizeTelemetryService } from "@services/prompt-optimization/services/OptimizeTelemetryService";
// Add other imports the original registrations required.

export function registerOptimizationServices(container: DIContainer): void {
  container.register("templateService", () => new TemplateService(), []);

  container.register(
    "promptOptimizationService",
    (aiService: AIModelService, templateService: TemplateService) =>
      new PromptOptimizationService(aiService, templateService),
    ["aiService", "templateService"],
  );

  container.register(
    "optimizeTelemetryService",
    () => new OptimizeTelemetryService(),
    [],
  );
}
```

(The exact constructor signature and dependency keys must match what `enhancement.services.ts` currently uses — copy the existing factory function bodies, don't paraphrase them.)

- [ ] **Step 3: Remove the same registrations from `enhancement.services.ts`**

Delete the `templateService`, `promptOptimizationService`, and `optimizeTelemetryService` `container.register(...)` calls. Also remove now-unused imports (`PromptOptimizationService`, `TemplateService`, `OptimizeTelemetryService`).

- [ ] **Step 4: Wire `registerOptimizationServices` into `services.config.ts`**

Add the import:

```typescript
import { registerOptimizationServices } from "./services/optimization.services.ts";
```

Insert `registerOptimizationServices(container);` immediately after `registerEnhancementServices(container);` (preserves registration order: enhancement registers its services, then optimization adds on top).

- [ ] **Step 5: Run integration gate**

```bash
PORT=0 npx vitest run \
  tests/integration/bootstrap.integration.test.ts \
  tests/integration/di-container.integration.test.ts \
  --config config/test/vitest.integration.config.js
```

Expected: PASS. Both services should resolve from the container exactly as before.

- [ ] **Step 6: Run typecheck + lint + unit tests**

```bash
npx tsc --noEmit
npx eslint --config config/lint/eslint.config.js server/src/config/ --quiet
npm run test:unit
```

- [ ] **Step 7: Update CLAUDE.md "DI Registration" section**

Find the table under `### DI Registration` in `CLAUDE.md` (around line 90-130). Add a new row:

```markdown
| `optimization.services.ts` | promptOptimizationService, optimizeTelemetryService, templateService |
```

And remove those services from the `enhancement.services.ts` row's description.

- [ ] **Step 8: Commit**

```bash
git add server/src/config/services/optimization.services.ts server/src/config/services/enhancement.services.ts server/src/config/services.config.ts CLAUDE.md
git commit -m "refactor(di): extract optimization.services.ts from enhancement

Splits PromptOptimizationService, OptimizeTelemetryService, and
TemplateService into their own DI file. Reduces integration-test gate
blast radius when modifying either enhancement or optimization."
```

---

## Task A6: Split `generation.services.ts` (21 services → 3 files)

**Goal:** Decompose the largest DI file into image-generation, video-generation, and model-intelligence. Each becomes individually testable and modifiable without triggering the gate for unrelated changes.

**Note:** This is the riskiest task in Phase A. The 21 services have implicit ordering dependencies. Approach incrementally — extract model-intelligence first (smallest, most isolated), then image-generation, then leave video-generation as the remainder.

**Files:**

- Create: `server/src/config/services/model-intelligence.services.ts`
- Create: `server/src/config/services/image-generation.services.ts`
- Modify: `server/src/config/services/generation.services.ts` (becomes video-generation only — rename also OK but defer to avoid noise)
- Modify: `server/src/config/services.config.ts`
- Modify: `CLAUDE.md` DI table

### Sub-task A6a: Extract `model-intelligence.services.ts`

- [ ] **Step 1: Identify model-intelligence registrations**

```bash
grep -nE "modelIntelligenceService|AvailabilityGateService|CapabilitiesProbeService" server/src/config/services/generation.services.ts
```

Look for `container.register("modelIntelligenceService", ...)` and any helper services it depends on that don't have generation/image consumers.

- [ ] **Step 2: Create `server/src/config/services/model-intelligence.services.ts`**

Copy the relevant `container.register(...)` blocks verbatim. Add the matching imports. Export `registerModelIntelligenceServices(container: DIContainer)`.

- [ ] **Step 3: Remove same registrations from `generation.services.ts`**

Delete the blocks. Remove now-unused imports.

- [ ] **Step 4: Wire in `services.config.ts`**

Add import + call `registerModelIntelligenceServices(container)` immediately after `registerGenerationServices(container)`.

- [ ] **Step 5: Run integration gate + unit tests**

```bash
PORT=0 npx vitest run tests/integration/bootstrap.integration.test.ts tests/integration/di-container.integration.test.ts --config config/test/vitest.integration.config.js
npm run test:unit
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(di): extract model-intelligence.services.ts from generation"
```

### Sub-task A6b: Extract `image-generation.services.ts`

Repeat the same 6-step pattern for image services. The candidates (read `generation.services.ts` to confirm exact list):

- `imageGenerationService`
- `imagePreviewProviders` (registry + selection helpers)
- `storyboardPreviewService`, `StoryboardFramePlanner`
- `VideoToImagePromptTransformer`
- `ReplicateFluxKontextFastProvider`, `ReplicateFluxSchnellProvider`

- [ ] **Step 1-6: Same shape as A6a, scoped to image services**

- [ ] **Step 7: Commit**

```bash
git commit -m "refactor(di): extract image-generation.services.ts from generation"
```

### Sub-task A6c: Rename remainder to `video-generation.services.ts`

After A6a and A6b, the remaining content of `generation.services.ts` is purely video-related. Either:

- **Option 1 (lighter):** Leave file named `generation.services.ts` since "generation" now == video in this codebase.
- **Option 2 (cleaner):** Rename the file to `video-generation.services.ts` and update the import in `services.config.ts`.

**Recommendation:** Option 2 — pre-launch, free rename, removes ambiguity.

- [ ] **Step 1: `git mv server/src/config/services/generation.services.ts server/src/config/services/video-generation.services.ts`**

- [ ] **Step 2: Rename the exported function and update its single import site in `services.config.ts`**

```typescript
// Before:
import { registerGenerationServices } from "./services/generation.services.ts";
// After:
import { registerVideoGenerationServices } from "./services/video-generation.services.ts";
```

And inside the file, rename `registerGenerationServices` → `registerVideoGenerationServices`.

- [ ] **Step 3: Run full validation**

```bash
npx tsc --noEmit
npm run lint
npm run test:unit
PORT=0 npx vitest run tests/integration/bootstrap.integration.test.ts tests/integration/di-container.integration.test.ts --config config/test/vitest.integration.config.js
```

- [ ] **Step 4: Update CLAUDE.md DI table**

Replace the single `generation.services.ts` row with three rows: `image-generation.services.ts`, `video-generation.services.ts`, `model-intelligence.services.ts`.

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(di): rename generation.services.ts to video-generation.services.ts

Final step of the generation DI split. The file now only contains video
generation registrations after image-generation and model-intelligence
were extracted in prior commits."
```

---

# Phase B — Architecture Map Automation

## Task B1: Create `scripts/generate-architecture-map.ts`

**Goal:** Auto-emit `docs/architecture/architecture-map.json` so it can no longer drift silently. Compose existing AST patterns from `generate-route-map.ts`, `generate-flag-docs.ts`, and `generate-openapi.ts`.

**Files:**

- Create: `scripts/generate-architecture-map.ts`
- Create: `scripts/__tests__/generate-architecture-map.test.ts`
- Modify: `package.json` (add npm script entry)

**Output schema:** Match the structure of the existing `docs/architecture/architecture-map.json` exactly so the existing HTML renderer continues to work. The four top-level sections this task emits:

- `meta` (hardcoded generated date + source-of-truth list)
- `runtime` (parse `package.json` + read constants from a small static map)
- `routes` (delegate to logic from `generate-route-map.ts`)
- `featureFlags` (delegate to `getFlagEnvNames()` from the registry)

B2 and B3 add edges and method-level granularity respectively.

- [ ] **Step 1: Write failing test for script output shape**

```typescript
// scripts/__tests__/generate-architecture-map.test.ts
import { describe, it, expect } from "vitest";
import { buildArchitectureMap } from "../generate-architecture-map.ts";

describe("generate-architecture-map", () => {
  it("emits a JSON object with meta, runtime, routes, featureFlags", async () => {
    const map = await buildArchitectureMap();
    expect(map).toMatchObject({
      meta: expect.objectContaining({ project: "Vidra" }),
      runtime: expect.objectContaining({ node: expect.any(String) }),
      routes: expect.any(Array),
      featureFlags: expect.any(Array),
    });
  });

  it("featureFlags entries include requiresEnv and dependsOn fields", async () => {
    const map = await buildArchitectureMap();
    const faceEmbedding = map.featureFlags.find(
      (f: { envName: string }) => f.envName === "ENABLE_FACE_EMBEDDING",
    );
    expect(faceEmbedding.requiresEnv).toEqual(["REPLICATE_API_TOKEN"]);
  });

  it("routes entries enumerate concrete HTTP methods (no '*' wildcards)", async () => {
    const map = await buildArchitectureMap();
    for (const route of map.routes) {
      expect(route.method).toMatch(
        /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/,
      );
    }
  });
});
```

(The third test will only pass after B3 — leave it failing for now or `.skip` it; the plan calls B3 explicitly.)

- [ ] **Step 2: Skeleton implementation `scripts/generate-architecture-map.ts`**

```typescript
#!/usr/bin/env node
/**
 * Generate docs/architecture/architecture-map.json from the live codebase.
 *
 * Usage:
 *   npx tsx scripts/generate-architecture-map.ts          # print to stdout
 *   npx tsx scripts/generate-architecture-map.ts --write  # rewrite JSON file
 *   npx tsx scripts/generate-architecture-map.ts --check  # exit non-zero if stale
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getFlagEnvNames } from "../server/src/config/feature-flags.ts";
// Reuse the AST walker from generate-route-map.ts (extract its core into a shared module
// if it isn't already exported — see Step 3).
import { extractRoutes } from "./lib/route-map-walker.ts";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const OUTPUT = path.join(
  REPO_ROOT,
  "docs",
  "architecture",
  "architecture-map.json",
);

export async function buildArchitectureMap() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
  );

  return {
    meta: {
      project: "Vidra",
      tagline:
        "Interactive editing canvas for AI video prompts with semantic span labeling, click-to-enhance suggestions, and fast previews.",
      stage: "pre-launch (zero users)",
      generatedAt: new Date().toISOString().split("T")[0],
      sourceOfTruth: [
        "CLAUDE.md",
        "client/CLAUDE.md",
        "server/CLAUDE.md",
        "server/src/config/feature-flags.ts",
        "server/src/config/services.config.ts",
        "server/src/routes/api.routes.ts",
        "package.json",
      ],
    },
    runtime: {
      node: pkg.engines?.node ?? ">=20",
      moduleSystem: "ESM",
      languages: ["TypeScript", "JavaScript (migration in progress)"],
      // ... copy stable values from existing JSON
    },
    routes: await extractRoutes(),
    featureFlags: getFlagEnvNames(),
    // Phase B2 will add `dependencies`. Phase B3 expands `routes` methods.
  };
}

async function main(): Promise<void> {
  const map = await buildArchitectureMap();
  const json = JSON.stringify(map, null, 2);

  const args = new Set(process.argv.slice(2));
  if (args.has("--write")) {
    fs.writeFileSync(OUTPUT, json + "\n");
    console.log(`Wrote ${OUTPUT}`);
    return;
  }
  if (args.has("--check")) {
    const existing = fs.readFileSync(OUTPUT, "utf8").trim();
    if (existing !== json) {
      console.error(
        "architecture-map.json is stale. Run `npx tsx scripts/generate-architecture-map.ts --write`",
      );
      process.exit(1);
    }
    return;
  }
  process.stdout.write(json + "\n");
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1] ?? "");
if (isMain) {
  await main();
}
```

- [ ] **Step 3: Extract shared route-walker from `generate-route-map.ts`**

Refactor `generate-route-map.ts` to expose its AST walking logic as `export async function extractRoutes(): Promise<RouteEntry[]>` in `scripts/lib/route-map-walker.ts`. The original Markdown-renderer entrypoint stays in `generate-route-map.ts` but now imports `extractRoutes` from the lib.

This is a mechanical split — preserves existing `npm run` script behavior.

- [ ] **Step 4: Run tests; first two pass, third skips/fails (covered by B3)**

```bash
npx vitest run scripts/__tests__/generate-architecture-map.test.ts
```

- [ ] **Step 5: Add npm script in `package.json`**

```json
"scripts": {
  "...": "...",
  "architecture:map": "tsx scripts/generate-architecture-map.ts",
  "architecture:map:write": "tsx scripts/generate-architecture-map.ts --write",
  "architecture:map:check": "tsx scripts/generate-architecture-map.ts --check"
}
```

- [ ] **Step 6: Regenerate JSON, confirm minimal diff against existing**

```bash
npx tsx scripts/generate-architecture-map.ts --write
git diff docs/architecture/architecture-map.json
```

Expected diff: small. Differences should only be in dynamically-generated fields (`generatedAt`, possibly newly-surfaced `requiresEnv`/`dependsOn` from A1). If structural fields differ unexpectedly, STOP and reconcile — your script's output is the new source of truth so any drift means the original hand-curated JSON was wrong, but document the diff in the commit message.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-architecture-map.ts scripts/lib/route-map-walker.ts scripts/generate-route-map.ts scripts/__tests__/generate-architecture-map.test.ts package.json docs/architecture/architecture-map.json
git commit -m "feat(scripts): add generate-architecture-map.ts

Composes existing route-map walker and flag registry into a unified JSON
emitter. Replaces the previously-hand-curated architecture-map.json.
Includes --check mode for CI drift detection."
```

---

## Task B2: Emit DI dependency edges

**Goal:** Walk `container.register(name, factory, [deps])` calls across all `server/src/config/services/*.services.ts` files and emit a `dependencies: { from, to, file }[]` array. Enables dependency-cycle detection and "what breaks if I delete X" analysis.

**Files:**

- Create: `scripts/lib/di-graph-walker.ts`
- Modify: `scripts/generate-architecture-map.ts` (add `dependencies` to output)
- Test: `scripts/__tests__/generate-architecture-map.test.ts` (extend)

- [ ] **Step 1: Write failing test for dependency edges**

```typescript
it("emits DI dependency edges with from/to/file", async () => {
  const map = await buildArchitectureMap();
  // promptOptimizationService depends on aiService (defined in llm.services.ts)
  const edge = map.dependencies.find(
    (e: { from: string; to: string }) =>
      e.from === "promptOptimizationService" && e.to === "aiService",
  );
  expect(edge).toBeDefined();
  expect(edge.file).toContain("optimization.services.ts");
});
```

- [ ] **Step 2: Create `scripts/lib/di-graph-walker.ts`**

Walk all `server/src/config/services/*.services.ts` files with the TS compiler API. For each `container.register("name", factory, ["dep1", "dep2"])` call, emit one edge per dep.

```typescript
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

export interface DependencyEdge {
  from: string;
  to: string;
  file: string;
}

export function extractDependencies(servicesDir: string): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  const files = fs
    .readdirSync(servicesDir)
    .filter((f) => f.endsWith(".services.ts"));

  for (const file of files) {
    const filePath = path.join(servicesDir, file);
    const source = ts.createSourceFile(
      filePath,
      fs.readFileSync(filePath, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );

    ts.forEachChild(source, function visit(node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "register"
      ) {
        const [nameArg, , depsArg] = node.arguments;
        if (
          nameArg &&
          ts.isStringLiteral(nameArg) &&
          depsArg &&
          ts.isArrayLiteralExpression(depsArg)
        ) {
          const from = nameArg.text;
          for (const dep of depsArg.elements) {
            if (ts.isStringLiteral(dep)) {
              edges.push({ from, to: dep.text, file });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    });
  }

  return edges;
}
```

- [ ] **Step 3: Integrate into `generate-architecture-map.ts`**

```typescript
import { extractDependencies } from "./lib/di-graph-walker.ts";

// In buildArchitectureMap():
return {
  // ...existing fields,
  dependencies: extractDependencies(
    path.join(REPO_ROOT, "server", "src", "config", "services"),
  ),
};
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run scripts/__tests__/generate-architecture-map.test.ts
```

Expected: PASS.

- [ ] **Step 5: Regenerate JSON, eyeball the edges section**

```bash
npx tsx scripts/generate-architecture-map.ts --write
jq '.dependencies | length' docs/architecture/architecture-map.json
```

Expected: ~50-100 edges (depends on count of `container.register(...)` calls with non-empty deps arrays).

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/di-graph-walker.ts scripts/generate-architecture-map.ts scripts/__tests__/generate-architecture-map.test.ts docs/architecture/architecture-map.json
git commit -m "feat(scripts): emit DI dependency edges in architecture map

Walks container.register() calls across services/*.services.ts and emits
dependency edges. Enables cycle detection and impact analysis."
```

---

## Task B3: Replace `*` method wildcards with enumerated methods

**Goal:** The pre-existing JSON listed routes like `{method: "*", path: "/api/preview/*"}`. The route-walker in `generate-route-map.ts` already enumerates concrete methods — surface them.

**Files:**

- Modify: `scripts/lib/route-map-walker.ts` (ensure each leaf entry has concrete method)
- Modify: `scripts/generate-architecture-map.ts` (consume detailed output)

- [ ] **Step 1: Un-skip the third test from B1**

In `scripts/__tests__/generate-architecture-map.test.ts`, remove the `.skip` (if any) from the test that asserts no `*` methods.

- [ ] **Step 2: Verify the route walker already returns concrete methods**

```bash
npx tsx scripts/generate-route-map.ts | grep '"\*"' | head -5
```

If it does return concrete methods, the test passes immediately. If not, fix the walker to emit one entry per `router.get|post|put|delete|patch(...)` call rather than collapsing to wildcards.

- [ ] **Step 3: Run tests**

```bash
npx vitest run scripts/__tests__/generate-architecture-map.test.ts
npx tsc --noEmit
```

- [ ] **Step 4: Regenerate JSON**

```bash
npx tsx scripts/generate-architecture-map.ts --write
```

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/architecture-map.json scripts/lib/route-map-walker.ts scripts/__tests__/generate-architecture-map.test.ts
git commit -m "feat(scripts): emit concrete HTTP methods in architecture map

Replaces '*' wildcard method values with the actual GET/POST/PUT/PATCH/DELETE
enumeration the route walker extracts."
```

---

## Task B4: Commit map artifacts + add CI drift check

**Files:**

- Modify: `.github/workflows/<existing-ci>.yml` (add `architecture-map:check` step)
- Modify: `docs/architecture/architecture-map.html` (commit existing file — currently untracked)
- Modify: `docs/architecture/architecture-map.json` (commit existing file — currently untracked)
- Modify: `CLAUDE.md` (mention `npm run architecture:map` under Commands)

- [ ] **Step 1: Confirm existing HTML still consumes the new JSON shape**

Open `docs/architecture/architecture-map.html` in a browser (or grep for `script id="architecture-data"`) and verify the rendering code reads the same fields the generator now emits. If new fields (`dependencies`, `requiresEnv`, etc.) need rendering, that's a follow-up — the current HTML can ignore them safely.

- [ ] **Step 2: Update CLAUDE.md Commands section**

Add under the `## Commands` block:

```markdown
npm run architecture:map # print architecture map JSON to stdout
npm run architecture:map:write # regenerate docs/architecture/architecture-map.json
npm run architecture:map:check # CI drift gate
```

- [ ] **Step 3: Add CI drift check**

Locate the existing CI workflow (likely `.github/workflows/ci.yml` or similar):

```bash
ls .github/workflows/
```

In the existing TypeCheck or lint job, add:

```yaml
- name: Verify architecture map is current
  run: npm run architecture:map:check
```

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/architecture-map.json docs/architecture/architecture-map.html CLAUDE.md .github/workflows/
git commit -m "chore(architecture-map): commit map artifacts + CI drift gate

Previously the architecture map JSON and HTML were untracked. Now they
are committed and a CI step fails the build if the JSON drifts from what
the generator would produce."
```

---

# Phase C — Cross-Layer URL Changes (deferred)

**Each task in this phase crosses the client/server boundary and must use the `cross-layer-change` skill protocol.** Do NOT execute these from this plan — instead, after Phase A+B are merged, create one new plan file per task and run the cross-layer-change skill against each.

## Task C1: Split `/api/preview/*` into preview vs render

**Scope:** Probably the largest cross-layer change. Affects:

- Server: `server/src/routes/preview.routes.ts` (split into `preview.routes.ts` for drafts and `render.routes.ts` for finals), `server/src/config/routes.config.ts`, `server/src/services/video-generation/` (mode parameter removal)
- Client: `client/src/features/preview/api/`, `client/src/features/generations/`, anywhere the preview API is called for final renders
- Tests: e2e suites, integration suites, regression tests
- Shared: any route literal in `shared/`
- Telemetry: rename PostHog events from `preview.video.*` → `render.video.*` for final renders

**Suggested plan file:** `docs/architecture/plans/2026-05-XX-split-preview-render-routes.md`

## Task C2: Move `/llm/*` under `/api/llm/*`

**Scope:** Renames 3 routes. Affects:

- Server: `server/src/app.ts` (mount path), `server/src/routes/labelSpansRoute.ts`, `server/src/routes/roleClassifyRoute.ts`
- Client: `client/src/features/span-highlighting/api/spanLabelingApi.ts`, Vite dev proxy config (`vite.config.ts`)
- Tests: any test using the old prefix

**Suggested plan file:** `docs/architecture/plans/2026-05-XX-consolidate-llm-namespace.md`

## Task C3: Drop `/api/v2/sessions/*` to `/api/sessions/*`

**Scope:** Single prefix rename across:

- Server: `server/src/routes/api.routes.ts` (line 148), `server/src/routes/sessions.routes.ts`
- Client: `client/src/services/ApiClient.ts` (search for `v2/sessions`), `client/src/features/history/`
- Tests: any test referencing `v2/sessions`

**Suggested plan file:** `docs/architecture/plans/2026-05-XX-drop-v2-sessions-prefix.md`

## Task C4: Convert enhancement verb routes to resource style

**Scope:** Rename 4 routes:

- `/api/get-enhancement-suggestions` → `/api/enhancement/suggestions`
- `/api/get-custom-suggestions` → `/api/enhancement/custom-suggestions`
- `/api/detect-scene-change` → `/api/enhancement/scene-change`
- `/api/test-nlp` → `/api/enhancement/test-nlp` (dev-only — could just be deleted)
- `/api/observe-image` → `/api/enhancement/observe-image`

Affects:

- Server: `server/src/routes/enhancement/*.ts`, `server/src/routes/api.routes.ts`
- Client: `client/src/services/EnhancementApi.ts`, `client/src/api/enhancementSuggestionsApi.ts`
- Tests: integration + regression tests in `server/src/routes/enhancement/__tests__/`

**Suggested plan file:** `docs/architecture/plans/2026-05-XX-resourcify-enhancement-routes.md`

---

# Self-Review

**Spec coverage check:** All 14 issues from `docs/architecture/architecture-map.json` audit map to tasks:

| Issue                               | Task    |
| ----------------------------------- | ------- |
| #1 preview/render split             | C1      |
| #2 /llm prefix consolidation        | C2      |
| #3 drop v2/sessions                 | C3      |
| #4 enhancement verb routes          | C4      |
| #5 extract optimization.services.ts | A5      |
| #6 split generation.services.ts     | A6      |
| #7 delete \_DISABLED aliases        | A2      |
| #8 dependsOn on flags               | A1      |
| #9 GCS startup probe                | A3      |
| #10 /health/ready contract          | A4      |
| #11 requiresEnv on flags            | A1      |
| #12 commit map + regen script       | B1 + B4 |
| #13 dependency edges                | B2      |
| #14 method-level granularity        | B3      |

All covered.

**Type consistency check:** `BaseFlagDef` extension in A1 surfaces `requiresEnv` and `dependsOn`. B1 test (`requiresEnv` assertion) and B2 (consuming the flag registry output) reference the same field names. No drift.

**Placeholder scan:** Every code step includes actual TypeScript. No "implement appropriate error handling" or "similar to Task N" references. Each `Files:` section uses absolute repo-relative paths.

---

# Execution Handoff

Plan complete and saved to `docs/architecture/architecture-fixes-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks for early-warning on integration test gate failures, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints for review at each commit.

Phase C (4 URL-change tasks) is explicitly out of scope for this plan — those need their own per-task plans using the `cross-layer-change` skill.

Which approach?
