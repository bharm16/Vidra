import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEnhancementRoutes } from "@routes/enhancement.routes";
import { countSuggestions } from "@routes/enhancement/utils";

vi.mock("@llm/span-labeling/nlp/NlpSpanService", () => ({
  extractSemanticSpans: vi.fn(async () => ({
    spans: [{ text: "runner", role: "subject", category: "subject.identity" }],
  })),
}));

function createApp(overrides?: {
  enhancementService?: {
    getEnhancementSuggestions?: ReturnType<typeof vi.fn>;
    getCustomSuggestions?: ReturnType<typeof vi.fn>;
  };
  sceneDetectionService?: {
    detectSceneChange?: ReturnType<typeof vi.fn>;
  };
  promptCoherenceService?: {
    checkCoherence?: ReturnType<typeof vi.fn>;
  };
}) {
  const enhancementService = {
    getEnhancementSuggestions: vi.fn(async () => ({
      suggestions: [
        { text: "Use a low-angle tracking shot", category: "camera.movement" },
      ],
      fromCache: false,
    })),
    getCustomSuggestions: vi.fn(async () => ({
      suggestions: [{ text: "Push into a tighter frame for urgency" }],
    })),
    ...overrides?.enhancementService,
  };

  const sceneDetectionService = {
    detectSceneChange: vi.fn(async () => ({
      isSceneChange: true,
      confidence: "high",
      suggestedUpdates: { Location: "Desert" },
    })),
    ...overrides?.sceneDetectionService,
  };

  const promptCoherenceService = {
    checkCoherence: vi.fn(async () => ({
      conflicts: [],
      harmonizations: [],
    })),
    ...overrides?.promptCoherenceService,
  };

  const suggestionsTelemetryService = {
    startSuggestionsTrace: vi.fn(() => ({
      recordStage: vi.fn(),
      recordCacheHit: vi.fn(),
      recordError: vi.fn(),
      complete: vi.fn(),
    })),
  };

  const app = express();
  app.use(express.json());
  app.use(
    createEnhancementRoutes({
      enhancementService,
      sceneDetectionService,
      promptCoherenceService,
      suggestionsTelemetryService: suggestionsTelemetryService as never,
    }),
  );

  // Deterministic error surface for async route failures
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(500).json({ error: err.message });
    },
  );

  return {
    app,
    enhancementService,
    sceneDetectionService,
    promptCoherenceService,
  };
}

describe("enhancement routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("/enhancement/suggestions", () => {
    it("returns 400 for invalid request body", async () => {
      const { app, enhancementService } = createApp();

      const response = await request(app)
        .post("/enhancement/suggestions")
        .send({ fullPrompt: "A runner in rain" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation failed");
      expect(
        enhancementService.getEnhancementSuggestions,
      ).not.toHaveBeenCalled();
    });

    it("returns suggestions for valid payload and supports grouped counts", async () => {
      const groupedResult = {
        suggestions: [
          {
            category: "camera",
            suggestions: [{ text: "Dolly in", category: "camera.movement" }],
          },
          {
            category: "lighting",
            suggestions: [
              { text: "Soft rim light", category: "lighting.quality" },
            ],
          },
        ],
        fromCache: true,
      };
      const { app, enhancementService } = createApp({
        enhancementService: {
          getEnhancementSuggestions: vi.fn(async () => groupedResult),
        },
      });

      const response = await request(app)
        .post("/enhancement/suggestions")
        .send({
          highlightedText: "tracking shot",
          fullPrompt: "A cinematic runner in rain, tracking shot.",
          contextBefore: "A cinematic runner in rain, ",
          contextAfter: ".",
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(groupedResult);
      expect(enhancementService.getEnhancementSuggestions).toHaveBeenCalled();
      expect(countSuggestions(groupedResult.suggestions)).toBe(2);
    });

    it("returns 500 when enhancement service throws", async () => {
      const { app } = createApp({
        enhancementService: {
          getEnhancementSuggestions: vi.fn(async () => {
            throw new Error("service down");
          }),
        },
      });

      const response = await request(app)
        .post("/enhancement/suggestions")
        .send({
          highlightedText: "tracking shot",
          fullPrompt: "A cinematic runner in rain, tracking shot.",
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "service down" });
    });
  });

  it("returns 400 for invalid custom suggestion requests", async () => {
    const { app } = createApp();

    const response = await request(app)
      .post("/enhancement/custom-suggestions")
      .send({
        highlightedText: "runner",
        fullPrompt: "A runner in rain",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  it("returns 400 for invalid coherence check requests", async () => {
    const { app } = createApp();

    const response = await request(app).post("/check-prompt-coherence").send({
      beforePrompt: "A runner in rain",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  it("returns 400 for invalid scene change requests", async () => {
    const { app } = createApp();

    const response = await request(app).post("/enhancement/scene-change").send({
      newValue: "desert",
      fullPrompt: "A runner in rain",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  it("returns 400 when /test-nlp is missing prompt query", async () => {
    const { app } = createApp();

    const response = await request(app).get("/enhancement/test-nlp");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "prompt query parameter is required",
    });
  });

  it("returns NLP spans when /enhancement/test-nlp query is valid", async () => {
    const { app } = createApp();

    const response = await request(app).get("/enhancement/test-nlp").query({
      prompt: "A runner in rain with neon reflections",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      spans: [
        { text: "runner", role: "subject", category: "subject.identity" },
      ],
    });
  });
});
