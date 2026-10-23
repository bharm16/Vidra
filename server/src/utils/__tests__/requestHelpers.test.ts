import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { extractFirebaseUid, extractUserId } from "../requestHelpers";
import { apiKeyUid } from "../apiKeyUser";

const mockRequest = (overrides: Record<string, unknown> = {}): Request =>
  ({
    method: "GET",
    path: "/test",
    ip: "127.0.0.1",
    body: {},
    ...overrides,
  }) as unknown as Request;

describe("extractUserId", () => {
  describe("priority order", () => {
    it("does not accept an unverified request-body identity", () => {
      const req = mockRequest({ body: { userId: "body-user-789" } });
      expect(extractUserId(req)).toBe("anonymous");
    });
  });

  describe("edge cases", () => {
    it("prefers Firebase user over apiKey", () => {
      const req = mockRequest({
        user: { uid: "firebase-uid" },
        apiKey: "api-key",
        body: { userId: "body-user" },
      });
      expect(extractUserId(req)).toBe("firebase-uid");
    });

    it("does not promote credentials or body claims into an identity", () => {
      const req = mockRequest({
        apiKey: "api-key",
        body: { userId: "body-user" },
      });
      expect(extractUserId(req)).toBe("anonymous");
      expect(extractFirebaseUid(req)).toBeNull();
    });

    it("returns anonymous when user object exists but uid is undefined", () => {
      const req = mockRequest({ user: {} });
      expect(extractUserId(req)).toBe("anonymous");
    });
    it("uses the nonsecret API-key principal established by authentication", () => {
      const uid = apiKeyUid("configured-test-secret");
      expect(extractUserId(mockRequest({ user: { uid } }))).toBe(uid);
    });
    it.each(["api-key:retired-test-secret", `api-key:v1:${"a".repeat(64)}`, "api-key-v1:not-a-principal"])("refuses an unsafe API-key identity without reflecting it", uid => {
      const req = mockRequest({ user: { uid } });
      expect(extractUserId(req)).toBe("anonymous");
      expect(extractFirebaseUid(req)).toBeNull();
    });
  });
});
