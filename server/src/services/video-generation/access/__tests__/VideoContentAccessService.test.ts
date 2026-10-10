import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
  },
}));
import {
  VideoContentAccessService,
  createVideoContentAccessService,
} from "../VideoContentAccessService";

describe("VideoContentAccessService", () => {
  it("issues and verifies a valid token payload", () => {
    const service = new VideoContentAccessService({
      secret: "test-secret",
      ttlMs: 5_000,
    });

    const token = service.issueToken({ assetId: "asset-1", userId: "user-1" });
    const payload = service.verifyToken(token, "asset-1");

    expect(payload).toMatchObject({
      assetId: "asset-1",
      userId: "user-1",
    });
    expect((payload?.expiresAtMs ?? 0) > Date.now()).toBe(true);
  });

  it("rejects malformed, tampered, mismatched, and expired tokens", () => {
    const service = new VideoContentAccessService({
      secret: "test-secret",
      ttlMs: 5_000,
    });
    const token = service.issueToken({ assetId: "asset-1" });
    const tampered = `${token}x`;
    const expired = service.issueToken({ assetId: "asset-1", ttlMs: -1 });

    expect(service.verifyToken("invalid-token", "asset-1")).toBeNull();
    expect(service.verifyToken(tampered, "asset-1")).toBeNull();
    expect(service.verifyToken(token, "asset-2")).toBeNull();
    expect(service.verifyToken(expired, "asset-1")).toBeNull();
  });

  it("appends access token only for local video content URLs", () => {
    const service = new VideoContentAccessService({
      secret: "test-secret",
      ttlMs: 5_000,
    });

    const localUrl = service.buildAccessUrl(
      "/api/preview/video/content/asset-1",
      "asset-1",
      "user-1",
    );
    const externalUrl = service.buildAccessUrl(
      "https://cdn.example.com/video.mp4",
      "asset-1",
      "user-1",
    );

    expect(localUrl).toContain("/api/preview/video/content/asset-1?token=");
    expect(externalUrl).toBe("https://cdn.example.com/video.mp4");
  });

  it("returns null in production when no secret is configured", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const service = createVideoContentAccessService({
        tokenSecret: undefined,
        tokenTtlSeconds: 3600,
      });
      expect(service).toBeNull();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("returns ephemeral service outside production when secret is missing", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    try {
      const service = createVideoContentAccessService({
        tokenSecret: undefined,
        tokenTtlSeconds: 3600,
      });
      expect(service).not.toBeNull();

      const token = service?.issueToken({ assetId: "asset-1" });
      expect(service?.verifyToken(token as string, "asset-1")).not.toBeNull();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  describe("key rotation via previousSecrets", () => {
    it("accepts tokens signed with a previous secret during grace period", () => {
      const oldService = new VideoContentAccessService({
        secret: "old-secret",
        ttlMs: 5_000,
      });
      const tokenSignedWithOld = oldService.issueToken({
        assetId: "asset-1",
        userId: "user-1",
      });

      const rotatedService = new VideoContentAccessService({
        secret: "new-secret",
        previousSecrets: ["old-secret"],
        ttlMs: 5_000,
      });

      const payload = rotatedService.verifyToken(tokenSignedWithOld, "asset-1");
      expect(payload).toMatchObject({ assetId: "asset-1", userId: "user-1" });
    });

    it("rejects tokens signed with a retired secret after grace period ends", () => {
      const oldService = new VideoContentAccessService({
        secret: "old-secret",
        ttlMs: 5_000,
      });
      const tokenSignedWithOld = oldService.issueToken({
        assetId: "asset-1",
      });

      const postRotation = new VideoContentAccessService({
        secret: "new-secret",
        ttlMs: 5_000,
      });

      expect(
        postRotation.verifyToken(tokenSignedWithOld, "asset-1"),
      ).toBeNull();
    });

    it("new tokens are signed with the current secret, not a previous one", () => {
      const service = new VideoContentAccessService({
        secret: "new-secret",
        previousSecrets: ["old-secret"],
        ttlMs: 5_000,
      });
      const token = service.issueToken({ assetId: "asset-1" });

      const onlyOld = new VideoContentAccessService({
        secret: "old-secret",
        ttlMs: 5_000,
      });
      expect(onlyOld.verifyToken(token, "asset-1")).toBeNull();
    });

    it("factory wires previousTokenSecrets from config", () => {
      const oldService = new VideoContentAccessService({
        secret: "retired-key",
        ttlMs: 5_000,
      });
      const token = oldService.issueToken({ assetId: "asset-1" });

      const service = createVideoContentAccessService({
        tokenSecret: "current-key",
        previousTokenSecrets: ["retired-key"],
        tokenTtlSeconds: 60,
      });
      expect(service).not.toBeNull();
      expect(service?.verifyToken(token, "asset-1")).not.toBeNull();
    });
  });
});
