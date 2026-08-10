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

import { v4 as uuidv4 } from "uuid";
import { SignedUrlMinter } from "@infrastructure/signedUrl/SignedUrlMinter";
import { GcsVideoAssetStore } from "../GcsVideoAssetStore";

const createFile = (name: string, overrides?: Partial<MockFile>): MockFile => ({
  name,
  save: vi.fn().mockResolvedValue(undefined),
  getMetadata: vi
    .fn()
    .mockResolvedValue([{ size: "0", contentType: "video/mp4" }]),
  getSignedUrl: vi
    .fn()
    .mockResolvedValue([`https://signed.example.com/${name}`]),
  exists: vi.fn().mockResolvedValue([true]),
  createReadStream: vi.fn(() => Readable.from(Buffer.from("stored-video"))),
  createWriteStream: vi.fn(() => new PassThrough()),
  delete: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("GcsVideoAssetStore", () => {
  let uuidMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    uuidMock = uuidv4 as unknown as ReturnType<typeof vi.fn>;
    uuidMock.mockReset();
    mocks.files.clear();
    mocks.bucket.file.mockClear();
    mocks.bucket.getFiles.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores from buffer and returns signed url + metadata size", async () => {
    uuidMock.mockReturnValue("video-asset-1");
    const objectName = "video-previews/video-asset-1";
    const file = createFile(objectName, {
      getMetadata: vi
        .fn()
        .mockResolvedValue([{ size: "321", contentType: "video/mp4" }]),
      getSignedUrl: vi
        .fn()
        .mockResolvedValue(["https://signed.example.com/video-asset-1"]),
    });
    mocks.files.set(objectName, file);

    const store = new GcsVideoAssetStore({
      bucket: mocks.bucket as never,
      minter: new SignedUrlMinter(mocks.bucket as never),
      basePath: "/video-previews/",
      signedUrlTtlMs: 60_000,
      cacheControl: "public, max-age=86400",
    });

    const result = await store.storeFromBuffer(
      Buffer.from([1, 2, 3]),
      "video/mp4",
    );

    expect(file.save).toHaveBeenCalledWith(Buffer.from([1, 2, 3]), {
      contentType: "video/mp4",
      resumable: false,
      metadata: {
        cacheControl: "public, max-age=86400",
      },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    expect(result).toMatchObject({
      id: "video-asset-1",
      url: "https://signed.example.com/video-asset-1",
      contentType: "video/mp4",
      sizeBytes: 321,
    });
  });

  it("stores from stream using write stream metadata and returns signed URL", async () => {
    uuidMock.mockReturnValue("video-asset-2");
    const objectName = "base/video-asset-2";
    const file = createFile(objectName, {
      getMetadata: vi
        .fn()
        .mockResolvedValue([{ size: "77", contentType: "video/webm" }]),
      getSignedUrl: vi
        .fn()
        .mockResolvedValue(["https://signed.example.com/video-asset-2"]),
    });
    mocks.files.set(objectName, file);

    const store = new GcsVideoAssetStore({
      bucket: mocks.bucket as never,
      minter: new SignedUrlMinter(mocks.bucket as never),
      basePath: "base",
      signedUrlTtlMs: 120_000,
      cacheControl: "private, max-age=30",
    });

    const result = await store.storeFromStream(
      Readable.from(Buffer.from([9, 8, 7])),
      "video/webm",
    );

    expect(file.createWriteStream).toHaveBeenCalledWith({
      metadata: {
        contentType: "video/webm",
        cacheControl: "private, max-age=30",
      },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    expect(result).toMatchObject({
      id: "video-asset-2",
      url: "https://signed.example.com/video-asset-2",
      contentType: "video/webm",
      sizeBytes: 77,
    });
  });

  it("returns stream metadata when object exists and null when missing", async () => {
    const existingName = "video-previews/existing";
    const existing = createFile(existingName, {
      getMetadata: vi.fn().mockResolvedValue([{ size: "0" }]),
    });
    const missingName = "video-previews/missing";
    const notFound = Object.assign(new Error("No such object"), { code: 404 });
    const missing = createFile(missingName, {
      getMetadata: vi.fn().mockRejectedValue(notFound),
    });
    mocks.files.set(existingName, existing);
    mocks.files.set(missingName, missing);

    const store = new GcsVideoAssetStore({
      bucket: mocks.bucket as never,
      minter: new SignedUrlMinter(mocks.bucket as never),
      basePath: "video-previews",
      signedUrlTtlMs: 60_000,
      cacheControl: "public, max-age=86400",
    });

    const existingStream = await store.getStream("existing");
    const missingStream = await store.getStream("missing");

    expect(existingStream?.contentType).toBe("video/mp4");
    expect(existingStream?.contentLength).toBeUndefined();
    expect(missingStream).toBeNull();
  });

  it("returns null and logs warning when public url lookup fails", async () => {
    const missingName = "video-previews/missing";
    const notFound = Object.assign(new Error("No such object"), { code: 404 });
    mocks.files.set(
      missingName,
      createFile(missingName, {
        exists: vi.fn().mockResolvedValue([false]),
        getMetadata: vi.fn().mockRejectedValue(notFound),
      }),
    );
    const errorName = "video-previews/erroring";
    mocks.files.set(
      errorName,
      createFile(errorName, {
        exists: vi.fn().mockRejectedValue(new Error("gcs unavailable")),
        getMetadata: vi.fn().mockRejectedValue(new Error("gcs unavailable")),
      }),
    );

    const store = new GcsVideoAssetStore({
      bucket: mocks.bucket as never,
      minter: new SignedUrlMinter(mocks.bucket as never),
      basePath: "video-previews",
      signedUrlTtlMs: 60_000,
      cacheControl: "public, max-age=86400",
    });

    expect(await store.getPublicUrl("missing")).toBeNull();
    expect(await store.getPublicUrl("erroring")).toBeNull();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "Video asset missing in GCS",
      {
        assetId: "missing",
      },
    );
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "Failed to generate video signed URL",
      {
        assetId: "erroring",
        error: "gcs unavailable",
      },
    );
  });

  // Regression: V4 signed URLs are signed client-side and do not perform any
  // GCS round-trip. A previous refactor removed the presence precheck and
  // relied on `getSignedUrl` throwing on missing objects — which it never
  // does. `getPublicUrl` must return null for any assetId not present in GCS.
  // The precheck now lives in SignedUrlMinter.mintReadIfPresent.
  it("regression: getPublicUrl returns null when the asset is absent in GCS", async () => {
    const objectName = "video-previews/absent";
    const notFound = Object.assign(new Error("No such object"), { code: 404 });
    const file = createFile(objectName, {
      exists: vi.fn().mockResolvedValue([false]),
      getMetadata: vi.fn().mockRejectedValue(notFound),
      getSignedUrl: vi
        .fn()
        .mockResolvedValue(["https://signed.example.com/absent"]),
    });
    mocks.files.set(objectName, file);

    const store = new GcsVideoAssetStore({
      bucket: mocks.bucket as never,
      minter: new SignedUrlMinter(mocks.bucket as never),
      basePath: "video-previews",
      signedUrlTtlMs: 60_000,
      cacheControl: "public, max-age=86400",
    });

    expect(await store.getPublicUrl("absent")).toBeNull();
    expect(file.getSignedUrl).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "Video asset missing in GCS",
      {
        assetId: "absent",
      },
    );
  });

  it("cleanupExpired deletes stale files and continues on delete errors", async () => {
    const oldFile = createFile("video-previews/old.mp4", {
      getMetadata: vi
        .fn()
        .mockResolvedValue([{ timeCreated: "2024-01-01T00:00:00.000Z" }]),
    });
    const freshFile = createFile("video-previews/fresh.mp4", {
      getMetadata: vi
        .fn()
        .mockResolvedValue([{ timeCreated: new Date().toISOString() }]),
    });
    const errorFile = createFile("video-previews/error.mp4", {
      getMetadata: vi
        .fn()
        .mockResolvedValue([{ timeCreated: "2024-01-01T00:00:00.000Z" }]),
      delete: vi.fn().mockRejectedValue(new Error("delete denied")),
    });

    mocks.bucket.getFiles.mockResolvedValue([[oldFile, freshFile, errorFile]]);

    const store = new GcsVideoAssetStore({
      bucket: mocks.bucket as never,
      minter: new SignedUrlMinter(mocks.bucket as never),
      basePath: "video-previews",
      signedUrlTtlMs: 60_000,
      cacheControl: "public, max-age=86400",
    });

    const deleted = await store.cleanupExpired(Date.now() - 60_000);

    expect(deleted).toBe(1);
    expect(oldFile.delete).toHaveBeenCalledTimes(1);
    expect(freshFile.delete).not.toHaveBeenCalled();
    expect(errorFile.delete).toHaveBeenCalledTimes(1);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "Failed to delete expired video asset",
      {
        fileName: "video-previews/error.mp4",
        error: "delete denied",
      },
    );
  });
});
