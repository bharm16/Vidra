#!/usr/bin/env tsx
/**
 * Bounded live-provider smoke (issue #140) — the executable.
 *
 * One pass of the cross-mode path against LIVE providers, exactly as
 * specified in docs/architecture/cross-mode-golden-path.md ("Bounded
 * live-provider smoke test") and issue #140:
 *
 *   leg 1  sketch frame       POST /api/fal/i2i  → fal z-image turbo i2i
 *   leg 2  studio turn        the first studio turn IS an edit (issue #110)
 *                             → the studio_turn LLM decision
 *   leg 3  studio edit image  the same turn's image call → nano-banana-2
 *   leg 4  first frame        POST /api/preview/generate → Flux Schnell
 *
 * No clip: video is the most expensive leg and ADR-0002 keeps generation
 * economics frozen.
 *
 * Enforcement (the issue's rules, one line each):
 *   - The dollar AND request ceilings are derived from the codebase's own
 *     bounded request parameters and conservative cost assumptions,
 *     including permitted retries and fallbacks (ceiling.ts). The runner
 *     aborts BEFORE the first call that would exceed either.
 *   - Missing credentials or unknown cost bounds → verdict NOT-VERIFIED,
 *     exit 2, every absent secret named — never a passing partial run.
 *   - Every output is validated against the same shared replay contract the
 *     cassette is held to, plus a magic-byte sniff of the image itself.
 *
 * The provider boundaries are live (REPLAY_MODE=off); the process-external
 * persistence boundaries stand as the cross-mode harness's controlled
 * doubles (tests/integration/helpers/cross-mode/boundaryDoubles.ts), held to
 * the production contract by the storage-adapter conformance suite (#138).
 * Firebase auth is bypassed via the API-key path; nothing touches GCP.
 *
 * Usage (from the repo root; the four legs spend real money, bounded by the
 * derived ceiling):
 *
 *   FAL_KEY=... OPENAI_API_KEY=... REPLICATE_API_TOKEN=... \
 *   npm run smoke:live
 *
 * Env:
 *   LIVE_SMOKE_REPORT_PATH   where the JSON report is written (CI artifact).
 *   LIVE_SMOKE_MAX_COST_USD  optional; may only LOWER the derived ceiling
 *                            (drills: prove abort-on-exceed). Raising is
 *                            ignored — the ceiling stays derived by default.
 */

import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  collectSmokeCeilingInputs,
  deriveSmokeCeiling,
  type LiveCeilingSources,
} from "./ceiling.ts";
import { runCredentialPreflight } from "./preflight.ts";
import {
  fetchAndSniffImageBytes,
  sniffStoredImageBytes,
  validateFirstFrameResponse,
  validateSketchFrameResponse,
  validateStudioEditTurn,
  type StudioTurnViewPayload,
} from "./validate.ts";
import { dataUriFromBytes, tinyPngDataUri } from "./tinyPng.ts";
import { runSmoke } from "./runner.ts";
import {
  verdictExitCode,
  type SmokeCallRecord,
  type SmokeLegId,
  type SmokeStep,
  type SmokeStepExecution,
} from "./types.ts";
// The canonical cross-mode inputs. The live smoke does not need byte-identical
// requests (nothing replays them), but the words the legs speak should stay
// the walkthrough's words — imported, never an inline copy (goldenScenarios.ts).
import {
  CROSS_MODE_PROMPT,
  CROSS_MODE_SKETCH_INPUTS,
  CROSS_MODE_STUDIO_EDIT_MESSAGE,
} from "../../replay/goldenScenarios.ts";

// ── Env BEFORE any server module loads (they snapshot env at import). ──
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.PORT = "0";
process.env.REPLAY_MODE = "off"; // live seams — the whole point
process.env.ALLOWED_API_KEYS = process.env.ALLOWED_API_KEYS ?? "live-smoke-key";
process.env.ENABLE_STUDIO = "true";
// No leg touches GCP; keep Google's metadata discovery off (same as the
// cross-mode harness).
process.env.METADATA_SERVER_DETECTION = "none";

const SMOKE_API_KEY = process.env.ALLOWED_API_KEYS;
const TURN_POLL_TIMEOUT_MS = 180_000;
const TURN_POLL_INTERVAL_MS = 2_000;

/** The request bodies are the canonical cross-mode inputs — with one live
 * difference: the sketch's drawing must be a real decodable PNG, because fal
 * actually fetches it (the cassette's stub is header-only; replay never
 * forwards it). Two distinct levels, so the drawing and the accepted output
 * have distinct digests. */
const SKETCH_DRAWING_DATA_URI = tinyPngDataUri(0x40, 16);
const ACCEPTED_OUTPUT_DATA_URI = tinyPngDataUri(0xc0, 16);

// ── Boot: the real app over controlled persistence doubles ──────────────

interface StoredObjectView {
  buffer: Buffer;
  contentType: string;
}

interface LiveSmokeContext {
  baseUrl: string;
  objectStore: {
    get(path: string): StoredObjectView | undefined;
    pathFromUrl(url: string): string | null;
  };
  close(): Promise<void>;
}

async function bootLiveHarness(): Promise<LiveSmokeContext> {
  const { configureServices, initializeServices } = await import(
    "../../../server/src/config/services.config.ts"
  );
  const { createApp } = await import("../../../server/src/app.ts");
  const { startServer } = await import("../../../server/src/server.ts");
  const { SketchBudgetService } = await import(
    "../../../server/src/services/sketch-budget/SketchBudgetService.ts"
  );
  const { SketchAllowanceExceededError } = await import(
    "../../../server/src/services/sketch-budget/storage/SketchBudgetStore.ts"
  );
  const {
    InMemoryIdempotencyService,
    InMemoryImageAssetStore,
    InMemoryObjectStore,
    InMemorySessionStore,
    InMemoryStorageService,
    InMemoryStudioProjectStore,
    InMemoryVideoJobStore,
  } = await import(
    "../../../tests/integration/helpers/cross-mode/boundaryDoubles.ts"
  );

  const container = await configureServices();

  // Controlled persistence doubles at the tokens production registers its
  // Firestore/GCS adapters at — the "Controlled" rows of the boundary table
  // (docs/architecture/cross-mode-golden-path.md) stand in the live smoke
  // exactly as in the offline walkthrough.
  const objects = new InMemoryObjectStore();
  container.registerValue("sessionStore", new InMemorySessionStore());
  container.registerValue(
    "imageAssetStore",
    new InMemoryImageAssetStore(objects),
  );
  container.registerValue("storageService", new InMemoryStorageService(objects));
  container.registerValue(
    "requestIdempotencyService",
    new InMemoryIdempotencyService(),
  );
  container.registerValue("videoJobStore", new InMemoryVideoJobStore());
  container.registerValue(
    "studioProjectStore",
    new InMemoryStudioProjectStore(),
  );

  // The sketch relay admits every frame against the creator's daily budget
  // before dispatch — the real service over an in-memory store (one frame
  // cannot approach the cap). Fail-closed, same as production.
  const config = container.resolve<{
    fal: { sketchDailyCapCents: number; sketchFrameCostMillicents: number };
  }>("config");
  class InMemorySketchBudgetStore {
    private readonly reserved = new Map<string, number>();
    reserve(reservation: {
      userId: string;
      day: string;
      millicents: number;
      capMillicents: number;
    }): Promise<void> {
      const key = `${String(reservation.userId)}|${reservation.day}`;
      const already = this.reserved.get(key) ?? 0;
      const next = already + reservation.millicents;
      if (next > reservation.capMillicents) {
        return Promise.reject(
          new SketchAllowanceExceededError(
            already,
            reservation.millicents,
            reservation.capMillicents,
          ),
        );
      }
      this.reserved.set(key, next);
      return Promise.resolve();
    }
  }
  container.registerValue(
    "sketchBudgetService",
    new SketchBudgetService({
      store: new InMemorySketchBudgetStore(),
      dailyCapCents: config.fal.sketchDailyCapCents,
      frameCostMillicents: config.fal.sketchFrameCostMillicents,
      now: () => new Date(),
    }),
  );

  // The first-frame route reserves one credit before dispatch and refunds on
  // failure. Credits are a Firestore boundary; the smoke's subject is the
  // PROVIDER, so a deterministic grant stands at the token (the credit
  // mechanics are the routes' own tests' subject).
  container.registerValue("userCreditService", {
    async reserveCredits(): Promise<boolean> {
      return true;
    },
    async refundCredits(): Promise<boolean> {
      return true;
    },
    async getBalance(): Promise<number> {
      return 1000;
    },
    async ensureStarterGrant(): Promise<void> {
      return undefined;
    },
  });

  await initializeServices(container);
  const app = createApp(container);
  const server = await startServer(app, container);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error(`Expected a TCP address, received ${String(address)}`);
  }

  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    objectStore: objects,
    async close(): Promise<void> {
      await new Promise<void>((resolveClose) =>
        server.close(() => resolveClose()),
      );
    },
  };
}

// ── HTTP helpers ─────────────────────────────────────────────────────────

interface HttpJsonResponse {
  status: number;
  json: Record<string, unknown>;
}

async function postJson(
  ctx: LiveSmokeContext,
  path: string,
  body: unknown,
  timeoutMs = 60_000,
): Promise<HttpJsonResponse> {
  const response = await fetch(`${ctx.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": String(SMOKE_API_KEY),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: response.status, json };
}

async function getJson(
  ctx: LiveSmokeContext,
  path: string,
): Promise<HttpJsonResponse> {
  const response = await fetch(`${ctx.baseUrl}${path}`, {
    headers: { "x-api-key": String(SMOKE_API_KEY) },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: response.status, json };
}

// ── The four legs, as runner steps ────────────────────────────────────────

/** Shared mutable walk state threaded through the steps in order. */
interface WalkState {
  sessionId: string;
  promptVersionId: string;
  sketchTakeId: string;
  studioProjectId: string;
  /** The frame bytes fal returned — what "Use this" accepts, as the browser sends it. */
  acceptedOutputDataUri: string;
}

interface StepDef {
  id: string;
  label: string;
  reserves: readonly SmokeLegId[];
  run: (
    ctx: LiveSmokeContext,
    state: WalkState,
    emit: (call: SmokeCallRecord) => void,
  ) => Promise<SmokeStepExecution>;
}

function stepDefs(state: WalkState): readonly StepDef[] {
  return [
    {
      id: "sketch-frame",
      label: "one sketch frame through the fal relay (z-image turbo i2i)",
      reserves: ["sketch-frame"],
      run: async (ctx, _state, emit) => {
        const startedAt = Date.now();
        const response = await postJson(
          ctx,
          "/api/fal/i2i",
          {
            prompt: CROSS_MODE_PROMPT,
            image_url: SKETCH_DRAWING_DATA_URI,
            strength: CROSS_MODE_SKETCH_INPUTS.strength,
            num_inference_steps: CROSS_MODE_SKETCH_INPUTS.steps,
            seed: 20_260_921,
          },
          45_000,
        );
        if (response.status !== 200) {
          emit({
            leg: "sketch-frame",
            outcome: "failed",
            detail: `relay answered ${String(response.status)}`,
            durationMs: Date.now() - startedAt,
          });
          return {
            status: "failed",
            reason: `sketch frame relay answered ${String(response.status)}`,
          };
        }
        const validated = validateSketchFrameResponse(response.json);
        if (!validated.ok) {
          emit({
            leg: "sketch-frame",
            outcome: "invalid",
            detail: validated.reason,
            durationMs: Date.now() - startedAt,
          });
          return { status: "failed", reason: validated.reason };
        }
        const sniff = await fetchAndSniffImageBytes(validated.imageUrl, fetch);
        if (!sniff.ok) {
          emit({
            leg: "sketch-frame",
            outcome: "invalid",
            detail: `contract ok, bytes not: ${sniff.reason}`,
            durationMs: Date.now() - startedAt,
          });
          return {
            status: "failed",
            reason: `sketch frame output invalid: ${sniff.reason}`,
          };
        }
        emit({
          leg: "sketch-frame",
          outcome: "validated",
          detail: `fal answered with a ${sniff.format} frame (${String(sniff.bytes)} bytes)`,
          durationMs: Date.now() - startedAt,
        });
        // The frame the relay actually produced is what the creator sees —
        // hand its bytes to the accept door as the live output, exactly as
        // the browser does.
        const frameBytes = await fetchBytes(validated.imageUrl);
        if (frameBytes) {
          state.acceptedOutputDataUri = dataUriFromBytes(
            frameBytes.buffer,
            frameBytes.mime,
          );
        }
        return { status: "passed" };
      },
    },
    {
      id: "accept-and-bridge",
      label:
        "Use this admits the frame into a session; Refine in the studio bridges it through the media resolver (issues #109/#110)",
      reserves: [],
      run: async (ctx, state) => {
        const accepted = await postJson(ctx, "/api/sketch/accept", {
          liveOutputDataUri: state.acceptedOutputDataUri ?? ACCEPTED_OUTPUT_DATA_URI,
          sketchSnapshotDataUri: SKETCH_DRAWING_DATA_URI,
          inputs: CROSS_MODE_SKETCH_INPUTS,
          idempotencyKey: "live-smoke-accept-1",
        });
        if (accepted.status !== 201) {
          return {
            status: "failed" as const,
            reason: `sketch accept answered ${String(accepted.status)}: ${JSON.stringify(accepted.json).slice(0, 300)}`,
          };
        }
        const acceptData = accepted.json.data as
          | { sessionId?: string; promptVersionId?: string; generationId?: string }
          | undefined;
        if (
          !acceptData?.sessionId ||
          !acceptData.promptVersionId ||
          !acceptData.generationId
        ) {
          return {
            status: "failed" as const,
            reason: "sketch accept returned no session identity",
          };
        }
        state.sessionId = acceptData.sessionId;
        state.promptVersionId = acceptData.promptVersionId;
        state.sketchTakeId = acceptData.generationId;

        const bridge = await postJson(
          ctx,
          "/api/studio/projects/from-session-picture",
          { sessionId: state.sessionId, generationId: state.sketchTakeId },
        );
        if (bridge.status !== 201) {
          return {
            status: "failed" as const,
            reason: `studio bridge answered ${String(bridge.status)} (the session picture must open a project through the real storage path — issue #109): ${JSON.stringify(bridge.json).slice(0, 300)}`,
          };
        }
        const project = bridge.json.data as { id?: string } | undefined;
        if (!project?.id) {
          return {
            status: "failed" as const,
            reason: "studio bridge returned no project id",
          };
        }
        state.studioProjectId = project.id;
        return { status: "passed" as const };
      },
    },
    {
      id: "studio-edit-turn",
      label:
        "one studio turn whose first action is an edit: the studio_turn LLM decision + the nano-banana-2 edit image",
      reserves: ["studio-turn", "studio-edit-image"],
      run: async (ctx, state, emit) => {
        const startedAt = Date.now();
        const turnId = await startStudioTurn(
          ctx,
          state.studioProjectId,
          CROSS_MODE_STUDIO_EDIT_MESSAGE,
        );
        if (typeof turnId !== "string") {
          return { status: "failed", reason: `studio turn was not accepted: ${String(turnId)}` };
        }
        const turn = await pollStudioTurn(ctx, state.studioProjectId, turnId);
        const validated = validateStudioEditTurn(turn);
        for (const record of validated.records) {
          emit({ ...record, durationMs: Date.now() - startedAt });
        }
        if (!validated.ok || validated.imageUrl === null) {
          return {
            status: "failed",
            reason: validated.reason ?? "studio turn produced no image",
          };
        }
        const bytes = storedImageBytes(ctx, validated.imageUrl);
        const sniff = sniffStoredImageBytes(bytes);
        if (!sniff.ok) {
          emit({
            leg: "studio-edit-image",
            outcome: "invalid",
            detail: sniff.reason,
            durationMs: Date.now() - startedAt,
          });
          return {
            status: "failed",
            reason: `studio edit image invalid: ${sniff.reason}`,
          };
        }
        emit({
          leg: "studio-edit-image",
          outcome: "validated",
          detail: `edit stored as a ${sniff.format} image (${String(bytes?.byteLength ?? 0)} bytes)`,
          durationMs: Date.now() - startedAt,
        });
        return { status: "passed" };
      },
    },
    {
      id: "first-frame",
      label:
        "one first frame from the session's words (Flux Schnell via /api/preview/generate)",
      reserves: ["first-frame"],
      run: async (ctx, _state, emit) => {
        const startedAt = Date.now();
        const response = await postJson(
          ctx,
          "/api/preview/generate",
          { prompt: CROSS_MODE_PROMPT, aspectRatio: "16:9" },
          120_000,
        );
        if (response.status !== 200) {
          emit({
            leg: "first-frame",
            outcome: "failed",
            detail: `preview answered ${String(response.status)}`,
            durationMs: Date.now() - startedAt,
          });
          return {
            status: "failed",
            reason: `first frame answered ${String(response.status)}`,
          };
        }
        const validated = validateFirstFrameResponse(response.json);
        if (!validated.ok) {
          emit({
            leg: "first-frame",
            outcome: "invalid",
            detail: validated.reason,
            durationMs: Date.now() - startedAt,
          });
          return { status: "failed", reason: validated.reason };
        }
        if (!validated.model.includes("flux-schnell")) {
          emit({
            leg: "first-frame",
            outcome: "invalid",
            detail: `first frame ran on "${validated.model}", not Flux Schnell — the leg the ceiling priced`,
            durationMs: Date.now() - startedAt,
          });
          return {
            status: "failed",
            reason: `first frame ran on "${validated.model}", not Flux Schnell`,
          };
        }
        const sniff = await fetchAndSniffImageBytes(validated.imageUrl, fetch);
        if (!sniff.ok) {
          emit({
            leg: "first-frame",
            outcome: "invalid",
            detail: `contract ok, bytes not: ${sniff.reason}`,
            durationMs: Date.now() - startedAt,
          });
          return {
            status: "failed",
            reason: `first frame output invalid: ${sniff.reason}`,
          };
        }
        emit({
          leg: "first-frame",
          outcome: "validated",
          detail: `${validated.model} produced a ${sniff.format} frame (${String(sniff.bytes)} bytes)`,
          durationMs: Date.now() - startedAt,
        });
        return { status: "passed" };
      },
    },
  ];
}

function toSteps(ctx: LiveSmokeContext, state: WalkState): readonly SmokeStep[] {
  return stepDefs(state).map((def) => ({
    id: def.id,
    label: def.label,
    reserves: def.reserves,
    execute: (emit) => def.run(ctx, state, emit),
  }));
}

// ── Studio turn stream helpers ───────────────────────────────────────────

async function startStudioTurn(
  ctx: LiveSmokeContext,
  projectId: string,
  message: string,
): Promise<string | Error> {
  const response = await fetch(
    `${ctx.baseUrl}/api/studio/projects/${projectId}/turns`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": String(SMOKE_API_KEY),
      },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    return new Error(`HTTP ${String(response.status)}: ${text.slice(0, 300)}`);
  }
  for (const line of text.split("\n")) {
    if (line.length === 0) continue;
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      if (event.type === "accepted" && typeof event.turnId === "string") {
        return event.turnId;
      }
    } catch {
      // Stream noise — the accepted event is the one that matters.
    }
  }
  return new Error(`no accepted event in turn stream: ${text.slice(0, 300)}`);
}

async function pollStudioTurn(
  ctx: LiveSmokeContext,
  projectId: string,
  turnId: string,
): Promise<StudioTurnViewPayload> {
  const deadline = Date.now() + TURN_POLL_TIMEOUT_MS;
  let last: StudioTurnViewPayload = {
    status: "running",
    decision: { action: "unknown" },
    calls: [],
  };
  while (Date.now() < deadline) {
    const response = await getJson(
      ctx,
      `/api/studio/projects/${projectId}/turns/${turnId}`,
    );
    if (response.status === 200) {
      const data = response.json.data as StudioTurnViewPayload | undefined;
      if (data) {
        last = data;
        if (data.status !== "running") return data;
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, TURN_POLL_INTERVAL_MS));
  }
  return last;
}

function storedImageBytes(
  ctx: LiveSmokeContext,
  imageUrl: string,
): Buffer | undefined {
  const path = ctx.objectStore.pathFromUrl(imageUrl) ?? imageUrl;
  return ctx.objectStore.get(path)?.buffer;
}

async function fetchBytes(
  url: string,
): Promise<{ buffer: Buffer; mime: string } | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) return null;
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mime: response.headers.get("content-type")?.split(";")[0] ?? "image/png",
    };
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // The live sources for preflight and ceiling, resolved from the same
  // modules the legs run on. Dynamic imports: ModelConfig snapshots env at
  // module load, so it must load after env is pinned above.
  const { ModelConfig } = await import("../../../server/src/config/modelConfig.ts");
  const { MAX_POLICY_ATTEMPTS } = await import(
    "../../../server/src/services/studio/StudioPolicyEngine.ts"
  );
  const { StudioModelRegistry } = await import(
    "../../../server/src/services/studio/StudioModelRegistry.ts"
  );
  const { resolveFalApiKey } = await import(
    "../../../server/src/utils/falApiKey.ts"
  );
  const { calculateLLMCost } = await import(
    "../../../server/src/config/llmCosts.ts"
  );

  const studioTurnConfig = ModelConfig.studio_turn;
  const registry = new StudioModelRegistry();
  let editModel: LiveCeilingSources["studioEditModel"] = null;
  try {
    const entry = registry.editDefault();
    editModel = {
      slug: entry.slug,
      costCentsPerCall: entry.costCentsPerCall,
      costVerified: entry.costVerified,
    };
  } catch {
    editModel = null; // no edit-capable roster entry → unknown bound below
  }

  const preflight = runCredentialPreflight({
    studioTurnClient: studioTurnConfig.client,
    env: withFalKeyAlias(process.env, resolveFalApiKey()),
  });

  const ceiling = deriveSmokeCeiling(
    collectSmokeCeilingInputs({
      sketchFrameCostMillicents: resolveSketchFrameCostMillicents(),
      studioTurnModel: studioTurnConfig.model,
      studioTurnMaxOutputTokens: studioTurnConfig.maxTokens,
      studioPolicyAttempts: MAX_POLICY_ATTEMPTS,
      studioEditModel: editModel,
      imagePreviewProviderOrder: process.env.IMAGE_PREVIEW_PROVIDER_ORDER,
    }),
    calculateLLMCost,
  );

  const enforcedUsd = parseEnforcedCeilingUsd(process.env.LIVE_SMOKE_MAX_COST_USD);

  console.log("── Bounded live-provider smoke (issue #140) ──");
  console.log(
    preflight.missing.length === 0
      ? "preflight: all required credentials present"
      : `preflight: MISSING ${preflight.missing.map((entry) => `${entry.credential} (needed by: ${entry.legs.join(", ")})`).join("; ")}`,
  );
  if (ceiling.ok) {
    console.log(
      `ceiling: $${ceiling.ceiling.ceilingUsd.toFixed(2)} / ${String(ceiling.ceiling.ceilingCalls)} permitted calls (sum × ${String(ceiling.ceiling.safetyFactor)} safety, rounded up)`,
    );
    for (const leg of ceiling.ceiling.legs) {
      console.log(`  · ${leg.leg}: ${leg.derivation}`);
    }
  } else {
    for (const unknown of ceiling.unknownBounds) {
      console.log(`ceiling: UNKNOWN BOUND — ${unknown}`);
    }
  }
  if (enforcedUsd !== undefined && ceiling.ok && enforcedUsd < ceiling.ceiling.ceilingUsd) {
    console.log(
      `ceiling override: lowered to $${enforcedUsd.toFixed(2)} (LIVE_SMOKE_MAX_COST_USD)`,
    );
  }

  // The smoke boots the real app only when verification is possible —
  // a run that cannot verify does not boot, spend, or half-run.
  const canVerify = ceiling.ok && preflight.missing.length === 0;
  let ctx: LiveSmokeContext | null = null;
  let bootError: Error | null = null;
  if (canVerify) {
    try {
      ctx = await bootLiveHarness();
    } catch (error) {
      bootError = error instanceof Error ? error : new Error(String(error));
    }
  }

  let exitCode = 1;
  try {
    const steps: readonly SmokeStep[] =
      ctx !== null
        ? toSteps(ctx, {
            sessionId: "",
            promptVersionId: "",
            sketchTakeId: "",
            studioProjectId: "",
            acceptedOutputDataUri: ACCEPTED_OUTPUT_DATA_URI,
          })
        : stepDefs({
            sessionId: "",
            promptVersionId: "",
            sketchTakeId: "",
            studioProjectId: "",
            acceptedOutputDataUri: ACCEPTED_OUTPUT_DATA_URI,
          }).map((def) => ({
            id: def.id,
            label: def.label,
            reserves: def.reserves,
            execute: async (): Promise<SmokeStepExecution> => ({
              status: "failed",
              reason: bootError
                ? `app failed to boot: ${bootError.message}`
                : "step never ran (no app instance)",
            }),
          }));

    const report = await runSmoke({
      preflight,
      ceiling,
      steps,
      ...(enforcedUsd !== undefined ? { enforcedCeilingUsd: enforcedUsd } : {}),
    });

    const reportPath = process.env.LIVE_SMOKE_REPORT_PATH;
    if (reportPath) {
      const absolute = resolve(reportPath);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, JSON.stringify(report, null, 2));
      console.log(`report written to ${absolute}`);
    }

    console.log(`verdict: ${report.verdict.kind}`);
    for (const step of report.steps) {
      const detail = step.reason ? ` — ${step.reason}` : "";
      console.log(`  ${step.status.padEnd(8)} ${step.step}${detail}`);
      for (const call of step.calls) {
        console.log(
          `    · ${call.leg}: ${call.outcome}${call.detail ? ` (${call.detail})` : ""}`,
        );
      }
    }
    exitCode = verdictExitCode(report.verdict);
  } finally {
    await ctx?.close();
  }
  process.exit(exitCode);
}

/** ResolveFalApiKey() applies the FAL_API_KEY alias; report it as FAL_KEY. */
function withFalKeyAlias(
  env: NodeJS.ProcessEnv,
  falKey: string | null,
): NodeJS.ProcessEnv {
  return falKey ? { ...env, FAL_KEY: falKey } : env;
}

/** env.ts defaults the relay's per-frame estimate; read it the same way. */
function resolveSketchFrameCostMillicents(): number {
  const raw = Number.parseInt(
    process.env.SKETCH_FRAME_COST_MILLICENTS ?? "300",
    10,
  );
  return Number.isFinite(raw) && raw > 0 ? raw : 300;
}

function parseEnforcedCeilingUsd(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `ignoring LIVE_SMOKE_MAX_COST_USD="${raw}" (not a positive number)`,
    );
    return undefined;
  }
  return parsed;
}

main().catch((error: unknown) => {
  console.error("live smoke crashed before it could report:", error);
  process.exit(1);
});
