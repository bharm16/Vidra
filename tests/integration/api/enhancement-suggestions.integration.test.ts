import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAuthMiddleware } from "@middleware/apiAuth";
import { createOptimizeRoutes } from "@routes/optimize.routes";
import { createEnhancementRoutes } from "@routes/enhancement.routes";

const TEST_API_KEY = "integration-enhancement-key";

describe("Enhancement Suggestions Flow (integration)", () => {
  let previousAllowedApiKeys: string | undefined;

  beforeEach(() => {
    previousAllowedApiKeys = process.env.ALLOWED_API_KEYS;
    process.env.ALLOWED_API_KEYS = TEST_API_KEY;
  });

  afterEach(() => {
    if (previousAllowedApiKeys === undefined) {
      delete process.env.ALLOWED_API_KEYS;
      return;
    }
    process.env.ALLOWED_API_KEYS = previousAllowedApiKeys;
  });

  it("runs optimize then fetches category-aligned enhancement suggestions", async () => {
    const promptOptimizationService = {
      optimize: vi.fn(async () => ({
        prompt: "A cinematic runner in neon rain",
        inputMode: "t2v" as const,
        metadata: { provider: "test" },
      })),
      compilePrompt: vi.fn(),
    };

    const enhancementService = {
      getEnhancementSuggestions: vi.fn(
        async (payload: Record<string, unknown>) => {
          const highlightedText = String(payload.highlightedText ?? "");
          const highlightedCategory = String(
            payload.highlightedCategory ?? "subject.identity",
          );

          return {
            fromCache: false,
            suggestions: [
              {
                text: `Refine ${highlightedText} with precise detail`,
                explanation:
                  "Adds specific visual detail while preserving intent.",
                category: highlightedCategory,
                confidence: 0.9,
              },
            ],
          };
        },
      ),
      getCustomSuggestions: vi.fn(),
    };

    const sceneDetectionService = {
      detectSceneChange: vi.fn(),
    };

    const promptCoherenceService = {
      checkCoherence: vi.fn(),
    };

    const app = express();
    app.use(express.json());
    app.use(
      "/api",
      apiAuthMiddleware,
      createOptimizeRoutes({
        promptOptimizationService: promptOptimizationService as never,
      }),
    );
    app.use(
      "/api",
      apiAuthMiddleware,
      createEnhancementRoutes({
        enhancementService: enhancementService as never,
        sceneDetectionService: sceneDetectionService as never,
        promptCoherenceService: promptCoherenceService as never,
        suggestionsTelemetryService: {
          startSuggestionsTrace: vi.fn(() => ({
            recordStage: vi.fn(),
            recordCacheHit: vi.fn(),
            recordError: vi.fn(),
            complete: vi.fn(),
          })),
        } as never,
      }),
    );

    const optimizeResponse = await request(app)
      .post("/api/optimize")
      .set("x-api-key", TEST_API_KEY)
      .send({ prompt: "runner in rain", mode: "video" });

    expect(optimizeResponse.status).toBe(200);
    expect(optimizeResponse.body.prompt).toBe(
      "A cinematic runner in neon rain",
    );

    const highlightedText = "runner";
    const highlightedCategory = "subject.identity";

    const suggestionsResponse = await request(app)
      .post("/api/enhancement/suggestions")
      .set("x-api-key", TEST_API_KEY)
      .send({
        highlightedText,
        highlightedPhrase: highlightedText,
        fullPrompt: optimizeResponse.body.prompt,
        originalUserPrompt: "runner in rain",
        contextBefore: "A cinematic ",
        contextAfter: " in neon rain",
        highlightedCategory,
        highlightedCategoryConfidence: 0.92,
      });

    expect(suggestionsResponse.status).toBe(200);
    expect(Array.isArray(suggestionsResponse.body.suggestions)).toBe(true);
    expect(suggestionsResponse.body.suggestions.length).toBeGreaterThan(0);

    for (const suggestion of suggestionsResponse.body.suggestions as Array<
      Record<string, unknown>
    >) {
      expect(typeof suggestion.text).toBe("string");
      expect(suggestion.category).toBe(highlightedCategory);
    }

    expect(promptOptimizationService.optimize).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "runner in rain",
        mode: "video",
      }),
    );
    expect(enhancementService.getEnhancementSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({
        highlightedText,
        highlightedCategory,
      }),
    );
  });

  it("returns 400 for invalid enhancement suggestion payloads", async () => {
    const promptOptimizationService = {
      optimize: vi.fn(),
      compilePrompt: vi.fn(),
    };

    const enhancementService = {
      getEnhancementSuggestions: vi.fn(),
      getCustomSuggestions: vi.fn(),
    };

    const app = express();
    app.use(express.json());
    app.use(
      "/api",
      apiAuthMiddleware,
      createOptimizeRoutes({
        promptOptimizationService: promptOptimizationService as never,
      }),
    );
    app.use(
      "/api",
      apiAuthMiddleware,
      createEnhancementRoutes({
        enhancementService: enhancementService as never,
        sceneDetectionService: { detectSceneChange: vi.fn() } as never,
        promptCoherenceService: { checkCoherence: vi.fn() } as never,
        suggestionsTelemetryService: {
          startSuggestionsTrace: vi.fn(() => ({
            recordStage: vi.fn(),
            recordCacheHit: vi.fn(),
            recordError: vi.fn(),
            complete: vi.fn(),
          })),
        } as never,
      }),
    );

    const response = await request(app)
      .post("/api/enhancement/suggestions")
      .set("x-api-key", TEST_API_KEY)
      .send({
        fullPrompt: "A cinematic runner in neon rain",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });
});
