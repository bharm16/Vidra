import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { createRouteTimeout } from "../routeTimeout";
import { EventEmitter } from "events";

function createMockReq(id = "req-123"): Request {
  return { id } as unknown as Request;
}

function createMockRes(): Response & {
  emitter: EventEmitter;
  statusCode: number;
  payload: unknown;
} {
  const emitter = new EventEmitter();
  const res = {
    emitter,
    statusCode: 200,
    payload: null as unknown,
    headersSent: false,
    status: vi.fn(function (this: { statusCode: number }, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(function (
      this: { payload: unknown; headersSent: boolean },
      data: unknown,
    ) {
      this.payload = data;
      this.headersSent = true;
      return this;
    }),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      emitter.on(event, listener);
      return res;
    }),
  };
  // Bind status and json to the object
  res.status = res.status.bind(res);
  res.json = res.json.bind(res);
  return res as unknown as Response & {
    emitter: EventEmitter;
    statusCode: number;
    payload: unknown;
  };
}

describe("createRouteTimeout middleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 504 after timeout when handler does not respond", () => {
    const middleware = createRouteTimeout(5_000);
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res as unknown as Response, next as NextFunction);

    // next should be called immediately (middleware is pass-through)
    expect(next).toHaveBeenCalledTimes(1);

    // Advance past the timeout
    vi.advanceTimersByTime(5_000);

    expect(res.statusCode).toBe(504);
    expect(res.payload).toEqual({
      success: false,
      error: "Request timeout",
      code: "ROUTE_TIMEOUT",
      requestId: "req-123",
    });
  });

  it("does not return 504 when handler responds within timeout", () => {
    const middleware = createRouteTimeout(5_000);
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res as unknown as Response, next as NextFunction);

    // Simulate response finishing before timeout
    res.emitter.emit("finish");

    vi.advanceTimersByTime(10_000);

    // Should still be 200
    expect(res.statusCode).toBe(200);
    expect(res.payload).toBeNull();
  });

  it("cleans up timer when response closes", () => {
    const middleware = createRouteTimeout(5_000);
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res as unknown as Response, next as NextFunction);

    // Simulate client disconnect
    res.emitter.emit("close");

    vi.advanceTimersByTime(10_000);

    // No 504 should have been sent
    expect(res.statusCode).toBe(200);
    expect(res.payload).toBeNull();
  });

  it("does not send 504 when headers have already been sent (SSE case)", () => {
    const middleware = createRouteTimeout(5_000);
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res as unknown as Response, next as NextFunction);

    // Simulate headers being sent (e.g., SSE channel already started streaming)
    (res as unknown as { headersSent: boolean }).headersSent = true;

    vi.advanceTimersByTime(5_000);

    // Status code should remain 200 and no error payload should have been set
    expect(res.statusCode).toBe(200);
    expect(res.payload).toBeNull();
  });
});
