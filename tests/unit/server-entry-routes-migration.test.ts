import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("@config/middleware.config", () => ({
  configureMiddleware: vi.fn(),
}));

vi.mock("@config/routes.config", () => ({
  configureRoutes: vi.fn(),
}));

vi.mock("@services/quality-feedback/services/LLMJudgeService", () => ({
  LLMJudgeService: class {
    async evaluateSuggestions() {
      return {
        overallScore: 87,
        rubricScores: {},
        feedback: [],
        strengths: [],
        weaknesses: [],
        detailedNotes: "ok",
        metadata: { rubricUsed: "test" },
      };
    }

    async evaluateSingleSuggestion() {
      return {
        overallScore: 91,
        rubricScores: {},
        feedback: [],
        strengths: [],
        weaknesses: [],
        detailedNotes: "single",
        metadata: { rubricUsed: "test" },
      };
    }

    async compareSuggestionSets() {
      return {
        setA: {
          overallScore: 80,
          rubricScores: {},
          metadata: { rubricUsed: "test" },
        },
        setB: {
          overallScore: 70,
          rubricScores: {},
          metadata: { rubricUsed: "test" },
        },
        winner: "A",
        scoreDifference: 10,
        criteriaComparison: {},
      };
    }
  },
}));

import * as middlewareConfig from "@config/middleware.config";
import * as routesConfig from "@config/routes.config";
import { createApp } from "@server/app";
import { startServer } from "@server/server";
import { createHealthRoutes } from "@routes/health.routes";
import { createAPIRoutes } from "@routes/api.routes";
import { createSuggestionsRoute } from "@routes/suggestions";
import type { AIModelService } from "@services/ai-model/AIModelService";
import { LLMJudgeService } from "@services/quality-feedback/services/LLMJudgeService";
import {
  isSocketPermissionError,
  runSupertestOrSkip,
} from "./test-helpers/supertestSafeRequest";

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
  promptCoherenceService: {
    checkCoherence: vi.fn(async () => ({ conflicts: [], harmonizations: [] })),
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

describe("createApp", () => {
  it("sets trust proxy and wires middleware/routes", () => {
    const configureMiddleware = vi.mocked(middlewareConfig.configureMiddleware);
    const configureRoutes = vi.mocked(routesConfig.configureRoutes);
    const container = {
      resolve: vi.fn((key: string) => {
        if (key === "logger") return { name: "logger" };
        return null;
      }),
    };

    const app = createApp(container as never);

    expect(app.get("trust proxy")).toBe(1);
    expect(configureMiddleware).toHaveBeenCalledWith(app, {
      logger: { name: "logger" },
      redisClient: null,
    });
    expect(configureRoutes).toHaveBeenCalledWith(app, container);
  });
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

    let server;
    try {
      server = await startServer(app, container as never);
    } catch (error) {
      if (isSocketPermissionError(error)) {
        return;
      }
      throw error;
    }

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

    const health = await runSupertestOrSkip(() => request(app).get("/health"));
    if (!health) return;
    expect(health.status).toBe(200);
    expect(health.body.status).toBe("healthy");

    const live = await runSupertestOrSkip(() =>
      request(app).get("/health/live"),
    );
    if (!live) return;
    expect(live.status).toBe(200);
    expect(live.body.status).toBe("alive");

    const ready = await runSupertestOrSkip(() =>
      request(app).get("/health/ready"),
    );
    if (!ready) return;
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

    const ready = await runSupertestOrSkip(() =>
      request(app).get("/health/ready"),
    );
    if (!ready) return;
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

    const badResponse = await runSupertestOrSkip(() =>
      request(app).post("/optimize").send({}),
    );
    if (!badResponse) return;
    expect(badResponse.status).toBe(400);

    const response = await runSupertestOrSkip(() =>
      request(app).post("/optimize").send({ prompt: "Hello world" }),
    );
    if (!response) return;

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

    const response = await runSupertestOrSkip(() =>
      request(app)
        .post("/optimize")
        .send({ prompt: "Hello world", skipCache: true }),
    );
    if (!response) return;

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

    const response = await runSupertestOrSkip(() =>
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
    if (!response) return;

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

describe("suggestions.routes", () => {
  it("validates suggestion evaluation payloads", async () => {
    const app = express();
    app.use(express.json());
    const aiService = {} as AIModelService;
    const llmJudgeService = new LLMJudgeService(aiService);
    app.use(createSuggestionsRoute({ llmJudgeService }));

    const invalid = await runSupertestOrSkip(() =>
      request(app)
        .post("/evaluate")
        .send({
          suggestions: [],
          context: { highlightedText: "test" },
        }),
    );
    if (!invalid) return;

    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toContain("suggestions");
  });

  it("returns evaluation results for valid requests", async () => {
    const app = express();
    app.use(express.json());
    const aiService = {} as AIModelService;
    const llmJudgeService = new LLMJudgeService(aiService);
    app.use(createSuggestionsRoute({ llmJudgeService }));

    const response = await runSupertestOrSkip(() =>
      request(app)
        .post("/evaluate")
        .send({
          suggestions: [{ text: "Better phrasing" }],
          context: { highlightedText: "Original text", isVideoPrompt: true },
        }),
    );
    if (!response) return;

    expect(response.status).toBe(200);
    expect(response.body.evaluation.overallScore).toBe(87);
    expect(typeof response.body.responseTime).toBe("number");
  });

  it("supports single and compare evaluation endpoints", async () => {
    const app = express();
    app.use(express.json());
    const aiService = {} as AIModelService;
    const llmJudgeService = new LLMJudgeService(aiService);
    app.use(createSuggestionsRoute({ llmJudgeService }));

    const single = await runSupertestOrSkip(() =>
      request(app)
        .post("/evaluate/single")
        .send({
          suggestion: "One option",
          context: { highlightedText: "Original text" },
        }),
    );
    if (!single) return;

    expect(single.status).toBe(200);
    expect(single.body.evaluation.overallScore).toBe(91);

    const compare = await runSupertestOrSkip(() =>
      request(app)
        .post("/evaluate/compare")
        .send({
          setA: [{ text: "Option A" }],
          setB: [{ text: "Option B" }],
          context: { highlightedText: "Original text" },
        }),
    );
    if (!compare) return;

    expect(compare.status).toBe(200);
    expect(compare.body.comparison.winner).toBe("A");
  });

  it("exposes rubric definitions", async () => {
    const app = express();
    const aiService = {} as AIModelService;
    const llmJudgeService = new LLMJudgeService(aiService);
    app.use(createSuggestionsRoute({ llmJudgeService }));

    const response = await runSupertestOrSkip(() =>
      request(app).get("/rubrics"),
    );
    if (!response) return;

    expect(response.status).toBe(200);
    expect(response.body.rubrics).toHaveProperty("video");
    expect(response.body.rubrics).toHaveProperty("general");
  });
});
