import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { respond } from "../respond";

type RequestWithId = Request & { id?: string };

function createResponse(): Response & {
  statusCode?: number;
  body?: Record<string, unknown>;
} {
  const res = {
    statusCode: undefined as number | undefined,
    body: undefined as Record<string, unknown> | undefined,
    status: vi.fn(function (this: typeof res, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(function (this: typeof res, body: Record<string, unknown>) {
      this.body = body;
      return this;
    }),
  };
  return res as unknown as Response & {
    statusCode?: number;
    body?: Record<string, unknown>;
  };
}

const reqWithId = (id?: string): Request =>
  ({ id }) as unknown as RequestWithId as Request;

describe("respond — the canonical envelope", () => {
  it("fail emits success:false with a flat string error", () => {
    const res = createResponse();
    respond.fail(res, reqWithId("r-1"), 429, {
      error: "Too many requests",
      code: "RATE_LIMITED",
    });

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({
      success: false,
      error: "Too many requests",
      code: "RATE_LIMITED",
      requestId: "r-1",
    });
  });

  it("ok emits success:true with data", () => {
    const res = createResponse();
    respond.ok(res, reqWithId("r-2"), { id: "abc" }, 201);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      success: true,
      data: { id: "abc" },
      requestId: "r-2",
    });
  });

  it("omits requestId entirely when the request carries no id", () => {
    const res = createResponse();
    respond.fail(res, reqWithId(), 400, {
      error: "Invalid",
      code: "INVALID_REQUEST",
    });

    expect(res.body).not.toHaveProperty("requestId");
  });
});
