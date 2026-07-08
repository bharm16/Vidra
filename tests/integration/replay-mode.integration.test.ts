import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DIContainer } from "@infrastructure/DIContainer";
import type { AIModelService } from "@services/ai-model/AIModelService";
import { OptimizeResponseSchema } from "@shared/schemas/optimization.schemas";
import { ImagePreviewResultReplayPayloadSchema } from "@shared/schemas/replay.schemas";
import {
  HTTP_SCENARIOS,
  PREVIEW_SCENARIO,
} from "@scripts/replay/goldenScenarios";

/**
 * Replay-mode integration suite: boots the real app (NODE_ENV=test,
 * REPLAY_MODE=replay) and exercises every golden-path surface with ZERO
 * network. Provider credentials are deleted from the environment before the
 * container is built, so any code path that tried to reach a live provider
 * would throw — every response below can only come from the recorded,
 * contract-validated cassettes in server/src/replay/fixtures/.
 */

const API_KEY = "replay-integration-key";
const PROVIDER_ENV_KEYS = [
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "REPLICATE_API_TOKEN",
  "FAL_KEY",
  "FAL_API_KEY",
] as const;

const scenarioBySurface = (surface: string): { path: string; body: object } => {
  const scenario = HTTP_SCENARIOS.find((s) => s.surface === surface);
  if (!scenario) throw new Error(`No golden scenario for surface ${surface}`);
  return scenario;
};

describe("Replay mode (integration)", () => {
  let server: Server | null = null;
  let container: DIContainer | null = null;
  let baseUrl = "";
  const envBackup = new Map<string, string | undefined>();

  const setEnv = (key: string, value: string | undefined): void => {
    if (!envBackup.has(key)) envBackup.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  };

  beforeAll(async () => {
    setEnv("PORT", "0");
    setEnv("REPLAY_MODE", "replay");
    setEnv("ALLOWED_API_KEYS", API_KEY);
    setEnv("API_KEY", undefined);
    // Span labeling builds a provider-specific prompt template. The pack was
    // recorded with the active non-Gemini provider (SPAN_PROVIDER=qwen), so
    // replay must resolve the same operation config to build matching keys.
    setEnv("SPAN_PROVIDER", "qwen");
    setEnv("SPAN_MODEL", "qwen/qwen3-32b");
    // The zero-network guarantee: no provider credentials exist in this
    // process, so live clients register as null and any non-replayed call
    // path throws instead of silently reaching the network.
    for (const key of PROVIDER_ENV_KEYS) setEnv(key, undefined);

    // Dynamic imports: ModelConfig (and friends) snapshot env at module load,
    // so the server modules must not be imported before the env above is set.
    const { configureServices, initializeServices } = await import(
      "@config/services.config"
    );
    const { createApp } = await import("@server/app");
    const { startServer } = await import("@server/server");

    container = await configureServices();
    await initializeServices(container);
    const app = createApp(container);
    server = await startServer(app, container);

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error(`Expected TCP address, received: ${String(address)}`);
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 30_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });
    for (const [key, value] of envBackup) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  const post = async (
    path: string,
    body: object,
  ): Promise<{ status: number; json: Record<string, unknown> }> => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      json: (await response.json()) as Record<string, unknown>,
    };
  };

  it("has no live LLM clients (the offline proof)", () => {
    const aiService = container?.resolve("aiService") as AIModelService;
    expect(aiService.getAvailableClients()).toEqual([]);
  });

  it("label-spans replays the recorded golden path", async () => {
    const { path, body } = scenarioBySurface("label-spans");
    const { status, json } = await post(path, body);
    expect(status).toBe(200);
    const spans = json.spans as Array<{ text: string; category?: string }>;
    expect(Array.isArray(spans)).toBe(true);
    expect(spans.length).toBeGreaterThan(0);
    expect(spans.every((s) => typeof s.text === "string")).toBe(true);
  });

  it("suggestions replays the recorded golden path", async () => {
    const { path, body } = scenarioBySurface("suggestions");
    const { status, json } = await post(path, body);
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    const data = json.data as { suggestions?: unknown };
    expect(data).toBeTruthy();
    expect(JSON.stringify(data.suggestions ?? data).length).toBeGreaterThan(2);
  });

  it("optimize replays and satisfies the shared response contract", async () => {
    const { path, body } = scenarioBySurface("optimize");
    const { status, json } = await post(path, body);
    expect(status).toBe(200);
    const parsed = OptimizeResponseSchema.safeParse(json);
    expect(parsed.success, JSON.stringify(parsed, null, 2).slice(0, 800)).toBe(
      true,
    );
  });

  it("first-frame preview replays at the provider seam without Replicate", async () => {
    // The preview HTTP route additionally needs Firestore credits + GCS
    // persistence (documented in docs/architecture/replay-mode.md); the
    // record/replay seam sits at the provider adapter, so that is what the
    // suite exercises — with REPLICATE_API_TOKEN deleted above.
    const provider = container?.resolve("replicateFluxSchnellProvider") as {
      isAvailable(): boolean;
      generatePreview(request: object): Promise<unknown>;
    } | null;
    expect(provider).not.toBeNull();
    expect(provider?.isAvailable()).toBe(true);

    const result = await provider?.generatePreview(PREVIEW_SCENARIO.request);
    const parsed = ImagePreviewResultReplayPayloadSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.imageUrl.length).toBeGreaterThan(0);
      expect(parsed.data.model).toContain("flux");
    }
  });

  it("misses loudly instead of degrading when the request is unrecorded", async () => {
    const { path } = scenarioBySurface("label-spans");
    const { status } = await post(path, {
      text: "an entirely different prompt that was never recorded",
    });
    expect(status).toBeGreaterThanOrEqual(500);
  });
});
