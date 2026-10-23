import { ShareService } from "@services/share/ShareService";
import type { ShareRecord } from "@services/share/types";
import { errorHandler } from "@middleware/errorHandler";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createPublicClipRouter, createShareRouter } from "../share.routes";

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

const BODY = { sessionId: "s", generationId: "g" };

describe("share routes", () => {
  it("refuses anonymous mint requests", async () => {
    const mint = vi.fn();
    const response = await request(appWith(fakeShareService({ mint }), { authed: false })).post("/api/share").send(BODY);
    expect(response.status).toBe(401);
    expect(mint).not.toHaveBeenCalled();
  });

  it("enforces media ownership through the real service and preserves the public DTO", async () => {
    const rows = new Map<string, ShareRecord>();
    let storagePath = "users/foreign/generations/private.mp4";
    const service = new ShareService({ save: async record => { rows.set(record.shareId, record); }, get: async id => rows.get(id) ?? null }, {
      getSession: async () => ({ id: "s", userId: "owner", status: "active", createdAt: new Date(), updatedAt: new Date(), prompt: { input: "", output: "", versions: [{ versionId: "v", signature: "sig", timestamp: "t", prompt: "Public description", generations: [{ id: "g", storagePath }] }] } }),
    }, { getSharedViewUrl: async path => ({ viewUrl: `https://signed.example/${path}`, expiresAt: "" }) });
    const app = appWith(service); app.use(errorHandler);
    expect((await request(app).post("/api/share").send(BODY)).status).toBe(404);
    expect(rows.size).toBe(0);
    storagePath = "users/owner/generations/historical.mp4";
    const minted = await request(app).post("/api/share").send(BODY);
    expect(minted.status).toBe(200);
    const response = await request(app).get(`/api/public/share/${minted.body.data.shareId}`);
    expect(response.status).toBe(200);
    expect(Object.keys(response.body.data).sort()).toEqual(["createdAt", "description", "model", "videoUrl"]);
    expect(response.body.data.description).toBe("Public description");
  });
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
});
