# Source Discriminator + Synthetic Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-05-10-source-discriminator-and-harness-design.md`](../specs/2026-05-10-source-discriminator-and-harness-design.md) (commit `a4b54e7d`)
**Program:** Part of the [Measurement Program](../programs/measurement.md) — sub-project #1
**North-star context:** Vidra has zero real users and no production deploy yet. The CI cron lands disabled-by-default; local harness is the day-one win.

**Goal:** Add a `source` discriminator (`user`/`synthetic`/`ci`/`dev`/`unknown`) to every operational telemetry event, instrument `/api/llm/label-spans` end-to-end with a new `label-spans.completed` event, ship a synthetic-traffic harness covering Optimize + Suggestions + Span Labeling, and build three new per-component health dashboards.

**Architecture:** Source resolution happens once per request in a new `telemetrySourceMiddleware` that extends the existing `requestContext` AsyncLocalStorage. The `PostHogClient.capture()` wrapper reads source from ALS and stamps it on every emitted event — telemetry services stay source-unaware. Frontend sets `X-Telemetry-Source: user` via a build-time interceptor. The harness is a TS script firing anonymous HTTP requests against a configurable target URL (`VIDRA_API_URL`), runnable locally today; the GitHub Actions workflow ships but its `schedule:` trigger stays commented out until a deployed environment exists.

**Tech Stack:** TypeScript, vitest, Express, AsyncLocalStorage (node:async_hooks), posthog-node (existing), Firebase-anonymous request paths, GitHub Actions, PostHog MCP.

---

## File Structure

**New (server):**

- `shared/types/telemetry.ts` — `TelemetrySource` union type (importable by both client and server)
- `server/src/middleware/telemetrySource.ts` — `telemetrySourceMiddleware`
- `server/src/middleware/__tests__/telemetrySource.test.ts` — middleware resolution unit tests
- `server/src/infrastructure/__tests__/PostHogClient.source.test.ts` — integration test for source stamping
- `server/src/services/observability/SpanLabelingTelemetryService.ts` — `SpanLabelingTrace` + service
- `server/src/services/observability/__tests__/label-spans-event-schema.snapshot.test.ts` — schema lock for new event
- `server/src/services/observability/__tests__/llm-call-event-schema.snapshot.test.ts` — closes existing coverage gap

**Modified (server):**

- `server/src/infrastructure/PostHogClient.ts` — `capture()` reads source from ALS, stamps on properties
- `server/src/config/middleware.config.ts` — mount `telemetrySourceMiddleware` directly after `requestIdMiddleware`
- `server/src/routes/labelSpansRoute.ts` — construct `SpanLabelingTrace`, call `.complete()` in `try/finally`
- `server/src/config/services/core.services.ts` — register `spanLabelingTelemetryService` token

**New (client):**

- `client/src/services/http/TelemetrySourceInterceptor.ts` — sets `X-Telemetry-Source: user` in production builds

**Modified (client):**

- `client/src/services/http/AuthInterceptors.ts` (or wherever `setupApiAuth` lives — verify in Task 13) — wire the new interceptor alongside auth

**New (harness):**

- `scripts/synthetic/run-harness.ts` — CLI entry point
- `scripts/synthetic/drivers/optimize.driver.ts`
- `scripts/synthetic/drivers/suggestions.driver.ts`
- `scripts/synthetic/drivers/span-labeling.driver.ts`
- `scripts/synthetic/fixtures/prompts.json` — 20 canonical prompts
- `scripts/synthetic/utils/request-helper.ts` — builds requests with synthetic header
- `scripts/synthetic/README.md` — usage + fixture refresh notes

**New (CI):**

- `.github/workflows/synthetic-harness.yml` — workflow committed with `schedule:` commented out

**Modified:**

- `package.json` — add `synthetic` npm script
- `docs/architecture/observability.md` — document `source` property + new `label-spans.completed` event + tile IDs for new dashboards

---

## Tasks

### Task 0: Verify shared/ alias and test discovery for new directories

Two greenfield directories may not be wired into existing globs. Confirm before writing real code.

**Files:**

- Read only

- [ ] **Step 1: Confirm the `shared/` alias is set up for both client and server**

```bash
grep -rn "shared\|#shared\|@shared" server/tsconfig.json client/tsconfig.json config/ 2>&1 | head -20
```

Expected: `shared/` is referenced in `paths` for both projects. If missing, this plan's Task 1 (which creates `shared/types/telemetry.ts`) won't be importable — escalate before continuing.

- [ ] **Step 2: Confirm vitest discovers `server/src/middleware/__tests__/` and `server/src/infrastructure/__tests__/`**

```bash
find server/src/middleware/__tests__ server/src/infrastructure/__tests__ -name "*.test.ts" 2>&1 | head -5
```

Expected: existing tests in those directories. If they exist and pass under `npm run test:unit`, the new tests will be discovered automatically.

- [ ] **Step 3: Confirm `scripts/synthetic/` will run via tsx**

```bash
grep -n "\"scripts\"" package.json | head -3
grep -n "tsx\|--loader" package.json scripts/evaluation/golden-set-relaxed-f1.ts 2>&1 | head -5
```

Expected: the project uses tsx for scripts execution (mirrors `scripts/evaluation/*`). The harness will use the same.

- [ ] **Step 4: Do not commit**

Verification gate only.

---

### Task 1: Shared `TelemetrySource` type

The contract both client and server reference.

**Files:**

- Create: `shared/types/telemetry.ts`

- [ ] **Step 1: Create the type file**

```typescript
// shared/types/telemetry.ts

/**
 * Telemetry traffic-source discriminator. Stamped on every operational
 * event so dashboards can separate real users from synthetic / dev / CI
 * traffic. See docs/superpowers/programs/measurement.md for the program
 * context.
 */
export type TelemetrySource =
  | "user" // Real authenticated or anonymous browser user
  | "synthetic" // Pre-launch harness traffic
  | "ci" // CI job exercising real endpoints
  | "dev" // NODE_ENV !== "production" fallback
  | "unknown"; // NODE_ENV === "production" fallback — bug signal

export const TELEMETRY_SOURCES: readonly TelemetrySource[] = [
  "user",
  "synthetic",
  "ci",
  "dev",
  "unknown",
] as const;

/** Header allowed to override inference. `dev` and `unknown` are inference-only. */
export const TELEMETRY_SOURCE_HEADER = "x-telemetry-source";
export const TELEMETRY_SOURCE_HEADER_ALLOWED: readonly TelemetrySource[] = [
  "user",
  "synthetic",
  "ci",
] as const;
```

- [ ] **Step 2: Verify the type compiles + is importable from both sides**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Do not commit yet — types ship with the middleware in Task 3.**

---

### Task 2: Audit `RequestContext` type — no widen needed

The existing `RequestContext` is `Record<string, unknown>` — already accepts `source`. Confirm before writing the middleware.

**Files:**

- Read only: `server/src/infrastructure/requestContext.ts`

- [ ] **Step 1: Confirm the type signature**

```bash
cat server/src/infrastructure/requestContext.ts
```

Expected: `type RequestContext = Record<string, unknown>` — no widening needed. Tasks 3 and 5 add `source` via convention only.

- [ ] **Step 2: Do not commit**

If the type has narrowed (unlikely), add a typed extension here before continuing — but with `Record<string, unknown>` we're done.

---

### Task 3: `telemetrySourceMiddleware` (TDD)

The middleware that resolves source per request and extends the ALS context.

**Files:**

- Create: `server/src/middleware/telemetrySource.ts`
- Test: `server/src/middleware/__tests__/telemetrySource.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/middleware/__tests__/telemetrySource.test.ts
import { describe, it, expect, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { telemetrySourceMiddleware } from "../telemetrySource";
import { getRequestContext } from "@infrastructure/requestContext";
import type { TelemetrySource } from "#shared/types/telemetry";

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function captureSource(req: Request): TelemetrySource | undefined {
  let captured: TelemetrySource | undefined;
  const res = {} as Response;
  const next: NextFunction = () => {
    captured = getRequestContext()?.source as TelemetrySource | undefined;
  };
  telemetrySourceMiddleware(req, res, next);
  return captured;
}

describe("telemetrySourceMiddleware", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("resolves 'synthetic' from header", () => {
    process.env.NODE_ENV = "production";
    expect(captureSource(mockReq({ "x-telemetry-source": "synthetic" }))).toBe(
      "synthetic",
    );
  });

  it("resolves 'user' from header", () => {
    process.env.NODE_ENV = "production";
    expect(captureSource(mockReq({ "x-telemetry-source": "user" }))).toBe(
      "user",
    );
  });

  it("resolves 'ci' from header", () => {
    process.env.NODE_ENV = "production";
    expect(captureSource(mockReq({ "x-telemetry-source": "ci" }))).toBe("ci");
  });

  it("falls through invalid header to env-based rule", () => {
    process.env.NODE_ENV = "production";
    delete process.env.CI;
    expect(captureSource(mockReq({ "x-telemetry-source": "dogfood" }))).toBe(
      "unknown",
    );
  });

  it("resolves 'ci' from CI env when no header", () => {
    process.env.NODE_ENV = "production";
    process.env.CI = "true";
    expect(captureSource(mockReq())).toBe("ci");
  });

  it("resolves 'dev' when not production and no header/CI", () => {
    process.env.NODE_ENV = "development";
    delete process.env.CI;
    expect(captureSource(mockReq())).toBe("dev");
  });

  it("resolves 'unknown' in production fallback", () => {
    process.env.NODE_ENV = "production";
    delete process.env.CI;
    expect(captureSource(mockReq())).toBe("unknown");
  });

  it("inherits requestId from outer context when present", () => {
    // Simulate requestIdMiddleware having already run
    const { runWithRequestContext } = require("@infrastructure/requestContext");
    process.env.NODE_ENV = "production";
    let captured: { requestId?: unknown; source?: unknown } | undefined;
    const next: NextFunction = () => {
      captured = getRequestContext();
    };
    runWithRequestContext({ requestId: "req-abc" }, () => {
      telemetrySourceMiddleware(
        mockReq({ "x-telemetry-source": "user" }),
        {} as Response,
        next,
      );
    });
    expect(captured).toEqual({ requestId: "req-abc", source: "user" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- server/src/middleware/__tests__/telemetrySource
```

Expected: FAIL with "Cannot find module '../telemetrySource'".

- [ ] **Step 3: Implement the middleware**

```typescript
// server/src/middleware/telemetrySource.ts
import type { Request, Response, NextFunction } from "express";
import {
  getRequestContext,
  runWithRequestContext,
} from "@infrastructure/requestContext";
import {
  TELEMETRY_SOURCE_HEADER,
  TELEMETRY_SOURCE_HEADER_ALLOWED,
  type TelemetrySource,
} from "#shared/types/telemetry";

const ALLOWED = new Set<TelemetrySource>(TELEMETRY_SOURCE_HEADER_ALLOWED);

function resolveSource(req: Request): TelemetrySource {
  const raw = req.headers[TELEMETRY_SOURCE_HEADER];
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  if (
    typeof candidate === "string" &&
    ALLOWED.has(candidate as TelemetrySource)
  ) {
    return candidate as TelemetrySource;
  }
  if (process.env.CI === "true") return "ci";
  return process.env.NODE_ENV === "production" ? "unknown" : "dev";
}

/**
 * Resolves a TelemetrySource for the request and stores it in the existing
 * requestContext AsyncLocalStorage frame. Mount AFTER requestIdMiddleware
 * so requestId is preserved when the new frame is created.
 */
export function telemetrySourceMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const existing = getRequestContext() ?? {};
  const source = resolveSource(req);
  runWithRequestContext({ ...existing, source }, () => next());
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run test:unit -- server/src/middleware/__tests__/telemetrySource
```

Expected: 8 tests PASS.

- [ ] **Step 5: Type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Do not commit yet — ships with PostHogClient wrapper in Task 6.**

---

### Task 4: Mount `telemetrySourceMiddleware` in middleware config

**Files:**

- Modify: `server/src/config/middleware.config.ts`

- [ ] **Step 1: Locate the requestIdMiddleware mount**

```bash
grep -n "requestIdMiddleware\|app.use" server/src/config/middleware.config.ts | head -10
```

Note the exact line where `app.use(requestIdMiddleware)` is called.

- [ ] **Step 2: Add the import**

In the imports block of `server/src/config/middleware.config.ts`, alongside the existing `requestIdMiddleware` import:

```typescript
import { telemetrySourceMiddleware } from "@middleware/telemetrySource";
```

- [ ] **Step 3: Mount the middleware**

Immediately after the line `app.use(requestIdMiddleware);` add:

```typescript
app.use(telemetrySourceMiddleware);
```

The order matters: `requestIdMiddleware` runs first (populates `requestId` in ALS); `telemetrySourceMiddleware` runs second (adds `source` to the same frame).

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Do not commit yet — bundle with PostHogClient changes in Task 6.**

---

### Task 5: PostHogClient wrapper stamps `source` (TDD)

This is the central infrastructure change — every event passing through the client now carries `source` automatically.

**Files:**

- Modify: `server/src/infrastructure/PostHogClient.ts`
- Test: `server/src/infrastructure/__tests__/PostHogClient.source.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/infrastructure/__tests__/PostHogClient.source.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the wrapper by mocking posthog-node's PostHog class and asserting
// what arguments it received.
const captureSpy = vi.fn();
const shutdownSpy = vi.fn(async () => {});

vi.mock("posthog-node", () => {
  return {
    PostHog: vi.fn().mockImplementation(() => ({
      capture: captureSpy,
      shutdown: shutdownSpy,
    })),
  };
});

import { createPostHogClient } from "../PostHogClient";
import { runWithRequestContext } from "../requestContext";

describe("PostHogClient source stamping", () => {
  const originalKey = process.env.POSTHOG_API_KEY;
  beforeEach(() => {
    captureSpy.mockClear();
    process.env.POSTHOG_API_KEY = "phc_test_key";
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.POSTHOG_API_KEY;
    else process.env.POSTHOG_API_KEY = originalKey;
  });

  it("stamps source from ALS onto captured properties", () => {
    const client = createPostHogClient();
    runWithRequestContext({ requestId: "req-1", source: "user" }, () => {
      client.capture({
        distinctId: "d1",
        event: "test.event",
        properties: { foo: "bar" },
      });
    });
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(captureSpy.mock.calls[0][0].properties).toEqual({
      source: "user",
      foo: "bar",
    });
  });

  it("defaults source to 'unknown' when no request context", () => {
    const client = createPostHogClient();
    client.capture({
      distinctId: "d1",
      event: "test.event",
      properties: { foo: "bar" },
    });
    expect(captureSpy.mock.calls[0][0].properties).toEqual({
      source: "unknown",
      foo: "bar",
    });
  });

  it("explicit properties.source wins over ALS source", () => {
    const client = createPostHogClient();
    runWithRequestContext({ requestId: "req-1", source: "user" }, () => {
      client.capture({
        distinctId: "d1",
        event: "test.event",
        properties: { source: "synthetic", foo: "bar" },
      });
    });
    expect(captureSpy.mock.calls[0][0].properties).toEqual({
      source: "synthetic",
      foo: "bar",
    });
  });

  it("handles missing properties object", () => {
    const client = createPostHogClient();
    runWithRequestContext({ requestId: "req-1", source: "ci" }, () => {
      client.capture({ distinctId: "d1", event: "test.event" });
    });
    expect(captureSpy.mock.calls[0][0].properties).toEqual({ source: "ci" });
  });
});
```

Note: the import order matters — `vi.mock` is hoisted, but the `afterEach` reference must be imported. Add this near the top:

```typescript
import { afterEach } from "vitest";
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- server/src/infrastructure/__tests__/PostHogClient.source
```

Expected: FAIL — current `capture()` passes args through verbatim, doesn't add source.

- [ ] **Step 3: Modify PostHogClient.ts**

Open `server/src/infrastructure/PostHogClient.ts`. Replace the `PostHogClientReal.capture()` method with:

```typescript
import { getRequestContext } from "./requestContext";
import type { TelemetrySource } from "#shared/types/telemetry";

// ... existing code ...

class PostHogClientReal implements IPostHogClient {
  private readonly client: PostHog;

  constructor(apiKey: string, host?: string) {
    this.client = new PostHog(apiKey, {
      ...(host ? { host } : {}),
      flushAt: 20,
      flushInterval: 10000,
    });
  }

  capture(args: CaptureArgs): void {
    try {
      const ctx = getRequestContext();
      const source: TelemetrySource =
        (ctx?.source as TelemetrySource | undefined) ?? "unknown";
      this.client.capture({
        ...args,
        properties: { source, ...(args.properties ?? {}) },
      });
    } catch {
      // Telemetry must never throw upstream.
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.client.shutdown();
    } catch {
      // ignore
    }
  }
}
```

The `PostHogClientNoop` class and `createPostHogClient` factory function are unchanged.

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run test:unit -- server/src/infrastructure/__tests__/PostHogClient.source
```

Expected: 4 tests PASS.

- [ ] **Step 5: Re-run the existing PostHogClient tests (regression check)**

```bash
npm run test:unit -- server/src/infrastructure/__tests__/PostHogClient
```

Expected: all tests PASS (existing + new).

- [ ] **Step 6: Type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Do not commit yet — ship with the integration gate (Task 6).**

---

### Task 6: Integration test gate + commit PR 1

Per `CLAUDE.md`, changes to DI / middleware / PostHogClient trigger the integration test gate.

- [ ] **Step 1: Run the integration test gate**

```bash
PORT=0 npx vitest run tests/integration/bootstrap.integration.test.ts tests/integration/di-container.integration.test.ts --config config/test/vitest.integration.config.js
```

Expected: all integration tests PASS. If they fail, the middleware mount in Task 4 or the PostHogClient changes in Task 5 broke the boot path — fix before continuing.

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 3: Full unit suite**

```bash
npm run test:unit
```

Expected: all PASS.

- [ ] **Step 4: Commit PR 1 (source plumbing)**

```bash
git add shared/types/telemetry.ts \
        server/src/middleware/telemetrySource.ts \
        server/src/middleware/__tests__/telemetrySource.test.ts \
        server/src/infrastructure/PostHogClient.ts \
        server/src/infrastructure/__tests__/PostHogClient.source.test.ts \
        server/src/config/middleware.config.ts
git commit -m "feat(source-discrim): telemetry source middleware + PostHogClient auto-stamps source

Adds a TelemetrySource discriminator (user/synthetic/ci/dev/unknown) to every
operational telemetry event. Source is resolved once per request by a new
telemetrySourceMiddleware (extends the existing requestContext ALS frame) and
stamped on every event by the PostHogClient.capture() wrapper. Telemetry
services stay source-unaware — cross-cutting concern at infrastructure layer.

Header X-Telemetry-Source overrides inference; CI=true env and NODE_ENV
provide the fallback. unknown only appears in production when a real-user
request omitted the header — a bug signal worth alerting on once dashboards
land."
```

---

### Task 7: `SpanLabelingTelemetryService` (TDD)

New telemetry service for the `label-spans.completed` event, mirroring `SuggestionsTelemetryService`.

**Files:**

- Create: `server/src/services/observability/SpanLabelingTelemetryService.ts`
- Create: `server/src/services/observability/__tests__/SpanLabelingTelemetryService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/services/observability/__tests__/SpanLabelingTelemetryService.test.ts
import { describe, it, expect, vi } from "vitest";
import { SpanLabelingTelemetryService } from "../SpanLabelingTelemetryService";
import type {
  IPostHogClient,
  CaptureArgs,
} from "@infrastructure/PostHogClient";

function makeClient(captures: CaptureArgs[]): IPostHogClient {
  return {
    capture: vi.fn((args: CaptureArgs) => {
      captures.push(args);
    }),
    shutdown: vi.fn(async () => {}),
  };
}

describe("SpanLabelingTelemetryService", () => {
  it("emits label-spans.completed on success", () => {
    const captures: CaptureArgs[] = [];
    const service = new SpanLabelingTelemetryService(makeClient(captures));
    const trace = service.startSpanLabelingTrace("req-1", "user-1");

    trace.recordCacheHit();
    trace.complete({
      outcome: "success",
      promptLength: 42,
      spanCount: 6,
      provider: "groq",
      model: "llama-3.1-70b-versatile",
    });

    expect(captures).toHaveLength(1);
    const c = captures[0]!;
    expect(c.event).toBe("label-spans.completed");
    expect(c.distinctId).toBe("user-1");
    const p = c.properties as Record<string, unknown>;
    expect(p.requestId).toBe("req-1");
    expect(p.userId).toBe("user-1");
    expect(p.outcome).toBe("success");
    expect(p.cacheHit).toBe(true);
    expect(p.spanCount).toBe(6);
    expect(p.provider).toBe("groq");
    expect(p.model).toBe("llama-3.1-70b-versatile");
    expect(typeof p.durationMs).toBe("number");
  });

  it("emits label-spans.completed on error with errorStage", () => {
    const captures: CaptureArgs[] = [];
    const service = new SpanLabelingTelemetryService(makeClient(captures));
    const trace = service.startSpanLabelingTrace("req-2", null);

    trace.recordError("llm_call", new Error("provider 500"));
    trace.complete({
      outcome: "error",
      promptLength: 100,
      spanCount: 0,
      provider: "openai",
      model: null,
    });

    const p = captures[0]!.properties as Record<string, unknown>;
    expect(p.outcome).toBe("error");
    expect(p.errorMessage).toBe("provider 500");
    expect(p.errorStage).toBe("llm_call");
    expect(captures[0]!.distinctId).toMatch(/^anon-/);
  });

  it("idempotent — second complete() is a no-op", () => {
    const captures: CaptureArgs[] = [];
    const service = new SpanLabelingTelemetryService(makeClient(captures));
    const trace = service.startSpanLabelingTrace("req-3", "u");
    trace.complete({
      outcome: "success",
      promptLength: 10,
      spanCount: 1,
      provider: "groq",
      model: "m",
    });
    trace.complete({
      outcome: "success",
      promptLength: 10,
      spanCount: 1,
      provider: "groq",
      model: "m",
    });
    expect(captures).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- server/src/services/observability/__tests__/SpanLabelingTelemetryService
```

Expected: FAIL with "Cannot find module '../SpanLabelingTelemetryService'".

- [ ] **Step 3: Implement the service**

```typescript
// server/src/services/observability/SpanLabelingTelemetryService.ts
import { randomUUID } from "node:crypto";
import { logger } from "@infrastructure/Logger";
import type { IPostHogClient } from "@infrastructure/PostHogClient";

export type SpanLabelingErrorStage =
  | "validation"
  | "llm_call"
  | "cache"
  | "post_processing";

export interface SpanLabelingCompleteSummary {
  outcome: "success" | "error";
  promptLength: number;
  spanCount: number;
  provider: "openai" | "groq" | null;
  model: string | null;
}

interface SpanLabelingEventProperties {
  requestId: string;
  userId: string | null;
  outcome: "success" | "error";
  errorMessage?: string;
  errorStage?: SpanLabelingErrorStage;
  durationMs: number;
  promptLength: number;
  spanCount: number;
  cacheHit: boolean;
  provider: "openai" | "groq" | null;
  model: string | null;
}

export class SpanLabelingTrace {
  private readonly startedAt = performance.now();
  private cacheHit = false;
  private errorStage: SpanLabelingErrorStage | null = null;
  private errorMessage: string | null = null;
  private completed = false;

  constructor(
    private readonly client: IPostHogClient,
    private readonly distinctId: string,
    private readonly requestId: string,
    private readonly userId: string | null,
  ) {}

  recordCacheHit(): void {
    this.cacheHit = true;
  }

  recordError(stage: SpanLabelingErrorStage, err: unknown): void {
    this.errorStage = stage;
    this.errorMessage = err instanceof Error ? err.message : String(err);
  }

  complete(summary: SpanLabelingCompleteSummary): void {
    if (this.completed) return;
    this.completed = true;

    const durationMs = Math.round(performance.now() - this.startedAt);

    const properties: SpanLabelingEventProperties = {
      requestId: this.requestId,
      userId: this.userId,
      outcome: summary.outcome,
      ...(this.errorMessage ? { errorMessage: this.errorMessage } : {}),
      ...(this.errorStage ? { errorStage: this.errorStage } : {}),
      durationMs,
      promptLength: summary.promptLength,
      spanCount: summary.spanCount,
      cacheHit: this.cacheHit,
      provider: summary.provider,
      model: summary.model,
    };

    try {
      this.client.capture({
        distinctId: this.distinctId,
        event: "label-spans.completed",
        properties: { ...properties },
      });
    } catch (err) {
      logger.debug("Telemetry emission failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
        requestId: this.requestId,
      });
    }
  }
}

export class SpanLabelingTelemetryService {
  constructor(private readonly client: IPostHogClient) {}

  startSpanLabelingTrace(
    requestId: string,
    userId: string | null,
  ): SpanLabelingTrace {
    const distinctId =
      userId && userId.trim().length > 0 ? userId : `anon-${randomUUID()}`;
    return new SpanLabelingTrace(this.client, distinctId, requestId, userId);
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run test:unit -- server/src/services/observability/__tests__/SpanLabelingTelemetryService
```

Expected: 3 tests PASS.

- [ ] **Step 5: Type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Do not commit yet — ships with route wiring in Task 9.**

---

### Task 8: Snapshot test for `label-spans.completed` schema

Lock the schema so future drift shows in PR diffs.

**Files:**

- Create: `server/src/services/observability/__tests__/label-spans-event-schema.snapshot.test.ts`

- [ ] **Step 1: Write the snapshot test**

```typescript
// server/src/services/observability/__tests__/label-spans-event-schema.snapshot.test.ts
import { describe, it, expect, vi } from "vitest";
import { SpanLabelingTelemetryService } from "../SpanLabelingTelemetryService";
import type {
  IPostHogClient,
  CaptureArgs,
} from "@infrastructure/PostHogClient";

describe("label-spans.completed event schema (contract)", () => {
  it("emits a stable shape — change requires explicit review", () => {
    const captures: CaptureArgs[] = [];
    const client: IPostHogClient = {
      capture: vi.fn((args: CaptureArgs) => {
        captures.push(args);
      }),
      shutdown: vi.fn(async () => {}),
    };
    const service = new SpanLabelingTelemetryService(client);
    const trace = service.startSpanLabelingTrace("req-fixture", "user-fixture");

    trace.recordCacheHit();
    trace.complete({
      outcome: "success",
      promptLength: 120,
      spanCount: 8,
      provider: "groq",
      model: "llama-3.1-70b-versatile",
    });

    expect(captures).toHaveLength(1);
    const capture = captures[0]!;
    const normalized = {
      distinctId: capture.distinctId,
      event: capture.event,
      propertyKeys: Object.keys(capture.properties || {}).sort(),
      sampleValues: {
        outcome: (capture.properties as { outcome?: string })?.outcome,
        cacheHit: (capture.properties as { cacheHit?: boolean })?.cacheHit,
        spanCount: (capture.properties as { spanCount?: number })?.spanCount,
        provider: (capture.properties as { provider?: string })?.provider,
      },
    };

    expect(normalized).toMatchInlineSnapshot(`
      {
        "distinctId": "user-fixture",
        "event": "label-spans.completed",
        "propertyKeys": [
          "cacheHit",
          "durationMs",
          "model",
          "outcome",
          "promptLength",
          "provider",
          "requestId",
          "spanCount",
          "userId",
        ],
        "sampleValues": {
          "cacheHit": true,
          "outcome": "success",
          "provider": "groq",
          "spanCount": 8,
        },
      }
    `);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npm run test:unit -- server/src/services/observability/__tests__/label-spans-event-schema.snapshot
```

Expected: 1 test PASS (inline snapshot matches the literal expected output above).

- [ ] **Step 3: Do not commit yet — ships with Task 9.**

---

### Task 9: Register `spanLabelingTelemetryService` in DI + wire into route

**Files:**

- Modify: `server/src/config/services/core.services.ts`
- Modify: `server/src/routes/labelSpansRoute.ts`

- [ ] **Step 1: Find the existing telemetry registrations in core.services.ts**

```bash
grep -n "TelemetryService\|suggestionsTelemetry\|optimizeTelemetry" server/src/config/services/core.services.ts
```

Expected: identifies the existing registration pattern for `suggestionsTelemetryService` and/or `optimizeTelemetryService`.

- [ ] **Step 2: Register the new telemetry service**

In `server/src/config/services/core.services.ts`, alongside the existing `suggestionsTelemetryService` / `optimizeTelemetryService` registrations, add:

```typescript
import { SpanLabelingTelemetryService } from "@services/observability/SpanLabelingTelemetryService";

// ... within the registration function ...

container.register(
  "spanLabelingTelemetryService",
  (postHogClient) => new SpanLabelingTelemetryService(postHogClient),
  ["postHogClient"],
);
```

The `postHogClient` token already exists (registered alongside `suggestionsTelemetryService`). If the existing service uses a different injection key, mirror that.

- [ ] **Step 3: Update the route factory to accept the telemetry service**

Open `server/src/routes/labelSpansRoute.ts`. Modify `createLabelSpansRoute` signature:

```typescript
import type { SpanLabelingTelemetryService } from "@services/observability/SpanLabelingTelemetryService";

export function createLabelSpansRoute(
  aiService: AIModelService,
  spanLabelingCache: SpanLabelingCacheService | null = null,
  telemetryService: SpanLabelingTelemetryService | null = null,
): Router {
  // ...
}
```

- [ ] **Step 4: Construct a trace inside the `/` route handler**

Inside the existing `router.post("/", ...)` handler (the non-stream variant), wrap the coordinator call with a trace. Replace the handler body with this structure:

```typescript
router.post(
  "/",
  requestCoalescing.middleware({ keyScope: "/api/llm/label-spans" }),
  async (req: Request, res: Response) => {
    const parsed = parseLabelSpansRequest(req.body);
    if (!parsed.ok) {
      return res.status(parsed.status).json({ error: parsed.error });
    }

    const { payload, text, maxSpans, minConfidence, policy, templateVersion } =
      parsed.data;

    const startTime = performance.now();
    const operation = "labelSpans";
    const requestId = (req as Request & { id?: string }).id ?? "unknown";
    const userId = extractUserId(req);

    const trace = telemetryService?.startSpanLabelingTrace(requestId, userId);

    logger.debug("Starting operation.", {
      operation,
      requestId,
      userId,
      textLength: text.length,
      maxSpans,
      minConfidence,
      policy,
      templateVersion,
    });

    try {
      const { result, headers } = await coordinator.resolve({
        payload,
        text,
        policy: policy ?? null,
        templateVersion: templateVersion ?? null,
        requestId,
        userId,
        startTimeMs: startTime,
      });

      Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      if (!result) {
        trace?.recordError("post_processing", new Error("no result"));
        trace?.complete({
          outcome: "error",
          promptLength: text.length,
          spanCount: 0,
          provider: null,
          model: null,
        });
        return res
          .status(502)
          .json({ error: "Span labeling failed to produce a result" });
      }

      // Detect cache hit from headers (the coordinator sets X-Cache-Status)
      if (headers["X-Cache-Status"] === "HIT") {
        trace?.recordCacheHit();
      }

      trace?.complete({
        outcome: "success",
        promptLength: text.length,
        spanCount: result.spans?.length ?? 0,
        provider:
          (result.meta?.provider as "openai" | "groq" | undefined) ?? null,
        model: (result.meta?.model as string | undefined) ?? null,
      });

      return res.json(toPublicLabelSpansResult(result));
    } catch (error) {
      trace?.recordError(
        "llm_call",
        error instanceof Error ? error : new Error(String(error)),
      );
      trace?.complete({
        outcome: "error",
        promptLength: text.length,
        spanCount: 0,
        provider: null,
        model: null,
      });
      logger.error("Operation failed.", error as Error, {
        operation,
        requestId,
        userId,
        duration: Math.round(performance.now() - startTime),
        error: (error as { message?: string })?.message,
        stack: (error as { stack?: string })?.stack,
        textLength: text?.length,
      });
      return res.status(502).json({
        error: "LLM span labeling failed",
        message: (error as { message?: string })?.message || "Unknown error",
      });
    }
  },
);
```

**Caveat on `result.meta`:** the actual field names returned by the coordinator may differ. Run:

```bash
grep -rn "meta\b\|provider\b" server/src/routes/labelSpans/ server/src/llm/span-labeling/SpanLabelingService.ts | head -20
```

If `result.meta.provider` / `result.meta.model` don't exist, adapt the integration to whatever the coordinator returns. **Do not invent fields** — pass `null` if unavailable and add a follow-up task to surface them.

- [ ] **Step 5: Find where `createLabelSpansRoute` is called and add the new arg**

```bash
grep -rn "createLabelSpansRoute" server/src/ | head -5
```

In the route registration file (likely `server/src/config/routes.config.ts`), update the call to pass the new dependency:

```typescript
createLabelSpansRoute(
  container.resolve("aiService"),
  container.resolve("spanLabelingCacheService"),
  container.resolve("spanLabelingTelemetryService"),
);
```

- [ ] **Step 6: Type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Run the new tests + existing tests for labelSpans**

```bash
npm run test:unit -- server/src/services/observability/__tests__/SpanLabelingTelemetryService server/src/services/observability/__tests__/label-spans-event-schema server/src/routes/labelSpans 2>&1 | tail -30
```

Expected: all PASS.

- [ ] **Step 8: Integration test gate**

```bash
PORT=0 npx vitest run tests/integration/bootstrap.integration.test.ts tests/integration/di-container.integration.test.ts --config config/test/vitest.integration.config.js
```

Expected: PASS.

- [ ] **Step 9: Commit PR 2**

```bash
git add server/src/services/observability/SpanLabelingTelemetryService.ts \
        server/src/services/observability/__tests__/SpanLabelingTelemetryService.test.ts \
        server/src/services/observability/__tests__/label-spans-event-schema.snapshot.test.ts \
        server/src/config/services/core.services.ts \
        server/src/config/routes.config.ts \
        server/src/routes/labelSpansRoute.ts
git commit -m "feat(source-discrim): label-spans.completed surface event

Adds a SpanLabelingTelemetryService mirroring SuggestionsTelemetryService.
One label-spans.completed event fires per /api/llm/label-spans request,
carrying duration, span count, cache hit, provider/model, and outcome.

Schema locked by a snapshot test. The new telemetry service is wired into
the route via DI; null fallback keeps tests and offline scenarios working."
```

---

### Task 10: Snapshot test for `llm.call.completed` (closes existing gap)

The `llm.call.completed` event has no snapshot test today — `observability.md` flags this as a follow-up. Close it now while we're already in the telemetry area.

**Files:**

- Create: `server/src/services/observability/__tests__/llm-call-event-schema.snapshot.test.ts`

- [ ] **Step 1: Read the existing service to learn its record() shape**

```bash
grep -n "record\|capture\|properties" server/src/services/observability/LlmCallTelemetryService.ts | head -25
```

Note the exact property keys emitted.

- [ ] **Step 2: Write the snapshot test**

```typescript
// server/src/services/observability/__tests__/llm-call-event-schema.snapshot.test.ts
import { describe, it, expect, vi } from "vitest";
import { LlmCallTelemetryService } from "../LlmCallTelemetryService";
import type {
  IPostHogClient,
  CaptureArgs,
} from "@infrastructure/PostHogClient";

describe("llm.call.completed event schema (contract)", () => {
  it("emits a stable shape — change requires explicit review", () => {
    const captures: CaptureArgs[] = [];
    const client: IPostHogClient = {
      capture: vi.fn((args: CaptureArgs) => {
        captures.push(args);
      }),
      shutdown: vi.fn(async () => {}),
    };
    const service = new LlmCallTelemetryService(client);

    service.record({
      executionType: "image_observation",
      provider: "openai",
      model: "gpt-4o-mini-2024-07-18",
      durationMs: 412,
      promptTokens: 130,
      completionTokens: 28,
      totalTokens: 158,
      finishReason: "stop",
      outcome: "success",
      requestId: "req-fixture",
      userId: "user-fixture",
    });

    expect(captures).toHaveLength(1);
    const capture = captures[0]!;
    const normalized = {
      distinctId: capture.distinctId,
      event: capture.event,
      propertyKeys: Object.keys(capture.properties || {}).sort(),
      sampleValues: {
        executionType: (capture.properties as { executionType?: string })
          ?.executionType,
        provider: (capture.properties as { provider?: string })?.provider,
        outcome: (capture.properties as { outcome?: string })?.outcome,
        totalTokens: (capture.properties as { totalTokens?: number })
          ?.totalTokens,
      },
    };

    expect(normalized).toMatchInlineSnapshot();
  });
});
```

- [ ] **Step 3: Run the test (first run records the snapshot)**

```bash
npm run test:unit -- server/src/services/observability/__tests__/llm-call-event-schema
```

Expected: 1 test PASS — first run records the inline snapshot.

**Caveat on method signature:** `LlmCallTelemetryService.record()` may take a different shape than what's used above. After step 1 confirms the actual signature, adapt the test arguments. The point is to snapshot whatever shape it produces — not to invent fields.

- [ ] **Step 4: Verify the snapshot is non-empty**

```bash
grep -A 30 "toMatchInlineSnapshot" server/src/services/observability/__tests__/llm-call-event-schema.snapshot.test.ts | head -40
```

Expected: the inline snapshot has been populated with the actual emitted shape.

- [ ] **Step 5: Commit PR 3 (tiny, isolated PR)**

```bash
git add server/src/services/observability/__tests__/llm-call-event-schema.snapshot.test.ts
git commit -m "test(source-discrim): snapshot lock llm.call.completed event schema

Closes the snapshot coverage gap noted in observability.md. Pure additive
test; no production code change."
```

---

### Task 11: Frontend `TelemetrySourceInterceptor` (TDD)

**Files:**

- Create: `client/src/services/http/TelemetrySourceInterceptor.ts`
- Test: `client/src/services/http/__tests__/TelemetrySourceInterceptor.test.ts`

- [ ] **Step 1: Confirm interceptor wiring location**

```bash
grep -rn "setupApiAuth\|addRequestInterceptor" client/src/services/http/ client/src/services/ApiClient.ts 2>&1 | head -15
```

Expected: finds `client/src/services/http/AuthInterceptors.ts` (referenced in ApiClient.ts:17) and the registration entry point. The new interceptor will follow the same registration pattern.

- [ ] **Step 2: Write the failing test**

```typescript
// client/src/services/http/__tests__/TelemetrySourceInterceptor.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyTelemetrySourceHeader } from "../TelemetrySourceInterceptor";

describe("applyTelemetrySourceHeader", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("sets X-Telemetry-Source: user in production builds", () => {
    vi.stubEnv("MODE", "production");
    const built = applyTelemetrySourceHeader({
      url: "/api/optimize",
      init: { headers: { "Content-Type": "application/json" } },
    });
    expect(built.init.headers).toMatchObject({
      "X-Telemetry-Source": "user",
      "Content-Type": "application/json",
    });
  });

  it("omits the header in non-production builds", () => {
    vi.stubEnv("MODE", "development");
    const built = applyTelemetrySourceHeader({
      url: "/api/optimize",
      init: { headers: { "Content-Type": "application/json" } },
    });
    expect(built.init.headers).not.toHaveProperty("X-Telemetry-Source");
  });

  it("preserves existing headers", () => {
    vi.stubEnv("MODE", "production");
    const built = applyTelemetrySourceHeader({
      url: "/api/optimize",
      init: { headers: { Authorization: "Bearer xyz" } },
    });
    expect(built.init.headers).toEqual({
      Authorization: "Bearer xyz",
      "X-Telemetry-Source": "user",
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm run test:unit -- client/src/services/http/__tests__/TelemetrySourceInterceptor
```

Expected: FAIL with module-not-found.

- [ ] **Step 4: Implement the interceptor**

```typescript
// client/src/services/http/TelemetrySourceInterceptor.ts
import type { ApiClient } from "../ApiClient";

interface BuiltRequest {
  url: string;
  init: RequestInit;
}

/**
 * Pure helper — used by the interceptor below and exported for unit testing.
 * Adds X-Telemetry-Source: user when this build's MODE is "production".
 * Server-side middleware resolves to "dev" / "ci" / "unknown" otherwise.
 */
export function applyTelemetrySourceHeader(
  payload: BuiltRequest,
): BuiltRequest {
  const mode = (import.meta as { env?: { MODE?: string } }).env?.MODE;
  if (mode !== "production") {
    return payload;
  }
  const existing = (payload.init.headers ?? {}) as Record<string, string>;
  return {
    url: payload.url,
    init: {
      ...payload.init,
      headers: {
        ...existing,
        "X-Telemetry-Source": "user",
      },
    },
  };
}

export function setupTelemetrySource(apiClient: ApiClient): void {
  apiClient.addRequestInterceptor(applyTelemetrySourceHeader);
}
```

- [ ] **Step 5: Run tests to verify pass**

```bash
npm run test:unit -- client/src/services/http/__tests__/TelemetrySourceInterceptor
```

Expected: 3 tests PASS.

- [ ] **Step 6: Type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Do not commit yet — ships with the registration in Task 12.**

---

### Task 12: Wire interceptor into ApiClient

**Files:**

- Modify: `client/src/services/ApiClient.ts`

- [ ] **Step 1: Add the registration**

In `client/src/services/ApiClient.ts`, near the bottom where `setupApiAuth(apiClient)` is called:

```typescript
import { setupApiAuth } from "./http/AuthInterceptors";
import { setupTelemetrySource } from "./http/TelemetrySourceInterceptor";

// ... existing code ...

export const apiClient = new ApiClient();

setupApiAuth(apiClient);
setupTelemetrySource(apiClient);
```

- [ ] **Step 2: Type check + lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 0 errors.

- [ ] **Step 3: Build the client (sanity check that the interceptor is bundled)**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds. If a worktree port collision blocks the dev server, the production build still works (no dev server boot).

- [ ] **Step 4: Commit PR 4**

```bash
git add client/src/services/http/TelemetrySourceInterceptor.ts \
        client/src/services/http/__tests__/TelemetrySourceInterceptor.test.ts \
        client/src/services/ApiClient.ts
git commit -m "feat(source-discrim): frontend sets X-Telemetry-Source: user in prod

Production builds (import.meta.env.MODE === 'production') attach the header
on every request via a new ApiClient interceptor. Dev/test builds omit the
header — server middleware then resolves source to 'dev' or 'ci' via env.

Pairs with the server-side middleware so prod-frontend traffic shows up as
'user' on dashboards instead of 'unknown'."
```

---

### Task 13: Synthetic harness fixtures + utils

**Files:**

- Create: `scripts/synthetic/fixtures/prompts.json`
- Create: `scripts/synthetic/utils/request-helper.ts`

- [ ] **Step 1: Create the prompts fixture**

```json
[
  {
    "id": "subject_01",
    "text": "A young woman with red hair walks through a misty forest at dawn",
    "tags": ["subject", "lighting", "setting"]
  },
  {
    "id": "subject_02",
    "text": "An elderly fisherman casts his line into a calm mountain lake",
    "tags": ["subject", "setting", "action"]
  },
  {
    "id": "camera_01",
    "text": "Aerial drone shot pulling back from a city skyline at sunset",
    "tags": ["camera.movement", "setting", "lighting"]
  },
  {
    "id": "camera_02",
    "text": "Macro close-up of dewdrops on a spider web, shallow depth of field",
    "tags": ["camera.shot", "subject"]
  },
  {
    "id": "lighting_01",
    "text": "A dimly lit jazz club with a single spotlight on a saxophone player",
    "tags": ["lighting", "subject", "setting"]
  },
  {
    "id": "lighting_02",
    "text": "Bright midday sun cuts through tropical palm leaves",
    "tags": ["lighting", "setting"]
  },
  {
    "id": "motion_01",
    "text": "Slow motion shot of a hummingbird hovering near a hibiscus flower",
    "tags": ["camera.speed", "subject", "action"]
  },
  {
    "id": "motion_02",
    "text": "Time-lapse of clouds racing over a desert mesa",
    "tags": ["camera.speed", "setting"]
  },
  {
    "id": "style_01",
    "text": "Cinematic anamorphic shot, film grain, teal and orange color grade",
    "tags": ["style", "color"]
  },
  {
    "id": "style_02",
    "text": "Wes Anderson symmetrical composition, pastel palette",
    "tags": ["style", "composition"]
  },
  {
    "id": "action_01",
    "text": "A barista pours steamed milk creating a heart pattern in coffee",
    "tags": ["action", "subject", "camera.shot"]
  },
  {
    "id": "action_02",
    "text": "Two children chase fireflies in a backyard at dusk",
    "tags": ["action", "subject", "lighting"]
  },
  {
    "id": "setting_01",
    "text": "A bustling night market in Bangkok with neon signs reflected in puddles",
    "tags": ["setting", "lighting"]
  },
  {
    "id": "setting_02",
    "text": "An abandoned 1950s diner overgrown with vines",
    "tags": ["setting", "subject"]
  },
  {
    "id": "compound_01",
    "text": "Handheld camera follows a chef through a busy restaurant kitchen, warm tungsten lighting, shallow focus pulls between faces",
    "tags": ["camera.movement", "subject", "setting", "lighting", "camera.shot"]
  },
  {
    "id": "compound_02",
    "text": "Wide angle establishing shot of a snowy village, dolly forward toward a single illuminated window",
    "tags": ["camera.shot", "camera.movement", "setting", "lighting"]
  },
  {
    "id": "compound_03",
    "text": "Golden hour light catches dust motes in an antique library, slow vertical pan reveals towering bookshelves",
    "tags": ["lighting", "camera.movement", "setting"]
  },
  {
    "id": "minimal_01",
    "text": "A red balloon floats up",
    "tags": ["subject", "action"]
  },
  {
    "id": "minimal_02",
    "text": "Rain on a window",
    "tags": ["subject", "setting"]
  },
  {
    "id": "minimal_03",
    "text": "A single candle flickers",
    "tags": ["subject", "lighting"]
  }
]
```

Write this exact content to `scripts/synthetic/fixtures/prompts.json`.

- [ ] **Step 2: Create the request helper**

```typescript
// scripts/synthetic/utils/request-helper.ts

export interface HarnessRequestResult {
  status: number;
  durationMs: number;
  ok: boolean;
  errorMessage?: string;
}

/**
 * Fires an anonymous request with X-Telemetry-Source: synthetic.
 * No Authorization header — exercises the anonymous code path.
 */
export async function sendSyntheticRequest(
  url: string,
  body: unknown,
): Promise<HarnessRequestResult> {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telemetry-Source": "synthetic",
      },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      durationMs: Date.now() - startedAt,
      ok: response.ok,
      ...(response.ok ? {} : { errorMessage: `HTTP ${response.status}` }),
    };
  } catch (err) {
    return {
      status: 0,
      durationMs: Date.now() - startedAt,
      ok: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface HarnessPrompt {
  id: string;
  text: string;
  tags: string[];
}

export async function loadPrompts(): Promise<HarnessPrompt[]> {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const { dirname, resolve } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, "..", "fixtures", "prompts.json");
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as HarnessPrompt[];
}

/** Shared shape every driver returns. Defined here so drivers stay tiny. */
export interface DriverSummary {
  surface: string;
  totalCalls: number;
  successCount: number;
  errorCount: number;
  avgDurationMs: number;
  errors: { promptId: string; message: string }[];
}

/** Aggregate a driver's per-request results into a summary. */
export function summarizeDriverResults(
  surface: string,
  results: { prompt: HarnessPrompt; res: HarnessRequestResult }[],
): DriverSummary {
  const totalCalls = results.length;
  const successCount = results.filter((r) => r.res.ok).length;
  const errorCount = totalCalls - successCount;
  const avgDurationMs =
    totalCalls > 0
      ? Math.round(
          results.reduce((s, r) => s + r.res.durationMs, 0) / totalCalls,
        )
      : 0;
  const errors = results
    .filter((r) => !r.res.ok)
    .map((r) => ({
      promptId: r.prompt.id,
      message: r.res.errorMessage ?? "unknown",
    }));
  return {
    surface,
    totalCalls,
    successCount,
    errorCount,
    avgDurationMs,
    errors,
  };
}
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Do not commit — ships with full harness in Task 16.**

---

### Task 14: Per-surface drivers

**Files:**

- Create: `scripts/synthetic/drivers/optimize.driver.ts`
- Create: `scripts/synthetic/drivers/suggestions.driver.ts`
- Create: `scripts/synthetic/drivers/span-labeling.driver.ts`

- [ ] **Step 1: Determine the request shapes**

```bash
grep -rn "z.object\|RequestSchema\|requestSchema" server/src/routes/optimize.routes.ts server/src/routes/enhancement/enhancementSuggestionsRoute.ts server/src/routes/labelSpans/requestParser.ts 2>&1 | head -20
```

Expected: identifies the Zod request schemas for each endpoint. Confirm the minimal viable request body for each. Adapt the drivers below if a required field is missing.

- [ ] **Step 2: Optimize driver**

```typescript
// scripts/synthetic/drivers/optimize.driver.ts
import {
  sendSyntheticRequest,
  summarizeDriverResults,
  type DriverSummary,
  type HarnessPrompt,
  type HarnessRequestResult,
} from "../utils/request-helper.js";

export async function driveOptimize(
  baseUrl: string,
  prompts: HarnessPrompt[],
): Promise<DriverSummary> {
  const results: { prompt: HarnessPrompt; res: HarnessRequestResult }[] = [];

  for (const prompt of prompts) {
    const res = await sendSyntheticRequest(`${baseUrl}/api/optimize`, {
      prompt: prompt.text,
      mode: "video",
    });
    results.push({ prompt, res });
    console.log(
      `[optimize] ${prompt.id} ${res.ok ? "OK" : "ERR"} ${res.durationMs}ms${res.errorMessage ? " — " + res.errorMessage : ""}`,
    );
  }

  return summarizeDriverResults("optimize", results);
}
```

- [ ] **Step 3: Suggestions driver**

```typescript
// scripts/synthetic/drivers/suggestions.driver.ts
import {
  sendSyntheticRequest,
  summarizeDriverResults,
  type DriverSummary,
  type HarnessPrompt,
  type HarnessRequestResult,
} from "../utils/request-helper.js";

export async function driveSuggestions(
  baseUrl: string,
  prompts: HarnessPrompt[],
): Promise<DriverSummary> {
  const results: { prompt: HarnessPrompt; res: HarnessRequestResult }[] = [];

  for (const prompt of prompts) {
    // Pick the first tag as the "highlighted category" — small but realistic
    const category = prompt.tags[0] ?? "subject";
    const res = await sendSyntheticRequest(
      `${baseUrl}/api/enhancement/suggestions`,
      {
        prompt: prompt.text,
        selectedSpan: { text: prompt.text.split(" ")[0] ?? "shot", category },
        isVideoPrompt: true,
      },
    );
    results.push({ prompt, res });
    console.log(
      `[suggestions] ${prompt.id} ${res.ok ? "OK" : "ERR"} ${res.durationMs}ms${res.errorMessage ? " — " + res.errorMessage : ""}`,
    );
  }

  return summarizeDriverResults("suggestions", results);
}
```

**Caveat:** the request shape (`selectedSpan` keys, etc.) is inferred from the route handler context, not from a verified schema dump. Validate in step 1 above. If the schema differs (e.g., wants `phraseRole` or a different selector shape), adapt this driver.

- [ ] **Step 4: Span-labeling driver**

```typescript
// scripts/synthetic/drivers/span-labeling.driver.ts
import {
  sendSyntheticRequest,
  summarizeDriverResults,
  type DriverSummary,
  type HarnessPrompt,
  type HarnessRequestResult,
} from "../utils/request-helper.js";

export async function driveSpanLabels(
  baseUrl: string,
  prompts: HarnessPrompt[],
): Promise<DriverSummary> {
  const results: { prompt: HarnessPrompt; res: HarnessRequestResult }[] = [];

  for (const prompt of prompts) {
    const res = await sendSyntheticRequest(`${baseUrl}/api/llm/label-spans`, {
      text: prompt.text,
    });
    results.push({ prompt, res });
    console.log(
      `[span-labels] ${prompt.id} ${res.ok ? "OK" : "ERR"} ${res.durationMs}ms${res.errorMessage ? " — " + res.errorMessage : ""}`,
    );
  }

  return summarizeDriverResults("span-labels", results);
}
```

- [ ] **Step 5: Type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Do not commit yet — ships with the entry point.**

---

### Task 14b: Driver smoke test (proves headers without network calls)

Spec § 4 requires `synthetic-harness.smoke.test.ts`. This test mocks `fetch` and asserts the drivers construct exactly the requests we expect with the right header — without firing any real network calls.

**Files:**

- Test: `scripts/synthetic/__tests__/drivers.smoke.test.ts`

- [ ] **Step 1: Confirm test discovery for `scripts/synthetic/__tests__/`**

```bash
ls scripts/evaluation/__tests__/ 2>/dev/null | head -3
```

If `scripts/evaluation/__tests__/` is in the unit-test glob (it is, from sub-project #0), then `scripts/synthetic/__tests__/` will be too. If not, follow the same config adjustment used in sub-project #0's Task 0.

- [ ] **Step 2: Write the smoke test**

```typescript
// scripts/synthetic/__tests__/drivers.smoke.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { driveOptimize } from "../drivers/optimize.driver";
import { driveSuggestions } from "../drivers/suggestions.driver";
import { driveSpanLabels } from "../drivers/span-labeling.driver";
import type { HarnessPrompt } from "../utils/request-helper";

const PROMPTS: HarnessPrompt[] = [
  { id: "p1", text: "a young woman walks through a forest", tags: ["subject"] },
  { id: "p2", text: "aerial shot of city skyline", tags: ["camera.movement"] },
];

const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  fetchSpy.mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("synthetic harness drivers — smoke", () => {
  it("driveOptimize fires N requests with X-Telemetry-Source: synthetic", async () => {
    const summary = await driveOptimize("http://localhost:3001", PROMPTS);
    expect(fetchSpy).toHaveBeenCalledTimes(PROMPTS.length);
    for (const call of fetchSpy.mock.calls) {
      const url = call[0] as string;
      const init = call[1] as RequestInit;
      expect(url).toBe("http://localhost:3001/api/optimize");
      expect(
        (init.headers as Record<string, string>)["X-Telemetry-Source"],
      ).toBe("synthetic");
      expect(
        (init.headers as Record<string, string>)["Authorization"],
      ).toBeUndefined();
    }
    expect(summary.totalCalls).toBe(PROMPTS.length);
    expect(summary.successCount).toBe(PROMPTS.length);
  });

  it("driveSuggestions hits /api/enhancement/suggestions with the right header", async () => {
    await driveSuggestions("http://localhost:3001", PROMPTS);
    expect(fetchSpy).toHaveBeenCalledTimes(PROMPTS.length);
    for (const call of fetchSpy.mock.calls) {
      expect(call[0]).toBe("http://localhost:3001/api/enhancement/suggestions");
      const init = call[1] as RequestInit;
      expect(
        (init.headers as Record<string, string>)["X-Telemetry-Source"],
      ).toBe("synthetic");
    }
  });

  it("driveSpanLabels hits /api/llm/label-spans with the right header", async () => {
    await driveSpanLabels("http://localhost:3001", PROMPTS);
    expect(fetchSpy).toHaveBeenCalledTimes(PROMPTS.length);
    for (const call of fetchSpy.mock.calls) {
      expect(call[0]).toBe("http://localhost:3001/api/llm/label-spans");
      const init = call[1] as RequestInit;
      expect(
        (init.headers as Record<string, string>)["X-Telemetry-Source"],
      ).toBe("synthetic");
    }
  });

  it("zero requests carry a source other than 'synthetic'", async () => {
    await driveOptimize("http://localhost:3001", PROMPTS);
    await driveSuggestions("http://localhost:3001", PROMPTS);
    await driveSpanLabels("http://localhost:3001", PROMPTS);
    const sources = fetchSpy.mock.calls.map(
      (c) =>
        ((c[1] as RequestInit).headers as Record<string, string>)[
          "X-Telemetry-Source"
        ],
    );
    const non = sources.filter((s) => s !== "synthetic");
    expect(non).toEqual([]);
  });

  it("error responses count toward errorCount in the summary", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: "x" }), { status: 500 }),
    );
    const summary = await driveOptimize("http://localhost:3001", PROMPTS);
    expect(summary.errorCount).toBe(PROMPTS.length);
    expect(summary.successCount).toBe(0);
  });
});
```

- [ ] **Step 3: Run the test**

```bash
npm run test:unit -- scripts/synthetic/__tests__/drivers.smoke
```

Expected: 5 tests PASS.

- [ ] **Step 4: Do not commit yet — bundles with Task 15's commit (PR 5).**

---

### Task 15: Harness entry point + npm script

**Files:**

- Create: `scripts/synthetic/run-harness.ts`
- Modify: `package.json`

- [ ] **Step 1: Create the entry point**

```typescript
// scripts/synthetic/run-harness.ts
import { loadPrompts } from "./utils/request-helper.js";
import { driveOptimize } from "./drivers/optimize.driver.js";
import { driveSuggestions } from "./drivers/suggestions.driver.js";
import { driveSpanLabels } from "./drivers/span-labeling.driver.js";

interface CliConfig {
  baseUrl: string;
  surfaces: Set<"optimize" | "suggestions" | "span-labels">;
}

function parseArgs(argv: string[]): CliConfig {
  const surfaces = new Set<"optimize" | "suggestions" | "span-labels">();
  let only: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only") {
      only = argv[++i];
    }
  }
  if (only) {
    for (const name of only.split(",")) {
      const trimmed = name.trim();
      if (
        trimmed === "optimize" ||
        trimmed === "suggestions" ||
        trimmed === "span-labels"
      ) {
        surfaces.add(trimmed);
      } else {
        console.error(`Unknown surface: ${trimmed}`);
        process.exit(2);
      }
    }
  } else {
    surfaces.add("optimize");
    surfaces.add("suggestions");
    surfaces.add("span-labels");
  }
  const baseUrl = process.env.VIDRA_API_URL ?? "http://localhost:3001";
  if (!process.env.VIDRA_API_URL) {
    console.warn(
      "VIDRA_API_URL not set — defaulting to http://localhost:3001 (local dev server).",
    );
  }
  return { baseUrl, surfaces };
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const prompts = await loadPrompts();
  console.log(
    `Running synthetic harness against ${config.baseUrl} with ${prompts.length} prompts.`,
  );
  console.log(`Surfaces: ${[...config.surfaces].join(", ")}`);

  const summaries = await Promise.all([
    config.surfaces.has("optimize")
      ? driveOptimize(config.baseUrl, prompts)
      : Promise.resolve(null),
    config.surfaces.has("suggestions")
      ? driveSuggestions(config.baseUrl, prompts)
      : Promise.resolve(null),
    config.surfaces.has("span-labels")
      ? driveSpanLabels(config.baseUrl, prompts)
      : Promise.resolve(null),
  ]);

  let anyErrors = false;
  console.log("\n=== Summary ===");
  for (const s of summaries) {
    if (!s) continue;
    console.log(
      `${s.surface}: ${s.successCount}/${s.totalCalls} ok, avg ${s.avgDurationMs}ms${s.errorCount > 0 ? `, ${s.errorCount} errors` : ""}`,
    );
    if (s.errorCount > 0) {
      anyErrors = true;
      for (const e of s.errors.slice(0, 5)) {
        console.log(`  - ${e.promptId}: ${e.message}`);
      }
      if (s.errors.length > 5) {
        console.log(`  ... and ${s.errors.length - 5} more`);
      }
    }
  }

  if (anyErrors) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Harness failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

Open `package.json`. Find the `scripts` block. Add:

```json
"synthetic": "tsx scripts/synthetic/run-harness.ts"
```

Place it alphabetically near other eval scripts (`eval:golden-set`, etc.).

- [ ] **Step 3: Smoke test against local dev server (manual)**

Open two terminals:

Terminal A — start the server:

```bash
npm run server
```

Terminal B — run the harness (this is the day-one local validation):

```bash
unset VIDRA_API_URL
npm run synthetic -- --only span-labels
```

Expected: 20 requests fire against `/api/llm/label-spans`, most succeed, summary printed. If many requests error, the request shape is wrong — debug before continuing.

- [ ] **Step 4: Verify events landed in PostHog**

If `POSTHOG_API_KEY` is set in the server's `.env`, the events should be in PostHog within ~30 seconds. Query:

```sql
SELECT timestamp, event, properties.source, properties.spanCount
FROM events
WHERE event = 'label-spans.completed'
  AND timestamp > now() - INTERVAL 5 MINUTE
ORDER BY timestamp DESC
LIMIT 25
```

Expected: ≥ 15 rows (some may have errored), all with `properties.source = 'synthetic'`.

- [ ] **Step 5: Do not commit yet — ships with workflow in Task 16.**

---

### Task 16: GitHub Actions workflow (cron disabled)

The workflow is committed so it's reviewable and discoverable, but its `schedule:` trigger stays commented out until Vidra has a deployed environment.

**Files:**

- Create: `.github/workflows/synthetic-harness.yml`
- Create: `scripts/synthetic/README.md`

- [ ] **Step 1: Create the workflow file**

```yaml
# .github/workflows/synthetic-harness.yml
#
# Synthetic traffic harness — fires anonymous requests against
# Optimize / Suggestions / Span Labeling endpoints so dashboards
# have pre-launch data flowing.
#
# DISABLED CRON: Vidra has no deployed production environment as of
# 2026-05-10. Uncomment the `schedule:` block once VIDRA_API_URL points
# at a deployed environment.

name: Synthetic Traffic Harness

on:
  workflow_dispatch:
    inputs:
      target_url:
        description: "Target URL (overrides VIDRA_API_URL repo variable)"
        required: false
        type: string
      surfaces:
        description: "Comma-separated surfaces (default: all three)"
        required: false
        type: string
        default: "optimize,suggestions,span-labels"
  # schedule:
  #   - cron: "0 8 * * *"  # 08:00 UTC daily — enable once VIDRA_API_URL is wired

jobs:
  run-harness:
    runs-on: ubuntu-latest
    env:
      NODE_ENV: production
      POSTHOG_API_KEY: ${{ secrets.POSTHOG_API_KEY }}
      VIDRA_API_URL: ${{ inputs.target_url || vars.VIDRA_API_URL }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - name: Verify target URL is set
        run: |
          if [ -z "$VIDRA_API_URL" ]; then
            echo "::error::VIDRA_API_URL is not set. Set the repo variable or pass target_url to workflow_dispatch."
            exit 1
          fi
          echo "Target: $VIDRA_API_URL"
      - name: Run harness
        run: npm run synthetic -- --only "${{ inputs.surfaces || 'optimize,suggestions,span-labels' }}"
```

- [ ] **Step 2: Validate YAML parses**

```bash
npx js-yaml .github/workflows/synthetic-harness.yml > /dev/null
```

Expected: parses without error.

- [ ] **Step 3: Create the README**

````markdown
# Synthetic Traffic Harness

Fires anonymous requests against Optimize, Suggestions, and Span Labeling endpoints — tagged `X-Telemetry-Source: synthetic`. Source: sub-project #1 of the [Measurement Program](../../docs/superpowers/programs/measurement.md).

## Usage

```bash
# Local dev server (default)
npm run synthetic

# Specific surfaces only
npm run synthetic -- --only optimize,suggestions

# Against a deployed environment
VIDRA_API_URL=https://api.example.com npm run synthetic
```
````

## Fixtures

`fixtures/prompts.json` contains 20 hand-picked prompts covering the span taxonomy categories (subject, camera, lighting, motion, style, action, setting). When the taxonomy or surface contracts change meaningfully, refresh the fixtures by editing this file directly — they're not generated.

## CI

The `.github/workflows/synthetic-harness.yml` workflow ships with `schedule:` commented out. Enable by uncommenting once a stable `VIDRA_API_URL` (production or staging) exists. The workflow also supports `workflow_dispatch` for one-off runs.

````

- [ ] **Step 4: Commit PR 5 (harness + workflow)**

```bash
git add scripts/synthetic/ \
        .github/workflows/synthetic-harness.yml \
        package.json
git commit -m "feat(source-discrim): synthetic-traffic harness for Optimize/Suggestions/SpanLabels

Adds scripts/synthetic/ — a TS harness that fires anonymous requests against
the three prompt-editing-core endpoints, tagged X-Telemetry-Source: synthetic
so the source-discriminator middleware tags them correctly.

20 canonical prompts covering the span taxonomy live in fixtures/prompts.json.
Configurable via VIDRA_API_URL; defaults to http://localhost:3001 for local
runs. New npm script: 'npm run synthetic'.

Includes a GitHub Actions workflow with workflow_dispatch enabled and
schedule: commented out — uncomment once Vidra has a deployed environment."
````

---

### Task 17: Build three new dashboards via PostHog MCP

Not a code task. Driven via the PostHog MCP from a Claude session or interactive use.

- [ ] **Step 1: Switch PostHog MCP context**

```
mcp__posthog__switch-organization 019e1071-cc96-0000-e1ef-1ccfb297b6c0
mcp__posthog__switch-project       417445
```

- [ ] **Step 2: Generate baseline data**

Before building tiles, run the local harness twice so each event type has ≥ 30 events:

```bash
# In one terminal:
npm run server

# In another:
npm run synthetic
npm run synthetic
```

Wait ~30 seconds for PostHog ingestion.

- [ ] **Step 3: Build "Suggestions Health" dashboard**

Use `mcp__posthog__dashboard-create`:

- name: `"Suggestions Health"`
- description: `"Per-call health of /api/enhancement/suggestions (click-to-enhance) — latency, cache hit, outcome, suggestions returned."`

Record the returned dashboard ID.

Then `mcp__posthog__insight-create` for each tile below, followed by `mcp__posthog__dashboard-update` to add it. Use `DataVisualizationNode` wrapping a HogQL `source`.

**Tile 1 — Duration over time (avg / p95).**

```sql
SELECT toStartOfHour(timestamp) AS hour,
  avg(properties.durationMs) AS avg_ms,
  quantile(0.95)(properties.durationMs) AS p95_ms
FROM events
WHERE event = 'suggestions.completed' AND timestamp > now() - INTERVAL 7 DAY
GROUP BY hour ORDER BY hour
```

**Tile 2 — Cache hit rate.**

```sql
SELECT toStartOfDay(timestamp) AS day,
  countIf(properties.cacheHit) AS hits,
  count() AS total,
  countIf(properties.cacheHit) / count() AS hit_rate
FROM events
WHERE event = 'suggestions.completed' AND timestamp > now() - INTERVAL 14 DAY
GROUP BY day ORDER BY day
```

**Tile 3 — Outcome breakdown.**

```sql
SELECT properties.outcome AS outcome, count() AS n
FROM events
WHERE event = 'suggestions.completed' AND timestamp > now() - INTERVAL 7 DAY
GROUP BY outcome
```

**Tile 4 — Errors by errorStage.**

```sql
SELECT properties.errorStage AS stage, count() AS n
FROM events
WHERE event = 'suggestions.completed' AND properties.outcome = 'error'
  AND timestamp > now() - INTERVAL 7 DAY
GROUP BY stage ORDER BY n DESC
```

**Tile 5 — Suggestions returned distribution.**

```sql
SELECT properties.suggestionCount AS n_suggestions, count() AS calls
FROM events
WHERE event = 'suggestions.completed' AND timestamp > now() - INTERVAL 7 DAY
GROUP BY n_suggestions ORDER BY n_suggestions
```

**Tile 6 — Per-category breakdown.**

```sql
SELECT properties.highlightedCategory AS category, count() AS n
FROM events
WHERE event = 'suggestions.completed' AND timestamp > now() - INTERVAL 7 DAY
GROUP BY category ORDER BY n DESC LIMIT 20
```

**Tile 7 — Recent 50 calls.**

```sql
SELECT timestamp, properties.outcome, properties.durationMs, properties.suggestionCount, properties.cacheHit, properties.source
FROM events
WHERE event = 'suggestions.completed'
ORDER BY timestamp DESC LIMIT 50
```

Record each insight ID.

- [ ] **Step 4: Build "Span Labeling Health" dashboard**

Same pattern. Tiles:

```sql
-- Duration over time
SELECT toStartOfHour(timestamp) AS hour,
  avg(properties.durationMs) AS avg_ms,
  quantile(0.95)(properties.durationMs) AS p95_ms
FROM events WHERE event = 'label-spans.completed' AND timestamp > now() - INTERVAL 7 DAY
GROUP BY hour ORDER BY hour
```

```sql
-- Cache hit rate
SELECT toStartOfDay(timestamp) AS day,
  countIf(properties.cacheHit) / count() AS hit_rate
FROM events WHERE event = 'label-spans.completed' AND timestamp > now() - INTERVAL 14 DAY
GROUP BY day ORDER BY day
```

```sql
-- Outcome breakdown
SELECT properties.outcome, count() FROM events
WHERE event = 'label-spans.completed' AND timestamp > now() - INTERVAL 7 DAY
GROUP BY properties.outcome
```

```sql
-- Span count distribution
SELECT properties.spanCount AS spans, count() AS calls FROM events
WHERE event = 'label-spans.completed' AND timestamp > now() - INTERVAL 7 DAY
GROUP BY spans ORDER BY spans
```

```sql
-- Provider breakdown
SELECT properties.provider AS provider, count() FROM events
WHERE event = 'label-spans.completed' AND timestamp > now() - INTERVAL 7 DAY
GROUP BY provider
```

```sql
-- Errors by errorStage
SELECT properties.errorStage AS stage, count() AS n FROM events
WHERE event = 'label-spans.completed' AND properties.outcome = 'error'
  AND timestamp > now() - INTERVAL 7 DAY
GROUP BY stage ORDER BY n DESC
```

```sql
-- Recent 50
SELECT timestamp, properties.outcome, properties.durationMs, properties.spanCount, properties.cacheHit, properties.provider, properties.source
FROM events WHERE event = 'label-spans.completed'
ORDER BY timestamp DESC LIMIT 50
```

- [ ] **Step 5: Build "LLM Calls Health" dashboard**

Tiles:

```sql
-- Calls by executionType over time
SELECT toStartOfHour(timestamp) AS hour, properties.executionType AS execType, count() AS calls
FROM events WHERE event = 'llm.call.completed' AND timestamp > now() - INTERVAL 7 DAY
GROUP BY hour, execType ORDER BY hour
```

```sql
-- p95 latency by executionType
SELECT properties.executionType AS execType, quantile(0.95)(properties.durationMs) AS p95_ms, avg(properties.durationMs) AS avg_ms, count() AS calls
FROM events WHERE event = 'llm.call.completed' AND timestamp > now() - INTERVAL 7 DAY
GROUP BY execType ORDER BY p95_ms DESC
```

```sql
-- Error rate by executionType
SELECT properties.executionType AS execType,
  countIf(properties.outcome = 'error') / count() AS error_rate,
  count() AS calls
FROM events WHERE event = 'llm.call.completed' AND timestamp > now() - INTERVAL 7 DAY
GROUP BY execType ORDER BY error_rate DESC
```

```sql
-- Total tokens by executionType
SELECT properties.executionType AS execType, sum(properties.totalTokens) AS total_tokens
FROM events WHERE event = 'llm.call.completed' AND timestamp > now() - INTERVAL 7 DAY
GROUP BY execType ORDER BY total_tokens DESC
```

```sql
-- Token use by provider × model
SELECT properties.provider AS provider, properties.model AS model,
  sum(properties.totalTokens) AS total_tokens, count() AS calls
FROM events WHERE event = 'llm.call.completed' AND timestamp > now() - INTERVAL 7 DAY
GROUP BY provider, model ORDER BY total_tokens DESC
```

- [ ] **Step 6: Add source filter to existing T2V Optimize Health dashboard**

Open the dashboard (id `1565688`). Add a global filter `properties.source = 'user'` at the dashboard level. Save.

Optional: duplicate the dashboard with filter `properties.source = 'synthetic'` and rename to "T2V Optimize — Synthetic Health".

- [ ] **Step 7: Verify all dashboards render**

Open each in the browser:

- `https://us.posthog.com/project/417445/dashboard/<suggestions_id>`
- `https://us.posthog.com/project/417445/dashboard/<span_labeling_id>`
- `https://us.posthog.com/project/417445/dashboard/<llm_calls_id>`

All tiles should render. Some may be sparse pending more harness runs.

- [ ] **Step 8: Record all IDs for documentation in Task 18**

Copy: each dashboard ID, each tile insight ID.

---

### Task 18: Wire alerts + update observability.md

**Files:**

- Modify: `docs/architecture/observability.md`

- [ ] **Step 1: Wire the `unknown` in production alert**

Create a TrendsQuery insight (because PostHog alerts only fire on Trends, not HogQL — same constraint as #0):

- Event: `optimize.completed`
- Filter: `properties.source = 'unknown' AND distinctId NOT LIKE 'synthetic-%'`
- Math: total count
- Group by hour

Then `mcp__posthog__alert-create`:

- name: `"Source 'unknown' in production traffic"`
- insight: the trends insight id
- threshold type: absolute, lower=null, upper=N (where N is calibrated after observing baseline — start with N=10 events/hour as a placeholder)
- notification: email or wired Slack — match the alerts already configured in #0

- [ ] **Step 2: Update observability.md — add `source` documentation**

Open `docs/architecture/observability.md`. After the introductory paragraph at the top of the file (before "T2V Optimize Health"), add a new section:

```markdown
## Telemetry source discriminator

Every operational event in PostHog carries a `source` property classifying the traffic origin:

| Value       | Meaning                                                                          |
| ----------- | -------------------------------------------------------------------------------- |
| `user`      | Real frontend user (`X-Telemetry-Source: user` set by production client builds). |
| `synthetic` | Pre-launch traffic harness (`scripts/synthetic/`).                               |
| `ci`        | Continuous integration run (CI=true env or explicit header).                     |
| `dev`       | Local dev server (NODE_ENV !== "production").                                    |
| `unknown`   | Production fallback when no signal resolves — a bug signal; alerted on.          |

Source is resolved once per request by `server/src/middleware/telemetrySource.ts` and stamped on every event automatically by `PostHogClient.capture()`. Telemetry services don't pass source explicitly — it's a cross-cutting concern.

Header takes precedence over inference. Inference order: `CI=true` env → `ci`; otherwise `NODE_ENV === "production"` → `unknown`, else `dev`.

`dogfood` is reserved for future use (team-member traffic distinguished from real-stranger traffic) and is not active pre-launch.
```

- [ ] **Step 3: Add `label-spans.completed` section**

Append after the existing event documentation:

```markdown
---

## Span Labeling telemetry (`label-spans.completed`)

**What it answers:** how long does `/api/llm/label-spans` take per call, cache hit rate, which provider handled it, how many spans were returned, error breakdown by stage.

**Project / dashboard:** Same project (`417445`). Dashboard ["Span Labeling Health" (id `<TILE_ID_FROM_TASK_17>`)](https://us.posthog.com/project/417445/dashboard/<TILE_ID_FROM_TASK_17>).

### Event schema

Emitted by [`SpanLabelingTelemetryService`](../../server/src/services/observability/SpanLabelingTelemetryService.ts). Schema locked by [`label-spans-event-schema.snapshot.test.ts`](../../server/src/services/observability/__tests__/label-spans-event-schema.snapshot.test.ts).

Top-level event properties:

- `requestId` — correlation key
- `userId` — Firebase UID or `null` for anonymous (`distinctId = "anon-<uuid>"`)
- `source` — added automatically; one of `user`/`synthetic`/`ci`/`dev`/`unknown`
- `outcome` — `"success" | "error"`
- `errorMessage` / `errorStage` — present when `outcome === "error"`; `errorStage` is one of `validation` / `llm_call` / `cache` / `post_processing`
- `durationMs` — wall-clock end-to-end
- `promptLength` — input character count
- `spanCount` — labeled spans returned (0 on error)
- `cacheHit` — boolean
- `provider` — `"openai" | "groq" | null`
- `model` — concrete model id or `null` on early failure

### Tiles

| Tile                           | Insight ID | URL                                                         |
| ------------------------------ | ---------- | ----------------------------------------------------------- |
| Duration over time (avg / p95) | `<id>`     | [view](https://us.posthog.com/project/417445/insights/<id>) |
| Cache hit rate                 | `<id>`     | [view](https://us.posthog.com/project/417445/insights/<id>) |
| Outcome breakdown              | `<id>`     | [view](https://us.posthog.com/project/417445/insights/<id>) |
| Span count distribution        | `<id>`     | [view](https://us.posthog.com/project/417445/insights/<id>) |
| Provider breakdown             | `<id>`     | [view](https://us.posthog.com/project/417445/insights/<id>) |
| Errors by errorStage           | `<id>`     | [view](https://us.posthog.com/project/417445/insights/<id>) |
| Recent 50 calls                | `<id>`     | [view](https://us.posthog.com/project/417445/insights/<id>) |

Fill the `<id>` placeholders with the actual insight IDs recorded in Task 17 step 8.
```

- [ ] **Step 4: Add "Suggestions Health" and "LLM Calls Health" tile tables**

Locate the existing Suggestions telemetry section (it already exists from #0 era). Add a "### Tiles" subsection mirroring the pattern above, with the 7 tile insight IDs from Task 17. Then add an entirely new section for "LLM Calls Health" — same pattern, the 5 tile IDs.

- [ ] **Step 5: Document the active alert**

Add an "### Alerts" subsection at the appropriate spot (under "Telemetry source discriminator" or as a top-level "## Alerts" section):

```markdown
### Alerts

| Alert                          | Insight | Trigger                                                                                       | Status                            |
| ------------------------------ | ------- | --------------------------------------------------------------------------------------------- | --------------------------------- |
| Source `unknown` in production | `<id>`  | `optimize.completed` events with `source = 'unknown'` and `distinctId NOT LIKE 'synthetic-%'` | Active                            |
| Synthetic harness silent       | TBD     | `count(events WHERE distinctId LIKE 'synthetic-%') == 0` over 24h                             | Deferred until CI cron is enabled |
```

- [ ] **Step 6: Commit PR 6**

```bash
git add docs/architecture/observability.md
git commit -m "docs(observability): source discriminator + label-spans.completed + new dashboards

Documents the new TelemetrySource property added to every operational event,
the new label-spans.completed schema and Span Labeling Health dashboard,
the new Suggestions Health and LLM Calls Health dashboards, and the
'unknown' in production alert."
```

---

### Task 19: End-to-end validation

After all 6 PRs merged, validate the system end-to-end via the local harness.

- [ ] **Step 1: Confirm server is running with PostHog key**

```bash
grep POSTHOG_API_KEY .env && npm run server
```

- [ ] **Step 2: Run the harness twice**

```bash
npm run synthetic
sleep 30
npm run synthetic
```

- [ ] **Step 3: Verify source stamping**

```sql
SELECT
  event,
  count() AS calls,
  countIf(properties.source = 'synthetic') AS tagged_synthetic,
  countIf(properties.source = 'unknown') AS tagged_unknown
FROM events
WHERE event IN ('optimize.completed', 'suggestions.completed', 'label-spans.completed', 'llm.call.completed')
  AND timestamp > now() - INTERVAL 30 MINUTE
  AND distinctId NOT LIKE 'user-%'
GROUP BY event
```

Expected: for each event, `tagged_synthetic` should equal `calls`, and `tagged_unknown` should be 0.

- [ ] **Step 4: If a row shows `tagged_unknown > 0`, debug in order**

1. Confirm the harness sends `X-Telemetry-Source: synthetic` — check the request-helper code in `scripts/synthetic/utils/request-helper.ts`.
2. Confirm `telemetrySourceMiddleware` is mounted in `middleware.config.ts` after `requestIdMiddleware`.
3. Confirm `PostHogClient.capture()` reads `ctx?.source` from the right ALS store. Check that `getRequestContext` is imported from `@infrastructure/requestContext`, not a sibling file.
4. Confirm middleware order — `telemetrySourceMiddleware` must run before any route handler.

- [ ] **Step 5: Verify dashboards have data**

Open each in the browser:

- Suggestions Health (id from Task 17)
- Span Labeling Health
- LLM Calls Health

All tiles should show non-empty data for the recent harness runs.

- [ ] **Step 6: No commit — validation only.**

---

## Self-review checklist (against spec § 10 success criteria)

- [ ] Every `optimize.completed`, `suggestions.completed`, `llm.call.completed`, `label-spans.completed` event in PostHog carries a `source` property — Tasks 5, 6 (capture wrapper); validated in Task 19
- [ ] Snapshot tests pin schemas — Tasks 8, 10
- [ ] Local harness run produces ≥ 60 surface-level events tagged `source = "synthetic"` — Task 15 step 4 + Task 19 step 3
- [ ] Harness drivers send the right header without firing network calls — Task 14b
- [ ] Three new dashboards exist with the tile inventories from spec § 5 — Task 17
- [ ] T2V Optimize Health default view filters out synthetic; sibling synthetic dashboard exists — Task 17 step 6
- [ ] `unknown`-in-production alert is wired and verifiable — Task 18 step 1 (verifying via forced regression deferred to post-deploy)
- [ ] Harness silent alert wired but inactive — Task 18 step 5
- [ ] Zero impact to user-facing behavior — Tasks 5 step 5 (regression test for existing PostHogClient tests), Task 9 step 7, Task 19
- [ ] `docs/architecture/observability.md` updated — Task 18

### Deliberate divergence from spec § 2.2 / § 4

The spec said "existing snapshot tests for `optimize.completed` and `suggestions.completed` update to include source." This plan **does not** update those tests, and the reason is architectural rather than oversight:

- Those tests use a **mock `IPostHogClient`** injected directly into the telemetry service. They verify the service's contract (what properties the service emits), bypassing the `PostHogClient` wrapper entirely.
- `source` is added by the wrapper, one layer outside the service. Pulling it into the service-level snapshot would either require refactoring those tests to use a real client + ALS context (invasive) or duplicating wrapper behavior in the mock (defeats the point).
- The wrapper integration test in **Task 5** proves source-stamping happens on every event passing through `PostHogClient.capture()` — which is what production actually does. The end-to-end harness validation in **Task 19** confirms it works against real telemetry services.

Net effect: source is provably stamped on every event, but the proof lives in the wrapper test (Task 5), not the service-level snapshots. The existing snapshots stay focused on the service's contract.

---

## Notes on field-name adaptation in Tasks 9, 14

- **Task 9 (route wiring):** the integration assumes `result.meta.provider` and `result.meta.model` exist on the coordinator's return value. Run the grep in Task 9 step 4 to confirm. If the names differ (e.g., `result.metadata.provider`), adapt the integration accordingly. Pass `null` for fields that genuinely aren't available — don't invent shapes.
- **Task 14 (suggestions driver):** the request body assumes `{ prompt, selectedSpan: { text, category }, isVideoPrompt }`. Verify by checking the actual Zod schema in step 1. Adapt if the schema differs.

These are **adaptation points**, not placeholders — the code is concrete, but the property names are tentative until verified against the runtime contracts.

---

## Risks specific to execution

| Risk                                                                                         | Mitigation                                                                                                            |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `shared/` alias not configured in tsconfig                                                   | Task 0 step 1 catches this before any real work.                                                                      |
| `RequestContext` type narrows in a future refactor and breaks source-stamping                | Task 2 documents the dependency on `Record<string, unknown>`; if it narrows, this plan needs `source` field added.    |
| `requestCoalescing` middleware in labelSpansRoute may swallow source                         | If the harness shows `tagged_unknown > 0` on /api/llm/label-spans, suspect coalescing — test by bypassing it locally. |
| Snapshot tests in middleware/PostHogClient tests interfere with vi.mock hoisting             | Task 5 places the mock at module scope; if Vitest complains, switch to `beforeAll` + manual injection.                |
| Smoke testing harness requires a running server, but worktrees can't boot one                | If running in a worktree, skip Task 15 step 3 — defer harness validation to the main checkout.                        |
| PostHog MCP session loses org/project context between tasks                                  | Task 17 step 1 resets context; repeat if a dashboard create fails with 403.                                           |
| `result.meta.provider` doesn't exist on the labelSpans coordinator return                    | Documented in "Notes on field-name adaptation" above. Pass `null` and add a follow-up.                                |
| Integration test gate fails after middleware mount                                           | Task 6 step 1 catches it before commit. Most likely cause: the new middleware throws when `existing` is undefined.    |
| Anonymous request path on /api/enhancement/suggestions has stricter validation than expected | Task 15 step 3 catches it — if the harness shows 4xx errors, validate the request body against the Zod schema.        |
