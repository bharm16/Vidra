import http from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFalI2iRouter } from "../fal-i2i.routes";
import {
  closeLoopbackServers,
  listenOnLoopback,
} from "../../config/__tests__/loopbackTestServer";

afterEach(closeLoopbackServers);

/**
 * Invariant: the relay never leaks a running fal call past its caller.
 * A sketch frame the browser abandoned (watchdog abort, tab close) or one
 * that fal will never answer must stop billing — the upstream fetch aborts.
 * Regression for the spend leak found in the 2026-07-27 live-editor
 * performance diagnosis: the upstream call had no signal at all.
 */

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

/**
 * An upstream that hangs until its AbortSignal fires, then rejects the way
 * undici's fetch does — the process-external boundary contract under test.
 */
function hangingUpstream(): {
  fetchFn: (url: string, init?: RequestInit) => Promise<globalThis.Response>;
  state: { invoked: boolean; aborted: boolean };
} {
  const state = { invoked: false, aborted: false };
  const fetchFn = (
    _url: string,
    init?: RequestInit,
  ): Promise<globalThis.Response> => {
    state.invoked = true;
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        state.aborted = true;
        reject(new DOMException("This operation was aborted", "AbortError"));
      });
    });
  };
  return { fetchFn, state };
}

describe("POST /api/fal/i2i upstream lifecycle (regression)", () => {
  it("aborts the upstream fal call when the client disconnects mid-frame", async () => {
    const { fetchFn, state } = hangingUpstream();
    const server = await listenOnLoopback(
      appWith(createFalI2iRouter({ falKey: "key-123", fetchFn })),
    );
    const { port } = server.address() as AddressInfo;

    const clientRequest = http.request({
      host: "127.0.0.1",
      port,
      path: "/api/fal/i2i",
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    // Destroying mid-flight surfaces ECONNRESET on the client side by design.
    clientRequest.on("error", () => undefined);
    clientRequest.end(JSON.stringify(validFrame));

    await vi.waitFor(() => {
      expect(state.invoked).toBe(true);
    });
    clientRequest.destroy();

    await vi.waitFor(() => {
      expect(state.aborted).toBe(true);
    });
  });

  it("times out a hung upstream call, aborts it, and answers 504", async () => {
    const { fetchFn, state } = hangingUpstream();
    const server = await listenOnLoopback(
      appWith(
        createFalI2iRouter({
          falKey: "key-123",
          fetchFn,
          upstreamTimeoutMs: 40,
        }),
      ),
    );

    const response = await request(server)
      .post("/api/fal/i2i")
      .send(validFrame);

    expect(response.status).toBe(504);
    expect(response.body).toEqual({ detail: "fal upstream timed out" });
    expect(state.aborted).toBe(true);
  });
});
