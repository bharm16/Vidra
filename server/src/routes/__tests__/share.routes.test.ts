import { describe, it, expect } from "vitest";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import request from "supertest";
import { createShareRouter, createPublicClipRouter } from "../share.routes";
import type { ShareService } from "@services/share/ShareService";

function fakeShareService(overrides: Partial<ShareService> = {}): ShareService {
  return {
    async mint() {
      return { shareId: "share-123" };
    },
    async resolve() {
      return {
        videoUrl: "https://signed.example/clip.mp4",
        description: "a cat surfing",
        model: "sora-2",
        createdAt: "2026-01-01T00:00:00.000Z",
      };
    },
    ...overrides,
  } as unknown as ShareService;
}

function appWith(
  service: ShareService,
  { authed = true } = {},
): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api/public/share", createPublicClipRouter(service));
  app.use(
    "/api/share",
    (req: Request, _res: Response, next: NextFunction) => {
      if (authed) (req as Request & { user?: unknown }).user = { uid: "owner" };
      next();
    },
    createShareRouter(service),
  );
  return app;
}

const BODY = { sessionId: "s", promptVersionId: "v", generationId: "g" };

describe("share routes", () => {
  it("serves a public clip without auth", async () => {
    const res = await request(appWith(fakeShareService())).get(
      "/api/public/share/abc",
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { videoUrl: expect.any(String), description: "a cat surfing" },
    });
  });

  it("404s an unknown share id on the public route", async () => {
    const svc = fakeShareService({
      resolve: async () => null,
    } as Partial<ShareService>);
    const res = await request(appWith(svc)).get("/api/public/share/missing");
    expect(res.status).toBe(404);
  });

  it("mints a share for an authenticated owner", async () => {
    const res = await request(appWith(fakeShareService()))
      .post("/api/share")
      .send(BODY);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { shareId: "share-123" },
    });
  });

  it("rejects an unauthenticated mint with 401", async () => {
    const res = await request(appWith(fakeShareService(), { authed: false }))
      .post("/api/share")
      .send(BODY);
    expect(res.status).toBe(401);
  });

  it("rejects an invalid mint body with 400", async () => {
    const res = await request(appWith(fakeShareService()))
      .post("/api/share")
      .send({ sessionId: "s" });
    expect(res.status).toBe(400);
  });
});
