import http from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFalI2iRouter } from "../fal-i2i.routes";
import { SketchBudgetService } from "@services/sketch-budget/SketchBudgetService";
import {
  SketchAllowanceExceededError,
  type SketchBudgetStore,
  type SketchReservation,
} from "@services/sketch-budget/storage/SketchBudgetStore";
import { SketchFrameRefusalSchema } from "@shared/schemas/sketch.schemas";
import {
  closeLoopbackServers,
  listenOnLoopback,
} from "@config/__tests__/loopbackTestServer";

afterEach(closeLoopbackServers);

/**
 * Invariant: the relay's daily admission budget is spent BEFORE fal is
 * called, and spent frames are never given back (issue #84).
 *
 * The two halves matter equally. A cap checked after dispatch would bound
 * nothing — the money is gone the moment the request leaves. And a cap that
 * refunded a frame the browser abandoned would let a creator sketch forever
 * by closing tabs, since the abandoned call may still have cost money
 * upstream.
 */

const validFrame = {
  prompt: "a desk lamp",
  image_url: "data:image/jpeg;base64,abc",
  strength: 0.6,
  num_inference_steps: 8,
  seed: 42,
};

/** Counting adapter of the budget port — stands in for Firestore. */
class CountingStore implements SketchBudgetStore {
  reserved = 0;
  async reserve(reservation: SketchReservation): Promise<void> {
    if (this.reserved + reservation.millicents > reservation.capMillicents) {
      throw new SketchAllowanceExceededError(
        this.reserved,
        reservation.millicents,
        reservation.capMillicents,
      );
    }
    this.reserved += reservation.millicents;
  }
}

/** A budget store that cannot answer — Firestore unreachable. */
class BrokenStore implements SketchBudgetStore {
  async reserve(): Promise<void> {
    throw new Error("14 UNAVAILABLE: failed to connect");
  }
}

function budgetOver(
  store: SketchBudgetStore,
  framesPerDay: number,
): SketchBudgetService {
  return new SketchBudgetService({
    store,
    // 1¢/day split into `framesPerDay` frames, so the cap edge is one or two
    // requests away instead of thousands.
    dailyCapCents: 1,
    frameCostMillicents: 1000 / framesPerDay,
    now: () => new Date("2026-09-17T10:00:00.000Z"),
  });
}

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

function appWith(
  router: ReturnType<typeof createFalI2iRouter>,
): express.Express {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(attachCreator);
  app.use("/api/fal", router);
  return app;
}

function countingFetch(): {
  fetchFn: (url: string, init?: RequestInit) => Promise<globalThis.Response>;
  calls: number;
} {
  const state = { calls: 0 };
  const fetchFn = async (): Promise<globalThis.Response> => {
    state.calls += 1;
    return new Response(JSON.stringify({ images: [{ url: "data:," }] }), {
      status: 200,
    });
  };
  return {
    fetchFn,
    get calls() {
      return state.calls;
    },
  };
}

/** Hangs until aborted, the way a fal call in flight does. */
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

describe("POST /api/fal/i2i daily admission budget (regression)", () => {
  it("under the cap, the frame is relayed exactly as before", async () => {
    const store = new CountingStore();
    const upstream = countingFetch();
    const server = await listenOnLoopback(
      appWith(
        createFalI2iRouter({
          falKey: "key-123",
          fetchFn: upstream.fetchFn,
          budget: budgetOver(store, 4),
        }),
      ),
    );

    const response = await request(server)
      .post("/api/fal/i2i")
      .send(validFrame);

    expect(response.status).toBe(200);
    expect(upstream.calls).toBe(1);
    expect(store.reserved).toBe(250);
  });

  it("over the cap, refuses before any upstream call and names the reset", async () => {
    const store = new CountingStore();
    const upstream = countingFetch();
    const server = await listenOnLoopback(
      appWith(
        createFalI2iRouter({
          falKey: "key-123",
          fetchFn: upstream.fetchFn,
          budget: budgetOver(store, 2),
        }),
      ),
    );

    await request(server).post("/api/fal/i2i").send(validFrame);
    await request(server).post("/api/fal/i2i").send(validFrame);
    const refused = await request(server).post("/api/fal/i2i").send(validFrame);

    expect(refused.status).toBe(429);
    const body = SketchFrameRefusalSchema.parse(refused.body);
    expect(body.reason).toBe("daily-allowance-reached");
    expect(body.detail.length).toBeGreaterThan(0);
    // The reset boundary the client resumes on: the next UTC midnight.
    expect(body).toMatchObject({ resetAtMs: Date.UTC(2026, 8, 18) });
    // Two admitted frames reached fal; the third never did.
    expect(upstream.calls).toBe(2);
    expect(store.reserved).toBe(1000);
  });

  it("dispatches no frame when the budget store is unavailable", async () => {
    const upstream = countingFetch();
    const server = await listenOnLoopback(
      appWith(
        createFalI2iRouter({
          falKey: "key-123",
          fetchFn: upstream.fetchFn,
          budget: budgetOver(new BrokenStore(), 4),
        }),
      ),
    );

    const response = await request(server)
      .post("/api/fal/i2i")
      .send(validFrame);

    expect(response.status).toBe(503);
    // A distinct reason from the spent-allowance refusal: this one is
    // temporary, and the editor must not pause the day on it — so it carries
    // no reset either.
    expect(SketchFrameRefusalSchema.parse(response.body)).toEqual({
      reason: "budget-unavailable",
      detail: expect.any(String),
    });
    expect(upstream.calls).toBe(0);
  });

  it("a frame whose browser disconnected mid-flight still consumed its allowance", async () => {
    const store = new CountingStore();
    const hung = hangingUpstream();
    const budget = budgetOver(store, 1);
    const server = await listenOnLoopback(
      appWith(
        createFalI2iRouter({
          falKey: "key-123",
          fetchFn: hung.fetchFn,
          budget,
        }),
      ),
    );
    const { port } = server.address() as AddressInfo;

    // Frame 1: dispatched, then abandoned by the browser mid-flight.
    const clientRequest = http.request({
      host: "127.0.0.1",
      port,
      path: "/api/fal/i2i",
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    clientRequest.on("error", () => undefined);
    clientRequest.end(JSON.stringify(validFrame));

    await vi.waitFor(() => {
      expect(hung.state.invoked).toBe(true);
    });
    clientRequest.destroy();
    await vi.waitFor(() => {
      expect(hung.state.aborted).toBe(true);
    });

    // The abandoned frame kept its allowance: the day's only frame is spent.
    expect(store.reserved).toBe(1000);
    const refused = await request(server).post("/api/fal/i2i").send(validFrame);
    expect(refused.status).toBe(429);
    expect(SketchFrameRefusalSchema.parse(refused.body).reason).toBe(
      "daily-allowance-reached",
    );
  });
});
