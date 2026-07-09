import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createFalI2iRouter } from "../fal-i2i.routes";
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
  app.use("/api/fal", router);
  return app;
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
      appWith(createFalI2iRouter({ falKey: "key-123", fetchFn })),
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
    expect(sent).toMatchObject({ ...validFrame, sync_mode: true });
  });

  it("rejects invalid frames without calling fal", async () => {
    const { fetchFn, calls } = fetchStub(200, falResult);
    const server = await listenOnLoopback(
      appWith(createFalI2iRouter({ falKey: "key-123", fetchFn })),
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
      appWith(createFalI2iRouter({ falKey: undefined, fetchFn })),
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
      appWith(createFalI2iRouter({ falKey: "key-123", fetchFn })),
    );

    const response = await request(server)
      .post("/api/fal/i2i")
      .send(validFrame);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ detail: "User is locked." });
  });
});
