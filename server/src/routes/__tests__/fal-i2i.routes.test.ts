import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createFalI2iRouter } from "../fal-i2i.routes";
import { SketchBudgetService } from "@services/sketch-budget/SketchBudgetService";
import {
  closeLoopbackServers,
  listenOnLoopback,
} from "../../config/__tests__/loopbackTestServer";

afterEach(closeLoopbackServers);

type CapturedCall = { url: string; init: RequestInit | undefined };

function fetchStub(
  status: number,
  body: unknown,
): {
  fetchFn: (url: string, init?: RequestInit) => Promise<globalThis.Response>;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  const fetchFn = async (
    url: string,
    init?: RequestInit,
  ): Promise<globalThis.Response> => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  };
  return { fetchFn, calls };
}

function appWith(
  router: ReturnType<typeof createFalI2iRouter>,
): express.Express {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(attachCreator);
  app.use("/api/fal", router);
  return app;
}

/**
 * `apiAuthMiddleware` is mounted in front of the relay in production; these
 * tests mount the router alone, so the creator identity it attaches is
 * stubbed here at the same seam.
 */
function attachCreator(
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction,
): void {
  (req as express.Request & { user?: { uid: string } }).user = {
    uid: "creator-1",
  };
  next();
}

/** A budget with room to spare — these cases are about the relay, not the cap. */
function openBudget(): SketchBudgetService {
  return new SketchBudgetService({
    store: { reserve: async () => undefined },
    dailyCapCents: 500,
    frameCostMillicents: 1,
    now: () => new Date("2026-09-17T12:00:00.000Z"),
  });
}

const validFrame = {
  prompt: "a desk lamp",
  image_url: "data:image/jpeg;base64,abc",
  strength: 0.6,
  num_inference_steps: 8,
  seed: 42,
};

const falResult = {
  images: [{ url: "data:image/jpeg;base64,render", width: 512, height: 512 }],
  timings: { inference: 0.19 },
  seed: 42,
};

describe("POST /api/fal/i2i (sketch frame relay)", () => {
  it("relays a frame to the approved model and mirrors fal's response", async () => {
    const { fetchFn, calls } = fetchStub(200, falResult);
    const server = await listenOnLoopback(
      appWith(
        createFalI2iRouter({
          falKey: "key-123",
          fetchFn,
          budget: openBudget(),
        }),
      ),
    );

    const response = await request(server)
      .post("/api/fal/i2i")
      .send(validFrame);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(falResult);
    expect(calls[0]?.url).toBe(
      "https://fal.run/fal-ai/z-image/turbo/image-to-image",
    );
    expect(calls[0]?.init?.headers).toMatchObject({
      Authorization: "Key key-123",
    });
    const sent = JSON.parse(String(calls[0]?.init?.body));
    expect(sent).toMatchObject({
      ...validFrame,
      sync_mode: true,
      output_format: "webp",
    });
  });

  it("rejects invalid frames without calling fal", async () => {
    const { fetchFn, calls } = fetchStub(200, falResult);
    const server = await listenOnLoopback(
      appWith(
        createFalI2iRouter({
          falKey: "key-123",
          fetchFn,
          budget: openBudget(),
        }),
      ),
    );

    const response = await request(server)
      .post("/api/fal/i2i")
      .send({ prompt: "no image" });

    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("returns 503 without calling fal when FAL_KEY is not configured", async () => {
    const { fetchFn, calls } = fetchStub(200, falResult);
    const server = await listenOnLoopback(
      appWith(
        createFalI2iRouter({
          falKey: undefined,
          fetchFn,
          budget: openBudget(),
        }),
      ),
    );

    const response = await request(server)
      .post("/api/fal/i2i")
      .send(validFrame);

    expect(response.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("mirrors fal's failure status and body", async () => {
    const { fetchFn } = fetchStub(403, { detail: "User is locked." });
    const server = await listenOnLoopback(
      appWith(
        createFalI2iRouter({
          falKey: "key-123",
          fetchFn,
          budget: openBudget(),
        }),
      ),
    );

    const response = await request(server)
      .post("/api/fal/i2i")
      .send(validFrame);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ detail: "User is locked." });
  });
});
