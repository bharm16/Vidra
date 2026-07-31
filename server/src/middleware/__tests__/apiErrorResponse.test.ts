import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { sendApiError } from "../apiErrorResponse";

type RequestWithId = Request & { id?: string };

function createResponse(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe("sendApiError", () => {
  it("returns status and payload with optional fields omitted", () => {
    const res = createResponse();
    const req = { id: undefined } as unknown as RequestWithId;

    sendApiError(res, req, 400, { error: "Bad request" });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Bad request",
    });
  });

  it("includes code details and requestId when present", () => {
    const res = createResponse();
    const req = { id: "req-123" } as RequestWithId;

    sendApiError(res, req, 422, {
      error: "Validation failed",
      code: "INVALID_REQUEST",
      details: "invalid payload",
    });

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Validation failed",
      code: "INVALID_REQUEST",
      details: "invalid payload",
      requestId: "req-123",
    });
  });
});
