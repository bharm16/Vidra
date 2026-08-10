import { vi } from "vitest";

/**
 * A `file.getSignedUrl` stub that dispatches on the signing version the way
 * `@google-cloud/storage` actually does.
 *
 * This matters because the SDK default is v2, and v2 URLs carry
 * `Signature`/`GoogleAccessId` rather than `X-Goog-Signature`. Fakes that
 * return a v4-shaped URL no matter what they were handed cannot tell a v4
 * mint site from a v2 one — which is how a default-version mint site sat in
 * the convergence store recording nothing for as long as it did.
 *
 * Anything built on this helper fails loudly if a mint site stops asking for
 * v4.
 */
export const SIGNATURE = "ab".repeat(64);

export interface FakeSignedUrlConfig {
  version?: "v2" | "v4";
  action?: string;
  expires?: number | string | Date;
  responseDisposition?: string;
  contentType?: string;
  extensionHeaders?: Record<string, string>;
}

export function signUrlLikeGcs(
  bucketName: string,
  objectPath: string,
  config: FakeSignedUrlConfig,
): string {
  const base = `https://storage.googleapis.com/${bucketName}/${objectPath}`;
  // The SDK's DEFAULT_SIGNING_VERSION is v2 — an omitted version is not v4.
  if ((config.version ?? "v2") === "v2") {
    return (
      `${base}?GoogleAccessId=signer%40example.iam.gserviceaccount.com` +
      `&Expires=1900000000&Signature=${SIGNATURE}`
    );
  }
  return (
    `${base}?X-Goog-Algorithm=GOOG4-RSA-SHA256` +
    `&X-Goog-Date=20260810T000000Z&X-Goog-Expires=3600` +
    `&X-Goog-SignedHeaders=host&X-Goog-Signature=${SIGNATURE}`
  );
}

export interface FakeGcsFile {
  name: string;
  getSignedUrl: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  getMetadata: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
}

/**
 * A bucket whose files sign like the real SDK. `present` controls whether
 * `exists()`/`getMetadata()` report the object as there.
 */
export function createFakeBucket(
  bucketName = "test-bucket",
  { present = true }: { present?: boolean } = {},
): { name: string; file: (path: string) => FakeGcsFile } {
  const files = new Map<string, FakeGcsFile>();
  return {
    name: bucketName,
    file(objectPath: string): FakeGcsFile {
      const existing = files.get(objectPath);
      if (existing) return existing;
      const file: FakeGcsFile = {
        name: objectPath,
        getSignedUrl: vi.fn(async (config: FakeSignedUrlConfig) => [
          signUrlLikeGcs(bucketName, objectPath, config),
        ]),
        exists: vi.fn().mockResolvedValue([present]),
        getMetadata: vi
          .fn()
          .mockResolvedValue([{ size: "123", contentType: "image/webp" }]),
        save: vi.fn().mockResolvedValue(undefined),
      };
      files.set(objectPath, file);
      return file;
    },
  };
}
