import { describe, expect, it, vi } from "vitest";
import {
  GCSStorageService,
  isOwnedConvergenceObjectPath,
} from "../StorageService";
import { SignedUrlMinter } from "@infrastructure/signedUrl/SignedUrlMinter";
import { SignedUrlLedger } from "@infrastructure/signedUrl/SignedUrlLedger";
import {
  createFakeBucket,
  SIGNATURE,
} from "@infrastructure/signedUrl/__tests__/fakeGcsSigning";

const objectPathOf = (signedUrl: string): string =>
  new URL(signedUrl).pathname.replace("/test-bucket/", "");

describe("GCSStorageService signed URL ledger", () => {
  it("uses the same owner segment for object construction authorization", () => {
    expect(
      isOwnedConvergenceObjectPath(
        "convergence/user_with_slash/frame/object.png",
        "user/with/slash",
      ),
    ).toBe(true);
    expect(
      isOwnedConvergenceObjectPath(
        "convergence/another-user/frame/object.png",
        "user/with/slash",
      ),
    ).toBe(false);
  });

  it("records the grant when it mints a convergence media URL", async () => {
    const grants = new Map<string, unknown>();
    const ledger = new SignedUrlLedger({
      get: async <T>(key: string): Promise<T | null> =>
        grants.has(key) ? (grants.get(key) as T) : null,
      set: async (key: string, value: unknown): Promise<boolean> => {
        grants.set(key, value);
        return true;
      },
    });
    const bucket = createFakeBucket();
    const storage = new GCSStorageService(
      bucket as never,
      new SignedUrlMinter(bucket as never, ledger),
    );

    const url = await storage.uploadBuffer(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      "user-1",
      "image/png",
      "frame",
    );
    await new Promise((resolve) => setImmediate(resolve));

    const objectPath = objectPathOf(url);
    expect(objectPath.startsWith("convergence/user-1/frame/")).toBe(true);
    expect(await ledger.isMintedGrant(objectPath, SIGNATURE)).toBe(true);
    expect(bucket.file(objectPath).save).toHaveBeenCalledOnce();
  });

  it("does not re-sign another user's convergence object", async () => {
    const bucket = createFakeBucket();
    const otherPath = "convergence/user-2/frames/frame.png";
    const storage = new GCSStorageService(
      bucket as never,
      new SignedUrlMinter(bucket as never),
    );

    const refreshedUrl = await storage.refreshSignedUrl(
      `https://storage.googleapis.com/test-bucket/${otherPath}`,
      "user-1",
    );

    expect(refreshedUrl).toBeNull();
    expect(bucket.file(otherPath).getSignedUrl).not.toHaveBeenCalled();
  });

  it("honours an injected signed-URL TTL instead of process-wide state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T12:00:00.000Z"));
    try {
      const bucket = createFakeBucket();
      const storage = new GCSStorageService(
        bucket as never,
        new SignedUrlMinter(bucket as never),
        120_000,
      );

      const url = await storage.uploadBuffer(
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        "user-1",
        "image/png",
        "frame",
      );

      expect(
        bucket.file(objectPathOf(url)).getSignedUrl.mock.calls[0]?.[0],
      ).toMatchObject({
        expires: Date.parse("2026-08-10T12:02:00.000Z"),
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
