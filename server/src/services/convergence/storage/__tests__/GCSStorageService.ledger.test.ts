import { describe, expect, it, vi } from "vitest";
import {
  GCSStorageService,
  isOwnedConvergenceObjectPath,
} from "../StorageService";
import { SignedUrlLedger } from "@services/storage/services/SignedUrlLedger";

const OBJECT_PATH = "convergence/user-1/frames/frame.png";
const SIGNATURE = "minted-convergence-signature";
const SIGNED_URL =
  `https://storage.googleapis.com/test-bucket/${OBJECT_PATH}` +
  `?X-Goog-Signature=${SIGNATURE}`;

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
    const save = vi.fn().mockResolvedValue(undefined);
    const storage = new GCSStorageService(
      {
        name: "test-bucket",
        file: vi.fn(() => ({
          name: OBJECT_PATH,
          save,
          getSignedUrl: vi.fn().mockResolvedValue([SIGNED_URL]),
        })),
      } as never,
      ledger,
    );

    await storage.uploadBuffer(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      "user-1",
      "image/png",
      "frame",
    );

    await expect(ledger.isMintedGrant(OBJECT_PATH, SIGNATURE)).resolves.toBe(
      true,
    );
    expect(save).toHaveBeenCalledOnce();
  });

  it("does not re-sign another user's convergence object", async () => {
    const getSignedUrl = vi.fn().mockResolvedValue([SIGNED_URL]);
    const storage = new GCSStorageService({
      name: "test-bucket",
      file: vi.fn(() => ({
        name: "convergence/user-2/frames/frame.png",
        getSignedUrl,
      })),
    } as never);

    const refreshedUrl = await storage.refreshSignedUrl(
      "https://storage.googleapis.com/test-bucket/convergence/user-2/frames/frame.png",
      "user-1",
    );

    expect(refreshedUrl).toBeNull();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
});
