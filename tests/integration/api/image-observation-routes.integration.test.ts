import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAuthMiddleware } from "@middleware/apiAuth";
import { createImageObservationRoutes } from "@routes/image-observation.routes";

const TEST_API_KEY = "integration-image-observation-key";

describe("Image Observation Routes (integration)", () => {
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

  function createApp() {
    const imageObservationService = {
      observe: vi.fn().mockResolvedValue({
        success: true,
        summary: "A cinematic skyline at sunset",
        tags: ["skyline", "sunset"],
      }),
    };

    const app = express();
    app.use(express.json());
    app.use(
      "/api",
      apiAuthMiddleware,
      createImageObservationRoutes(imageObservationService as never),
    );

    return { app, imageObservationService };
  }

  it("POST /api/enhancement/observe-image returns observation payload for valid request", async () => {
    const { app, imageObservationService } = createApp();

    const response = await request(app)
      .post("/api/enhancement/observe-image")
      .set("x-api-key", TEST_API_KEY)
      .send({
        image: "https://example.com/frame.png",
        sourcePrompt: "Cinematic skyline",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.summary).toBe("A cinematic skyline at sunset");
    expect(response.body.data.summary).toBe("A cinematic skyline at sunset");
    expect(imageObservationService.observe).toHaveBeenCalledWith(
      expect.objectContaining({ image: "https://example.com/frame.png" }),
    );
  });

  it("POST /api/enhancement/observe-image returns 400 for invalid payload", async () => {
    const { app, imageObservationService } = createApp();

    const response = await request(app)
      .post("/api/enhancement/observe-image")
      .set("x-api-key", TEST_API_KEY)
      .send({ image: "" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe("Invalid request");
    expect(imageObservationService.observe).not.toHaveBeenCalled();
  });

  it("POST /api/enhancement/observe-image requires authentication", async () => {
    const { app } = createApp();

    const response = await request(app)
      .post("/api/enhancement/observe-image")
      .send({ image: "https://example.com/no-auth.png" });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Authentication required");
  });
});
