import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAuthMiddleware } from "@middleware/apiAuth";
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

  it("returns 400 for invalid enhancement suggestion payloads", async () => {
    const enhancementService = {
      getEnhancementSuggestions: vi.fn(),
      getCustomSuggestions: vi.fn(),
    };

    const app = express();
    app.use(express.json());
    app.use(
      "/api",
      apiAuthMiddleware,
      createEnhancementRoutes({
        enhancementService: enhancementService as never,
        sceneDetectionService: { detectSceneChange: vi.fn() } as never,
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
    expect(response.body.error).toBe("Invalid request");
    expect(enhancementService.getEnhancementSuggestions).not.toHaveBeenCalled();
  });
});
