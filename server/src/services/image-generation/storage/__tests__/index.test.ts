import { describe, it, expect, vi } from "vitest";
import { SignedUrlMinter } from "@infrastructure/signedUrl/SignedUrlMinter";
import * as storageTypesModule from "../types";

const gcsCtor = vi.fn();

vi.mock("../GcsImageAssetStore", () => ({
  GcsImageAssetStore: vi.fn((options) => {
    gcsCtor(options);
    return { __options: options };
  }),
}));

describe("createImageAssetStore", () => {
  it("keeps storage types as a type-only module at runtime", () => {
    expect(Object.keys(storageTypesModule)).toHaveLength(0);
  });

  it("uses defaults with an injected bucket", async () => {
    const bucket = { file: vi.fn() } as never;
    const minter = new SignedUrlMinter(bucket);
    const { createImageAssetStore } = await import("../index");

    const result = createImageAssetStore({ bucket, minter });

    expect(result).toEqual({ __options: expect.any(Object) });
    expect(gcsCtor).toHaveBeenCalledWith({
      bucket,
      minter,
      basePath: "image-previews",
      signedUrlTtlMs: 3_600_000,
      cacheControl: "public, max-age=86400",
    });
  });

  it("respects explicit overrides", async () => {
    const bucket = { file: vi.fn() } as never;
    const minter = new SignedUrlMinter(bucket);
    const { createImageAssetStore } = await import("../index");

    createImageAssetStore({
      bucket,
      minter,
      basePath: "custom-path",
      signedUrlTtlMs: 120_000,
      cacheControl: "public, max-age=120",
    });

    expect(gcsCtor).toHaveBeenCalledWith({
      bucket,
      minter,
      basePath: "custom-path",
      signedUrlTtlMs: 120_000,
      cacheControl: "public, max-age=120",
    });
  });
});
