import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Request, Response } from "express";
import { API_ERROR_CODES, type ApiErrorCode } from "@shared/types/api";
import { type FailPayload, respond } from "../respond";

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

describe("respond — off-contract error codes are a compile error", () => {
  /**
   * The gate that replaces the old `code: string`. Each of these six codes was
   * emitted in production while absent from `ApiErrorCode`, which made
   * `ApiErrorCodeSchema` (a `z.enum(API_ERROR_CODES)`) reject responses the
   * server genuinely sends. They are now declared, so they type-check here.
   *
   * `satisfies` is the compile-time assertion: if any of these is removed from
   * the union, this file stops compiling — which is exactly the signal a
   * contract change should produce.
   */
  it("accepts every code the server actually emits", () => {
    const emittedInProduction = [
      "ROUTE_TIMEOUT",
      "RATE_LIMIT_UNAVAILABLE",
      "QUEUE_FULL",
      "QUEUE_TIMEOUT",
      "SESSION_EXPIRED",
      "VIDEO_PROVIDER_TIMEOUT",
    ] as const satisfies readonly ApiErrorCode[];

    for (const code of emittedInProduction) {
      expect(API_ERROR_CODES).toContain(code);
    }
  });

  it("rejects a code outside the union", () => {
    // @ts-expect-error — "TOTALLY_MADE_UP" is not an ApiErrorCode. If this
    // stops erroring, `FailPayload.code` has been widened to `string` and the
    // compile-time gate is gone.
    const bad: FailPayload = { error: "nope", code: "TOTALLY_MADE_UP" };
    expect(bad.error).toBe("nope");
  });

  it("types code as ApiErrorCode, never string", () => {
    expectTypeOf<FailPayload["code"]>().toEqualTypeOf<
      ApiErrorCode | undefined
    >();
    expectTypeOf<FailPayload["error"]>().toEqualTypeOf<string>();
  });

  it("keeps API_ERROR_CODES exhaustive over ApiErrorCode", () => {
    // `satisfies readonly ApiErrorCode[]` in shared/types/api.ts already stops
    // a bogus entry; this catches the other direction — a union member that
    // was never added to the runtime array, which would make the client's
    // z.enum reject a code the server can emit.
    const runtime = new Set<string>(API_ERROR_CODES);
    const declared: Record<ApiErrorCode, true> = {
      AUTH_REQUIRED: true,
      INVALID_REQUEST: true,
      INSUFFICIENT_CREDITS: true,
      RATE_LIMITED: true,
      SERVICE_UNAVAILABLE: true,
      LLM_UNAVAILABLE: true,
      GENERATION_FAILED: true,
      IDEMPOTENCY_KEY_REQUIRED: true,
      IDEMPOTENCY_CONFLICT: true,
      REQUEST_IN_PROGRESS: true,
      SESSION_VERSION_CONFLICT: true,
      ROUTE_TIMEOUT: true,
      RATE_LIMIT_UNAVAILABLE: true,
      QUEUE_FULL: true,
      QUEUE_TIMEOUT: true,
      SESSION_EXPIRED: true,
      VIDEO_PROVIDER_TIMEOUT: true,
    };

    for (const code of Object.keys(declared)) {
      expect(runtime.has(code)).toBe(true);
    }
    expect(runtime.size).toBe(Object.keys(declared).length);
  });
});
