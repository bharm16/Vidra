import { PassThrough, Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockFile = {
  name: string;
  save: ReturnType<typeof vi.fn>;
  getMetadata: ReturnType<typeof vi.fn>;
  getSignedUrl: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  createReadStream: ReturnType<typeof vi.fn>;
  createWriteStream: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => {
  const files = new Map<string, MockFile>();
  const bucket = {
    file: vi.fn((name: string) => {
      const file = files.get(name);
      if (!file) {
        throw new Error(`Missing test file stub: ${name}`);
      }
      return file;
    }),
    getFiles: vi.fn(),
  };

  return {
    files,
    bucket,
    loggerWarn: vi.fn(),
  };
});

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: () => ({
      warn: mocks.loggerWarn,
    }),
  },
}));

vi.mock("uuid", () => ({
  v4: vi.fn(),
}));

import { SignedUrlMinter } from "@infrastructure/signedUrl/SignedUrlMinter";
import { GcsVideoAssetStore } from "../GcsVideoAssetStore";

// A "missing" file responds as a non-existent GCS object would across every
// I/O surface the SDK exposes — exists() returns false, getMetadata/delete/
// createReadStream all surface a 404. The store may probe via any of these.
const createMissingFile = (name: string): MockFile => {
  const notFound = Object.assign(new Error("No such object"), { code: 404 });
  return {
    name,
    save: vi.fn().mockResolvedValue(undefined),
    getMetadata: vi.fn().mockRejectedValue(notFound),
    getSignedUrl: vi
      .fn()
      .mockResolvedValue([`https://signed.example.com/${name}`]),
    exists: vi.fn().mockResolvedValue([false]),
    createReadStream: vi.fn(() => {
      const stream = new PassThrough();
      stream.destroy(notFound);
      return stream;
    }),
    createWriteStream: vi.fn(() => new PassThrough()),
    delete: vi.fn().mockRejectedValue(notFound),
  };
};

const createPresentFile = (name: string): MockFile => ({
  name,
  save: vi.fn().mockResolvedValue(undefined),
  getMetadata: vi
    .fn()
    .mockResolvedValue([{ size: "42", contentType: "video/mp4" }]),
  getSignedUrl: vi
    .fn()
    .mockResolvedValue([`https://signed.example.com/${name}`]),
  exists: vi.fn().mockResolvedValue([true]),
  createReadStream: vi.fn(() => Readable.from(Buffer.from("stored-video"))),
  createWriteStream: vi.fn(() => new PassThrough()),
  delete: vi.fn().mockResolvedValue(undefined),
});

describe("regression: missing GCS objects must surface as null", () => {
  beforeEach(() => {
    mocks.files.clear();
    mocks.bucket.file.mockClear();
    mocks.bucket.getFiles.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Invariant: For any assetId whose underlying GCS object does not exist,
  // getPublicUrl must return null. The store must not return a signed URL
  // that would later 404 on fetch — downstream consumers (e.g. GradingService)
  // rely on the null short-circuit to skip work cleanly.
  it("getPublicUrl returns null when the GCS object does not exist", async () => {
    const objectName = "video-previews/missing";
    mocks.files.set(objectName, createMissingFile(objectName));

    const store = new GcsVideoAssetStore({
      bucket: mocks.bucket as never,
      minter: new SignedUrlMinter(mocks.bucket as never),
      basePath: "video-previews",
      signedUrlTtlMs: 60_000,
      cacheControl: "public, max-age=86400",
    });

    const url = await store.getPublicUrl("missing");

    expect(url).toBeNull();
  });

  // Invariant: For any assetId whose underlying GCS object does not exist,
  // getStream must return null — never a stream that would error mid-read.
  it("getStream returns null when the GCS object does not exist", async () => {
    const objectName = "video-previews/missing";
    mocks.files.set(objectName, createMissingFile(objectName));

    const store = new GcsVideoAssetStore({
      bucket: mocks.bucket as never,
      minter: new SignedUrlMinter(mocks.bucket as never),
      basePath: "video-previews",
      signedUrlTtlMs: 60_000,
      cacheControl: "public, max-age=86400",
    });

    const result = await store.getStream("missing");

    expect(result).toBeNull();
  });

  // Sanity check: when the object DOES exist, both methods return non-null.
  // Without this we couldn't distinguish "always returns null" from a real fix.
  it("returns non-null when the GCS object exists (control)", async () => {
    const objectName = "video-previews/present";
    mocks.files.set(objectName, createPresentFile(objectName));

    const store = new GcsVideoAssetStore({
      bucket: mocks.bucket as never,
      minter: new SignedUrlMinter(mocks.bucket as never),
      basePath: "video-previews",
      signedUrlTtlMs: 60_000,
      cacheControl: "public, max-age=86400",
    });

    const url = await store.getPublicUrl("present");
    const stream = await store.getStream("present");

    expect(url).toBe("https://signed.example.com/video-previews/present");
    expect(stream).not.toBeNull();
    expect(stream?.contentType).toBe("video/mp4");
  });
});
