import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { requireUserId, type RequestWithUser } from "../requireUserId";

function createResponse(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe("requireUserId", () => {
  it("returns user id when present", () => {
    const req = { user: { uid: "user-1" } } as RequestWithUser;
    const res = createResponse();

    const userId = requireUserId(req, res);

    expect(userId).toBe("user-1");
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns null and sends 401 when user id is missing", () => {
    const req = { user: undefined } as unknown as RequestWithUser;
    const res = createResponse();

    const userId = requireUserId(req, res);

    expect(userId).toBeNull();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Authentication required",
      code: "AUTH_REQUIRED",
    });
  });
});
