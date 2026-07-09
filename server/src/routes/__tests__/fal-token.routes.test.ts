import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createFalTokenRouter } from "../fal-token.routes";
import {
  closeLoopbackServers,
  listenOnLoopback,
} from "../../config/__tests__/loopbackTestServer";

afterEach(closeLoopbackServers);

const FAL_TOKENS_URL = "https://rest.alpha.fal.ai/tokens/";

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
  router: ReturnType<typeof createFalTokenRouter>,
): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api/fal", router);
  return app;
}

describe("POST /api/fal/proxy (realtime token mint, fal proxy dialect)", () => {
  it("forwards a token mint and returns fal's body verbatim for the fal client", async () => {
    const { fetchFn } = fetchStub(201, "jwt-smoke-token");
    const server = await listenOnLoopback(
      appWith(createFalTokenRouter({ falKey: "key-123", fetchFn })),
    );

    const response = await request(server)
      .post("/api/fal/proxy")
      .set("x-fal-target-url", FAL_TOKENS_URL)
      .send({
        allowed_apps: ["fal-ai/fast-lightning-sdxl"],
        token_expiration: 120,
      });

    expect(response.status).toBe(201);
    expect(response.body).toBe("jwt-smoke-token");
  });

  it("forces the server-side allowlist and key regardless of what the client asked for", async () => {
    const { fetchFn, calls } = fetchStub(201, "jwt");
    const server = await listenOnLoopback(
      appWith(createFalTokenRouter({ falKey: "key-123", fetchFn })),
    );

    await request(server)
      .post("/api/fal/proxy")
      .set("x-fal-target-url", FAL_TOKENS_URL)
      .send({
        allowed_apps: ["fal-ai/some-other-model"],
        token_expiration: 99999,
      });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(FAL_TOKENS_URL);
    expect(calls[0]?.init?.headers).toMatchObject({
      Authorization: "Key key-123",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      allowed_apps: ["fal-ai/fast-lightning-sdxl"],
      token_expiration: 120,
    });
  });

  it("rejects any target other than the fal tokens endpoint", async () => {
    const { fetchFn, calls } = fetchStub(200, "should-never-be-reached");
    const server = await listenOnLoopback(
      appWith(createFalTokenRouter({ falKey: "key-123", fetchFn })),
    );

    const queueCall = await request(server)
      .post("/api/fal/proxy")
      .set("x-fal-target-url", "https://queue.fal.run/fal-ai/some-model")
      .send({});
    const missingHeader = await request(server).post("/api/fal/proxy").send({});

    expect(queueCall.status).toBe(403);
    expect(missingHeader.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("returns 503 without calling fal when FAL_KEY is not configured", async () => {
    const { fetchFn, calls } = fetchStub(201, "jwt");
    const server = await listenOnLoopback(
      appWith(createFalTokenRouter({ falKey: undefined, fetchFn })),
    );

    const response = await request(server)
      .post("/api/fal/proxy")
      .set("x-fal-target-url", FAL_TOKENS_URL)
      .send({});

    expect(response.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("mirrors fal's failure status and body so the client sees the real error", async () => {
    // Real shape observed at the smoke gate: fal 403s with {"detail": "..."}.
    const { fetchFn } = fetchStub(403, {
      detail: "User is locked. Reason: Exhausted balance.",
    });
    const server = await listenOnLoopback(
      appWith(createFalTokenRouter({ falKey: "key-123", fetchFn })),
    );

    const response = await request(server)
      .post("/api/fal/proxy")
      .set("x-fal-target-url", FAL_TOKENS_URL)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      detail: "User is locked. Reason: Exhausted balance.",
    });
  });
});
