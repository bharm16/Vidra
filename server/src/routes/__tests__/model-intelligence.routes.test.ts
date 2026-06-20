import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createModelIntelligenceRoutes } from "../model-intelligence.routes";
import type { ModelIntelligenceService } from "@services/model-intelligence/ModelIntelligenceService";

/**
 * Contract test for the model-intelligence route response shapes.
 *
 * Guards the migration from a loose local `ApiResponse<T>` (success: boolean,
 * everything optional) to the canonical discriminated union in
 * shared/types/api.ts: success responses carry `data`, error responses carry a
 * string `error`/`details`, and the data-less /track ack is modelled as
 * `data: { tracked: true }` so it fits ApiSuccessResponse<T>.
 */

interface ErrorWithCode {
  code?: string;
  message?: string;
}

const isSocketPermissionError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as ErrorWithCode;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  if (code === "EPERM" || code === "EACCES") {
    return true;
  }
  return (
    message.includes("listen EPERM") ||
    message.includes("listen EACCES") ||
    message.includes("operation not permitted") ||
    message.includes("Cannot read properties of null (reading 'port')")
  );
};

const runSupertestOrSkip = async <T>(
  execute: () => Promise<T>,
): Promise<T | null> => {
  if (process.env.CODEX_SANDBOX === "seatbelt") {
    return null;
  }
  try {
    return await execute();
  } catch (error) {
    if (isSocketPermissionError(error)) {
      return null;
    }
    throw error;
  }
};

const buildApp = (
  service: ModelIntelligenceService | null,
): express.Express => {
  const app = express();
  app.use(express.json());
  app.use(createModelIntelligenceRoutes(service));
  return app;
};

const stubService = (recommendation: unknown): ModelIntelligenceService =>
  ({
    getRecommendation: vi.fn().mockResolvedValue(recommendation),
  }) as unknown as ModelIntelligenceService;

describe("model-intelligence.routes contract (canonical ApiResponse)", () => {
  describe("POST /model-intelligence/recommend", () => {
    it("returns a discriminated success envelope carrying data", async () => {
      const recommendation = {
        recommendedModelId: "veo-3",
        confidence: "high",
      };
      const app = buildApp(stubService(recommendation));

      const res = await runSupertestOrSkip(() =>
        request(app)
          .post("/model-intelligence/recommend")
          .send({ prompt: "a cat playing piano" }),
      );
      if (!res) return;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: recommendation });
    });

    it("returns a string `details` on validation failure", async () => {
      const app = buildApp(stubService({}));

      const res = await runSupertestOrSkip(() =>
        request(app).post("/model-intelligence/recommend").send({ prompt: "" }),
      );
      if (!res) return;

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(typeof res.body.error).toBe("string");
      expect(typeof res.body.details).toBe("string");
    });

    it("returns a 503 error envelope when the service is unavailable", async () => {
      const app = buildApp(null);

      const res = await runSupertestOrSkip(() =>
        request(app)
          .post("/model-intelligence/recommend")
          .send({ prompt: "a cat" }),
      );
      if (!res) return;

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(typeof res.body.error).toBe("string");
    });
  });

  describe("POST /model-intelligence/track", () => {
    it("returns a success envelope with data (fits ApiSuccessResponse)", async () => {
      const app = buildApp(stubService({}));

      const res = await runSupertestOrSkip(() =>
        request(app)
          .post("/model-intelligence/track")
          .send({ event: "recommendation_viewed" }),
      );
      if (!res) return;

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { tracked: true } });
    });

    it("returns a string `details` on validation failure", async () => {
      const app = buildApp(stubService({}));

      const res = await runSupertestOrSkip(() =>
        request(app)
          .post("/model-intelligence/track")
          .send({ event: "not-a-real-event" }),
      );
      if (!res) return;

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(typeof res.body.details).toBe("string");
    });
  });
});
