import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("@config/middleware.config", () => ({
  configureMiddleware: vi.fn(),
}));

vi.mock("@config/routes.config", () => ({
  configureRoutes: vi.fn(),
}));
import { startServer } from "@server/server";
import { createHealthRoutes } from "@routes/health.routes";
import { createAPIRoutes } from "@routes/api.routes";
import { runSupertestRequest } from "./test-helpers/supertestRequest";

const createApiServices = (
  optimize: ReturnType<typeof vi.fn> = vi.fn(
    async (_args: Record<string, unknown>) => "optimized prompt",
  ),
): Parameters<typeof createAPIRoutes>[0] => ({
  promptOptimizationService: {
    optimize,
    compilePrompt: vi.fn(async () => ({ compiledPrompt: "compiled prompt" })),
  } as never,
  storageService: {
    getUploadUrl: vi.fn(),
    saveFromUrl: vi.fn(),
    confirmUpload: vi.fn(),
    getViewUrl: vi.fn(),
    getDownloadUrl: vi.fn(),
    listFiles: vi.fn(),
    getStorageUsage: vi.fn(),
    deleteFile: vi.fn(),
    deleteFiles: vi.fn(),
  } as never,
  enhancementService: {
    getEnhancementSuggestions: vi.fn(async () => ({
      suggestions: [],
      isPlaceholder: false as const,
      hasCategories: false as const,
      phraseRole: null,
      appliedConstraintMode: null,
      fallbackApplied: false,
    })),
    getCustomSuggestions: vi.fn(async () => ({ suggestions: [] })),
  },
  sceneDetectionService: {
    detectSceneChange: vi.fn(async () => ({
      isSceneChange: false,
      confidence: "low" as const,
      reasoning: "",
      suggestedUpdates: {},
    })),
  },
  suggestionsTelemetryService: {
    startSuggestionsTrace: vi.fn(() => ({
      recordStage: vi.fn(),
      recordCacheHit: vi.fn(),
      recordError: vi.fn(),
      complete: vi.fn(),
    })),
  } as never,
});

describe("startServer", () => {
  it("starts server and sets timeouts", async () => {
    const app = express();
    const container = {
      resolve: vi.fn(() => ({
        server: {
          port: 0,
          environment: "test",
        },
      })),
    };

    const server = await startServer(app, container as never);

    expect(server.listening).toBe(true);
    expect(server.keepAliveTimeout).toBe(125000);
    expect(server.headersTimeout).toBe(126000);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});

describe("health.routes", () => {
  it("serves health, readiness, and live endpoints", async () => {
    const deps = {
      openAIClient: { getStats: () => ({ state: "CLOSED" }) },
      groqClient: null,
      geminiClient: null,
      cacheService: {
        isHealthy: () => true,
        getCacheStats: () => ({ hits: 1, misses: 0 }),
      },
    };

    const app = express();
    app.use(createHealthRoutes(deps));

    const health = await runSupertestRequest(() => request(app).get("/health"));
    expect(health.status).toBe(200);
    expect(health.body.status).toBe("healthy");

    const live = await runSupertestRequest(() =>
      request(app).get("/health/live"),
    );
    expect(live.status).toBe(200);
    expect(live.body.status).toBe("alive");

    const ready = await runSupertestRequest(() =>
      request(app).get("/health/ready"),
    );
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe("ready");
    expect(ready.body.dependencies.cache.healthy).toBe(true);
    expect(ready.body.dependencies.openAI.healthy).toBe(true);
  });

  it("reports not ready when Firestore circuit is open", async () => {
    const deps = {
      openAIClient: { getStats: () => ({ state: "CLOSED" }) },
      groqClient: null,
      geminiClient: null,
      cacheService: {
        isHealthy: () => true,
        getCacheStats: () => ({ hits: 1, misses: 0 }),
      },
      firestoreCircuitExecutor: {
        getReadinessSnapshot: () => ({
          state: "open" as const,
          open: true,
          degraded: true,
          failureRate: 1,
          latencyMeanMs: 2000,
          thresholds: {
            failureRate: 0.5,
            latencyMs: 1500,
          },
          stats: {
            fires: 10,
            failures: 5,
            timeouts: 0,
            rejects: 5,
            successes: 0,
          },
        }),
      } as unknown as Parameters<
        typeof createHealthRoutes
      >[0]["firestoreCircuitExecutor"],
    };

    const app = express();
    app.use(
      createHealthRoutes(deps as Parameters<typeof createHealthRoutes>[0]),
    );

    const ready = await runSupertestRequest(() =>
      request(app).get("/health/ready"),
    );
    expect(ready.status).toBe(503);
    expect(ready.body.status).toBe("unhealthy");
    expect(ready.body.dependencies.firebase.healthy).toBe(false);
    expect(ready.body.dependencies.firebase.error).toBe(
      "Firestore circuit is open",
    );
  });
});

describe("api.routes", () => {
  it("validates and processes optimize requests", async () => {
    const promptOptimizationService = {
      optimize: vi.fn(async (_args: Record<string, unknown>) => ({
        prompt: "optimized prompt",
        inputMode: "video",
      })),
    };

    const app = express();
    app.use(express.json());
    app.use(
      createAPIRoutes(createApiServices(promptOptimizationService.optimize)),
    );

    const badResponse = await runSupertestRequest(() =>
      request(app).post("/optimize").send({}),
    );
    expect(badResponse.status).toBe(400);

    const response = await runSupertestRequest(() =>
      request(app).post("/optimize").send({ prompt: "Hello world" }),
    );

    expect(response.status).toBe(200);
    expect(response.body.data.optimizedPrompt).toBe("optimized prompt");
    expect(promptOptimizationService.optimize).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Hello world",
        mode: "video",
        context: null,
        brainstormContext: null,
        generationParams: null,
        lockedSpans: [],
        skipCache: false,
      }),
    );
  });

  it("passes skipCache through optimize requests", async () => {
    const promptOptimizationService = {
      optimize: vi.fn(async (_args: Record<string, unknown>) => ({
        prompt: "optimized prompt",
        inputMode: "video",
      })),
    };

    const app = express();
    app.use(express.json());
    app.use(
      createAPIRoutes(createApiServices(promptOptimizationService.optimize)),
    );

    const response = await runSupertestRequest(() =>
      request(app)
        .post("/optimize")
        .send({ prompt: "Hello world", skipCache: true }),
    );

    expect(response.status).toBe(200);
    expect(response.body.data.optimizedPrompt).toBe("optimized prompt");
    expect(promptOptimizationService.optimize).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Hello world",
        mode: "video",
        context: null,
        brainstormContext: null,
        generationParams: null,
        lockedSpans: [],
        skipCache: true,
      }),
    );
  });

  it("passes locked spans through optimize requests", async () => {
    const promptOptimizationService = {
      optimize: vi.fn(async (_args: Record<string, unknown>) => ({
        prompt: "optimized prompt",
        inputMode: "video",
      })),
    };

    const app = express();
    app.use(express.json());
    app.use(
      createAPIRoutes(createApiServices(promptOptimizationService.optimize)),
    );

    const response = await runSupertestRequest(() =>
      request(app)
        .post("/optimize")
        .send({
          prompt: "Hello world",
          lockedSpans: [
            {
              id: "span_1",
              text: "neon alley",
              leftCtx: "rain-soaked ",
              rightCtx: " at night",
            },
          ],
        }),
    );

    expect(response.status).toBe(200);
    expect(response.body.data.optimizedPrompt).toBe("optimized prompt");
    expect(promptOptimizationService.optimize).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Hello world",
        context: null,
        brainstormContext: null,
        lockedSpans: [
          {
            id: "span_1",
            text: "neon alley",
            leftCtx: "rain-soaked ",
            rightCtx: " at night",
          },
        ],
      }),
    );
  });
});
