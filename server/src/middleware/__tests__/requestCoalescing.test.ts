import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { RequestCoalescingMiddleware } from "../requestCoalescing";

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

type TestRequest = Request & {
  id?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

type EventMap = Record<string, (arg?: unknown) => void>;

type TestResponse = Response & {
  emit?: (event: string, arg?: unknown) => void;
};

function createRequest(overrides: Partial<TestRequest> = {}): TestRequest {
  const headers: Record<string, string> = {
    authorization: "Bearer token",
    "x-api-key": "api-key-token",
    ...((overrides.headers ?? {}) as Record<string, string>),
  };

  return {
    method: "POST",
    path: "/api/test",
    baseUrl: "",
    body: { prompt: "hello" },
    headers,
    id: "req-1",
    get: vi.fn((name: string) => headers[name.toLowerCase()]),
    ...overrides,
  } as unknown as TestRequest;
}

function createResponse(): TestResponse {
  const events: EventMap = {};
  const headers: Record<string, string | string[]> = {};

  const res = {
    statusCode: 200,
    writableEnded: false,
    status: vi.fn(function status(this: TestResponse, code: number) {
      this.statusCode = code;
      return this;
    }),
    setHeader: vi.fn((name: string, value: unknown) => {
      const lower = name.toLowerCase();
      headers[lower] = Array.isArray(value)
        ? value.map((entry) => String(entry))
        : String(value);
      return res;
    }),
    getHeaders: vi.fn(() => headers),
    json: vi.fn(function json(this: TestResponse, _body: unknown) {
      return this;
    }),
    send: vi.fn(function send(this: TestResponse, _body: unknown) {
      return this;
    }),
    end: vi.fn(function end(this: TestResponse, _body?: unknown) {
      return this;
    }),
    once: vi.fn((event: string, cb: (arg?: unknown) => void) => {
      events[event] = cb;
      return res;
    }),
    emit: (event: string, arg?: unknown) => {
      events[event]?.(arg);
    },
  };

  return res as unknown as TestResponse;
}

describe("RequestCoalescingMiddleware", () => {
  let service: RequestCoalescingMiddleware;

  beforeEach(() => {
    service = new RequestCoalescingMiddleware();
  });

  afterEach(() => {
    service.dispose();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("bypasses non-POST requests", async () => {
    const middleware = service.middleware({ keyScope: "/api/optimize" });
    const req = createRequest({ method: "GET" });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(service.getStats().total).toBe(0);
  });

  it("skips streaming requests", async () => {
    const middleware = service.middleware({ keyScope: "/api/llm/label-spans" });
    const req = createRequest({
      path: "/stream",
      baseUrl: "/api/llm/label-spans",
      headers: {
        accept: "text/event-stream",
      },
    });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(service.getStats().total).toBe(0);
  });

  it("deduplicates concurrent identical requests", async () => {
    vi.useFakeTimers();
    const middleware = service.middleware({ keyScope: "/api/optimize" });
    const req1 = createRequest({ id: "req-1" });
    const req2 = createRequest({ id: "req-2" });
    const res1 = createResponse();
    const res2 = createResponse();

    const next1 = vi.fn(() => {
      setTimeout(() => {
        res1.json({ ok: true, value: 42 });
      }, 10);
    }) as NextFunction;
    const next2 = vi.fn() as NextFunction;

    const p1 = middleware(req1, res1, next1);
    const p2 = middleware(req2, res2, next2);

    await vi.advanceTimersByTimeAsync(10);
    await Promise.all([p1, p2]);

    expect(next1).toHaveBeenCalledTimes(1);
    expect(next2).not.toHaveBeenCalled();
    expect(res2.status).toHaveBeenCalledWith(200);
    expect(res2.json).toHaveBeenCalledWith({ ok: true, value: 42 });

    const stats = service.getStats();
    expect(stats.unique).toBe(1);
    expect(stats.coalesced).toBe(1);
    expect(stats.totalSaved).toBe(1);
    expect(stats.activePending).toBe(1);

    await vi.advanceTimersByTimeAsync(250);
    expect(service.getStats().activePending).toBe(0);
  });

  it("does not coalesce when credentials differ", async () => {
    vi.useFakeTimers();
    const middleware = service.middleware({ keyScope: "/api/optimize" });
    const req1 = createRequest({
      id: "req-1",
      headers: {
        authorization: "Bearer token-a",
      },
    });
    const req2 = createRequest({
      id: "req-2",
      headers: {
        authorization: "Bearer token-b",
      },
    });
    const res1 = createResponse();
    const res2 = createResponse();

    const next1 = vi.fn(() => {
      setTimeout(() => {
        res1.json({ ok: true, id: "a" });
      }, 5);
    }) as NextFunction;
    const next2 = vi.fn(() => {
      setTimeout(() => {
        res2.json({ ok: true, id: "b" });
      }, 5);
    }) as NextFunction;

    const p1 = middleware(req1, res1, next1);
    const p2 = middleware(req2, res2, next2);

    await vi.advanceTimersByTimeAsync(10);
    await Promise.all([p1, p2]);

    expect(next1).toHaveBeenCalledTimes(1);
    expect(next2).toHaveBeenCalledTimes(1);

    const stats = service.getStats();
    expect(stats.unique).toBe(2);
    expect(stats.coalesced).toBe(0);
  });

  it("replays res.send responses to coalesced waiters", async () => {
    vi.useFakeTimers();
    const middleware = service.middleware({ keyScope: "/api/optimize" });
    const req1 = createRequest({ id: "req-1" });
    const req2 = createRequest({ id: "req-2" });
    const res1 = createResponse();
    const res2 = createResponse();

    const next1 = vi.fn(() => {
      setTimeout(() => {
        res1.status(202);
        res1.send("accepted");
      }, 5);
    }) as NextFunction;
    const next2 = vi.fn() as NextFunction;

    const p1 = middleware(req1, res1, next1);
    const p2 = middleware(req2, res2, next2);

    await vi.advanceTimersByTimeAsync(5);
    await Promise.all([p1, p2]);

    expect(next2).not.toHaveBeenCalled();
    expect(res2.status).toHaveBeenCalledWith(202);
    expect(res2.send).toHaveBeenCalledWith("accepted");
  });

  it("replays res.end responses to coalesced waiters", async () => {
    vi.useFakeTimers();
    const middleware = service.middleware({ keyScope: "/api/optimize" });
    const req1 = createRequest({ id: "req-1" });
    const req2 = createRequest({ id: "req-2" });
    const res1 = createResponse();
    const res2 = createResponse();

    const next1 = vi.fn(() => {
      setTimeout(() => {
        res1.status(204);
        res1.end();
      }, 5);
    }) as NextFunction;
    const next2 = vi.fn() as NextFunction;

    const p1 = middleware(req1, res1, next1);
    const p2 = middleware(req2, res2, next2);

    await vi.advanceTimersByTimeAsync(5);
    await Promise.all([p1, p2]);

    expect(next2).not.toHaveBeenCalled();
    expect(res2.status).toHaveBeenCalledWith(204);
    expect(res2.end).toHaveBeenCalled();
  });

  it("generates deterministic keys using hashed credentials and canonical body", () => {
    const reqA = createRequest({
      headers: { authorization: "Bearer secret-token-abcdef" },
      body: { foo: "bar", nested: { a: 1, b: 2 } },
    });
    const reqB = createRequest({
      headers: { authorization: "Bearer secret-token-abcdef" },
      body: { nested: { b: 2, a: 1 }, foo: "bar" },
    });
    const reqC = createRequest({
      headers: { authorization: "Bearer different-token" },
      body: { foo: "bar", nested: { a: 1, b: 2 } },
    });

    const keyA = service.generateKey(reqA, { keyScope: "/api/optimize" });
    const keyB = service.generateKey(reqB, { keyScope: "/api/optimize" });
    const keyC = service.generateKey(reqC, { keyScope: "/api/optimize" });

    expect(keyA).toBe(keyB);
    expect(keyA).not.toBe(keyC);
    expect(keyA).toMatch(/^POST:\/api\/optimize:[a-f0-9]{32}:[a-f0-9]{32}$/);
    expect(keyA).not.toContain("secret-token-abcdef");
  });

  describe("capacity cap and housekeeper", () => {
    async function startUnique(
      svc: RequestCoalescingMiddleware,
      body: unknown,
    ): Promise<void> {
      const middleware = svc.middleware({ keyScope: "/api/optimize" });
      const req = createRequest({ body });
      const res = createResponse();
      const next = vi.fn() as NextFunction;
      await middleware(req, res, next);
    }

    it("evicts oldest entry when hard cap is reached", async () => {
      const svc = new RequestCoalescingMiddleware({ maxPending: 3 });
      await startUnique(svc, { prompt: "a" });
      await startUnique(svc, { prompt: "b" });
      await startUnique(svc, { prompt: "c" });
      await startUnique(svc, { prompt: "d" });

      expect(svc.capacityStats().pending).toBe(3);
      svc.dispose();
    });

    it("evicts in insertion order (oldest first)", async () => {
      const svc = new RequestCoalescingMiddleware({ maxPending: 3 });
      const mw = svc.middleware({ keyScope: "/api/optimize" });
      const reqA = createRequest({ body: { prompt: "A" } });
      const reqB = createRequest({ body: { prompt: "B" } });
      const reqC = createRequest({ body: { prompt: "C" } });
      const reqD = createRequest({ body: { prompt: "D" } });
      const keyA = svc.generateKey(reqA, { keyScope: "/api/optimize" });
      const keyB = svc.generateKey(reqB, { keyScope: "/api/optimize" });
      const keyC = svc.generateKey(reqC, { keyScope: "/api/optimize" });
      const keyD = svc.generateKey(reqD, { keyScope: "/api/optimize" });

      await mw(reqA, createResponse(), vi.fn() as NextFunction);
      await mw(reqB, createResponse(), vi.fn() as NextFunction);
      await mw(reqC, createResponse(), vi.fn() as NextFunction);
      await mw(reqD, createResponse(), vi.fn() as NextFunction);

      // Access private via cast to inspect presence
      const map = (svc as unknown as { pendingRequests: Map<string, unknown> })
        .pendingRequests;
      expect(map.has(keyA)).toBe(false);
      expect(map.has(keyB)).toBe(true);
      expect(map.has(keyC)).toBe(true);
      expect(map.has(keyD)).toBe(true);
      svc.dispose();
    });

    it("stopHousekeeper is idempotent", () => {
      const svc = new RequestCoalescingMiddleware();
      expect(() => {
        svc.stopHousekeeper();
        svc.stopHousekeeper();
      }).not.toThrow();
      svc.dispose();
    });

    it("startHousekeeper is idempotent (no duplicate handle)", () => {
      const svc = new RequestCoalescingMiddleware();
      const firstHandle = (
        svc as unknown as {
          housekeepTimer: ReturnType<typeof setInterval> | null;
        }
      ).housekeepTimer;
      svc.startHousekeeper();
      const secondHandle = (
        svc as unknown as {
          housekeepTimer: ReturnType<typeof setInterval> | null;
        }
      ).housekeepTimer;
      expect(secondHandle).toBe(firstHandle);
      svc.stopHousekeeper();
      expect(
        (svc as unknown as { housekeepTimer: unknown }).housekeepTimer,
      ).toBeNull();
    });

    it("capacityStats returns pending count and maxPending", async () => {
      const svc = new RequestCoalescingMiddleware({ maxPending: 10 });
      await startUnique(svc, { prompt: "x" });
      await startUnique(svc, { prompt: "y" });

      expect(svc.capacityStats()).toEqual({ pending: 2, maxPending: 10 });
      svc.dispose();
    });

    it("clear() preserves the housekeeper (runtime-safe reset)", () => {
      const svc = new RequestCoalescingMiddleware();
      const before = (
        svc as unknown as {
          housekeepTimer: ReturnType<typeof setInterval> | null;
        }
      ).housekeepTimer;
      expect(before).not.toBeNull();
      svc.clear();
      const after = (
        svc as unknown as {
          housekeepTimer: ReturnType<typeof setInterval> | null;
        }
      ).housekeepTimer;
      expect(after).toBe(before);
      svc.dispose();
    });

    describe("with fake timers", () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it("independent housekeeper sweeps expired entries", async () => {
        const svc = new RequestCoalescingMiddleware({
          housekeepIntervalMs: 100,
        });
        // Seed an already-expired entry via the internal map
        const map = (
          svc as unknown as {
            pendingRequests: Map<
              string,
              {
                promise: Promise<unknown>;
                completedAt: number;
                expiresAt: number;
              }
            >;
          }
        ).pendingRequests;
        map.set("stale-key", {
          promise: Promise.resolve(),
          completedAt: Date.now() - 1000,
          expiresAt: Date.now() - 500,
        });
        expect(svc.capacityStats().pending).toBe(1);

        await vi.advanceTimersByTimeAsync(150);

        expect(svc.capacityStats().pending).toBe(0);
        svc.dispose();
      });

      it("housekeeper preserves in-flight (expiresAt === null) entries", async () => {
        const svc = new RequestCoalescingMiddleware({
          housekeepIntervalMs: 100,
        });
        const map = (
          svc as unknown as {
            pendingRequests: Map<
              string,
              {
                promise: Promise<unknown>;
                completedAt: number | null;
                expiresAt: number | null;
              }
            >;
          }
        ).pendingRequests;
        map.set("in-flight", {
          promise: Promise.resolve(),
          completedAt: null,
          expiresAt: null,
        });
        map.set("expired", {
          promise: Promise.resolve(),
          completedAt: Date.now() - 1000,
          expiresAt: Date.now() - 500,
        });
        expect(svc.capacityStats().pending).toBe(2);

        await vi.advanceTimersByTimeAsync(150);

        expect(map.has("in-flight")).toBe(true);
        expect(map.has("expired")).toBe(false);
        expect(svc.capacityStats().pending).toBe(1);
        svc.dispose();
      });
    });
  });
});
