import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEnhancementRoutes } from "@routes/enhancement.routes";
import { countSuggestions } from "@routes/enhancement/utils";
import { extractSemanticSpans } from "@llm/span-labeling/nlp/NlpSpanService";
import type { RequestWithUser } from "@middleware/intake";

vi.mock("@llm/span-labeling/nlp/NlpSpanService", () => ({
  extractSemanticSpans: vi.fn(async () => ({
    spans: [{ text: "runner", role: "subject", category: "subject.identity" }],
  })),
}));

function createApp(overrides?: {
  ownerId?: string | null;
  enhancementService?: {
    getEnhancementSuggestions?: ReturnType<typeof vi.fn>;
    getCustomSuggestions?: ReturnType<typeof vi.fn>;
  };
  sceneDetectionService?: {
    detectSceneChange?: ReturnType<typeof vi.fn>;
  };
}) {
  const enhancementService = {
    getEnhancementSuggestions: vi.fn(async () => ({
      suggestions: [
        { text: "Use a low-angle tracking shot", category: "camera.movement" },
      ],
      isPlaceholder: false as const,
      hasCategories: false as const,
      phraseRole: null,
      appliedConstraintMode: null,
      fallbackApplied: false,
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

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const ownerId = overrides?.ownerId === undefined ? "verified-owner" : overrides.ownerId;
    if (ownerId) (req as RequestWithUser).user = { uid: ownerId };
    next();
  });
  app.use(
    createEnhancementRoutes({
      enhancementService,
      sceneDetectionService,
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
  };
}

describe("enhancement routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("/enhancement/suggestions", () => {
    it("requires intake identity and forwards it instead of a body owner", async () => {
      const body = { highlightedText: "tree", fullPrompt: "A tree at sunset", ownerId: "body-owner" };
      const authenticated = createApp();
      expect((await request(authenticated.app).post("/enhancement/suggestions").send(body)).status).toBe(200);
      expect(authenticated.enhancementService.getEnhancementSuggestions).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: "verified-owner" }),
      );
      const unauthenticated = createApp({ ownerId: null });
      expect((await request(unauthenticated.app).post("/enhancement/suggestions").send(body)).status).toBe(401);
      expect(unauthenticated.enhancementService.getEnhancementSuggestions).not.toHaveBeenCalled();
    });

    it("rejects excessive span context before invoking the service", async () => {
      const { app, enhancementService } = createApp();
      const response = await request(app).post("/enhancement/suggestions").send({
        highlightedText: "tree",
        fullPrompt: "tree and sunset",
        allLabeledSpans: Array.from({ length: 81 }, () => ({ text: "tree", role: "subject", start: 0, end: 4 })),
      });
      expect(response.status).toBe(400);
      expect(enhancementService.getEnhancementSuggestions).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid request body", async () => {
      const { app, enhancementService } = createApp();

      const response = await request(app)
        .post("/enhancement/suggestions")
        .send({ fullPrompt: "A runner in rain" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid request");
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
        isPlaceholder: true as const,
        hasCategories: true,
        phraseRole: null,
        appliedConstraintMode: null,
        fallbackApplied: false,
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
      expect(response.body).toEqual({ success: true, data: groupedResult });
      expect(enhancementService.getEnhancementSuggestions).toHaveBeenCalled();
      expect(countSuggestions(groupedResult)).toBe(2);
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
    expect(response.body.error).toBe("Invalid request");
  });

  it("returns 400 for invalid scene change requests", async () => {
    const { app } = createApp();

    const response = await request(app).post("/enhancement/scene-change").send({
      newValue: "desert",
      fullPrompt: "A runner in rain",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid request");
  });

  it.each([
    {
      path: "/enhancement/custom-suggestions",
      body: { highlightedText: "runner", customRequest: "cinematic", fullPrompt: "A runner in rain" },
      method: "getCustomSuggestions" as const,
    },
    {
      path: "/enhancement/scene-change",
      body: { changedField: "location", newValue: "desert", fullPrompt: "A runner in rain", affectedFields: { lighting: "rainy" } },
      method: "detectSceneChange" as const,
    },
  ])("passes intake identity to $method and rejects missing owners", async ({ path, body, method }) => {
    const authenticated = createApp();
    const response = await request(authenticated.app).post(path).send({ ...body, ownerId: "body-owner" });
    expect(response.status).toBe(200);
    const service = method === "getCustomSuggestions"
      ? authenticated.enhancementService.getCustomSuggestions
      : authenticated.sceneDetectionService.detectSceneChange;
    expect(service).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "verified-owner" }));

    const unauthenticated = createApp({ ownerId: null });
    const rejected = await request(unauthenticated.app).post(path).send({ ...body, ownerId: "body-owner" });
    expect(rejected.status).toBe(401);
    expect(unauthenticated.enhancementService.getCustomSuggestions).not.toHaveBeenCalled();
    expect(unauthenticated.sceneDetectionService.detectSceneChange).not.toHaveBeenCalled();
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
      success: true,
      data: {
        spans: [
          { text: "runner", role: "subject", category: "subject.identity" },
        ],
      },
    });
  });

  it("rejects oversized diagnostic prompts before extraction", async () => {
    const { app } = createApp();
    const response = await request(app)
      .get("/enhancement/test-nlp")
      .query({ prompt: "x".repeat(10_001) });

    expect(response.status).toBe(400);
    expect(extractSemanticSpans).not.toHaveBeenCalled();
  });
});
