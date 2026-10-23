import { describe, expect, it, vi } from "vitest";
import { SignedUrlMinter } from "../SignedUrlMinter";
import { SignedUrlLedger } from "../SignedUrlLedger";
import { createFakeBucket, SIGNATURE } from "./fakeGcsSigning";
import { apiKeyUid } from "@utils/apiKeyUser";

const OBJECT_PATH = "users/u1/previews/images/1785598164559-abc.webp";

const makeLedger = (): SignedUrlLedger => {
  const store = new Map<string, unknown>();
  return new SignedUrlLedger({
    get: async <T>(key: string): Promise<T | null> =>
      store.has(key) ? (store.get(key) as T) : null,
    set: async (key: string, value: unknown) => {
      store.set(key, value);
      return true;
    },
  });
};

// Recording is fire-and-forget; let the microtask queue drain before asserting.
const settle = async (): Promise<void> => {
  await new Promise((resolve) => setImmediate(resolve));
};

describe("SignedUrlMinter", () => {
  it("refuses key-bearing legacy paths before issuing any read or write grant", async () => {
    const bucket = createFakeBucket();
    const minter = new SignedUrlMinter(bucket as never);
    for (const path of ["users/api-key:retired-test-secret/generations/clip.mp4", "image-previews/api-key:retired-test-secret/image.webp", `users/api-key:v1:${"a".repeat(64)}/generations/clip.mp4`, "users/api-key-v1:not-a-principal/generations/clip.mp4"]) {
      await expect(minter.mintRead(path, { ttlMs: 60_000 })).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
      await expect(minter.mintReadIfPresent(path, { ttlMs: 60_000 })).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
      await expect(minter.mintWrite(path, { ttlMs: 60_000, contentType: "video/mp4" })).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
      expect(bucket.file(path).getSignedUrl).not.toHaveBeenCalled();
    }
  });

  it("signs nonsecret API-key owner paths without embedding the credential", async () => {
    const credential = "configured-test-secret";
    const minter = new SignedUrlMinter(createFakeBucket() as never);
    const grant = await minter.mintRead(`users/${apiKeyUid(credential)}/generations/clip.mp4`, { ttlMs: 60_000 });
    expect(decodeURIComponent(grant.url)).not.toContain(credential);
  });
  it("signs v4 rather than taking the SDK's v2 default", async () => {
    const bucket = createFakeBucket();
    const minter = new SignedUrlMinter(bucket as never);

    const grant = await minter.mintRead(OBJECT_PATH, { ttlMs: 60_000 });

    expect(
      bucket.file(OBJECT_PATH).getSignedUrl.mock.calls[0]?.[0],
    ).toMatchObject({ version: "v4", action: "read" });
    // The shape the ledger and the media proxy both key off.
    expect(new URL(grant.url).searchParams.get("X-Goog-Signature")).toBe(
      SIGNATURE,
    );
  });

  it("records every read grant against its own object path", async () => {
    const ledger = makeLedger();
    const minter = new SignedUrlMinter(createFakeBucket() as never, ledger);

    await minter.mintRead(OBJECT_PATH, { ttlMs: 60_000 });
    await settle();

    expect(await ledger.isMintedGrant(OBJECT_PATH, SIGNATURE)).toBe(true);
    // A grant must not transfer to another object.
    expect(
      await ledger.isMintedGrant(
        "users/u2/previews/images/other.webp",
        SIGNATURE,
      ),
    ).toBe(false);
  });

  it("does not record write grants — the proxy rescue only ever reads", async () => {
    const ledger = makeLedger();
    const minter = new SignedUrlMinter(createFakeBucket() as never, ledger);

    await minter.mintWrite(OBJECT_PATH, {
      ttlMs: 60_000,
      contentType: "image/webp",
      maxSizeBytes: 1024,
    });
    await settle();

    expect(await ledger.isMintedGrant(OBJECT_PATH, SIGNATURE)).toBe(false);
  });

  it("caps the upload size and pins the generation precondition on writes", async () => {
    const bucket = createFakeBucket();
    const minter = new SignedUrlMinter(bucket as never);

    await minter.mintWrite(OBJECT_PATH, {
      ttlMs: 60_000,
      contentType: "image/webp",
      maxSizeBytes: 2048,
    });

    expect(
      bucket.file(OBJECT_PATH).getSignedUrl.mock.calls[0]?.[0],
    ).toMatchObject({
      version: "v4",
      action: "write",
      contentType: "image/webp",
      extensionHeaders: {
        "x-goog-if-generation-match": "0",
        "x-goog-content-length-range": "0,2048",
      },
    });
  });

  it("returns null instead of signing an absent object", async () => {
    const bucket = createFakeBucket("test-bucket", { present: false });
    const minter = new SignedUrlMinter(bucket as never);

    const grant = await minter.mintReadIfPresent(OBJECT_PATH, {
      ttlMs: 60_000,
    });

    expect(grant).toBeNull();
    expect(bucket.file(OBJECT_PATH).getSignedUrl).not.toHaveBeenCalled();
  });

  it("omits responseDisposition unless a caller asks for one", async () => {
    const bucket = createFakeBucket();
    const minter = new SignedUrlMinter(bucket as never);

    await minter.mintRead(OBJECT_PATH, { ttlMs: 60_000 });
    await minter.mintRead(OBJECT_PATH, {
      ttlMs: 60_000,
      disposition: "attachment",
    });

    const calls = bucket.file(OBJECT_PATH).getSignedUrl.mock.calls;
    expect(calls[0]?.[0]).not.toHaveProperty("responseDisposition");
    expect(calls[1]?.[0]).toHaveProperty("responseDisposition", "attachment");
  });

  it("reports expiry as both epoch millis and ISO", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T12:00:00.000Z"));
    try {
      const minter = new SignedUrlMinter(createFakeBucket() as never);
      const grant = await minter.mintRead(OBJECT_PATH, { ttlMs: 3_600_000 });

      expect(grant.expiresAtMs).toBe(Date.parse("2026-08-10T13:00:00.000Z"));
      expect(grant.expiresAt).toBe("2026-08-10T13:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });
});
