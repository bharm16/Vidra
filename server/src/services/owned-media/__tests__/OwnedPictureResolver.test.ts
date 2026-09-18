import { describe, it, expect, vi } from "vitest";
import {
  createOwnedPictureResolver,
  isOwnedPicturePath,
  type ImagePreviewAssetReader,
  type UserScopedMediaReader,
} from "../OwnedPictureResolver";

/**
 * The one owner-checked media resolver behind "Refine in the studio"
 * (ADR-0022 decision 4, issue #109).
 *
 * It spans both picture stores — the user-scoped store (`users/<uid>/…`) and
 * the production image-asset store (`image-previews/<owner>/…`) — and both
 * identifier kinds (a storage path, an asset basename). Ownership is proven the
 * same way in each: the path is anchored to the caller's own namespace, so a
 * handle can never address another creator's object. It never rewrites a stored
 * path to satisfy the check.
 */

function readers(overrides?: {
  imageAssets?: Partial<ImagePreviewAssetReader>;
  userStorage?: Partial<UserScopedMediaReader>;
}): {
  imageAssets: ImagePreviewAssetReader & {
    getPublicUrl: ReturnType<typeof vi.fn>;
  };
  userStorage: UserScopedMediaReader & {
    getViewUrl: ReturnType<typeof vi.fn>;
    getPreviewImageViewUrl: ReturnType<typeof vi.fn>;
  };
} {
  const imageAssets = {
    getPublicUrl:
      (overrides?.imageAssets?.getPublicUrl as ReturnType<typeof vi.fn>) ??
      vi.fn(
        async (assetId: string) =>
          `https://cdn.example.com/image-previews/${assetId}?sig`,
      ),
  };
  const userStorage = {
    getViewUrl:
      (overrides?.userStorage?.getViewUrl as ReturnType<typeof vi.fn>) ??
      vi.fn(async (_userId: string, path: string) => ({
        viewUrl: `https://cdn.example.com/${path}?sig`,
      })),
    getPreviewImageViewUrl:
      (overrides?.userStorage?.getPreviewImageViewUrl as ReturnType<
        typeof vi.fn
      >) ??
      vi.fn(
        async (userId: string, basename: string) =>
          `https://cdn.example.com/users/${userId}/previews/images/${basename}?sig`,
      ),
  };
  return { imageAssets, userStorage };
}

describe("OwnedPictureResolver", () => {
  it("signs a user-scoped path the caller owns", async () => {
    const { imageAssets, userStorage } = readers();
    const resolver = createOwnedPictureResolver({ imageAssets, userStorage });

    const resolved = await resolver.resolveOwnedPicture("user-1", {
      storagePath: "users/user-1/previews/images/take.webp",
    });

    expect(resolved).toEqual({
      storagePath: "users/user-1/previews/images/take.webp",
      viewUrl:
        "https://cdn.example.com/users/user-1/previews/images/take.webp?sig",
    });
    expect(userStorage.getViewUrl).toHaveBeenCalledWith(
      "user-1",
      "users/user-1/previews/images/take.webp",
    );
    // A user-scoped path never touches the image-asset store.
    expect(imageAssets.getPublicUrl).not.toHaveBeenCalled();
  });

  it("signs a production image-asset path through the image store, unchanged", async () => {
    const { imageAssets, userStorage } = readers();
    const resolver = createOwnedPictureResolver({ imageAssets, userStorage });

    const resolved = await resolver.resolveOwnedPicture("user-1", {
      storagePath: "image-previews/user-1/1f2e3d4c",
      assetId: "1f2e3d4c",
    });

    // The path is returned exactly as stored — never rewritten into `users/`.
    expect(resolved?.storagePath).toBe("image-previews/user-1/1f2e3d4c");
    // Signed by the store keyed on the asset id, which rebuilds the same
    // owner-scoped path from the caller's uid.
    expect(imageAssets.getPublicUrl).toHaveBeenCalledWith("1f2e3d4c", "user-1");
    expect(userStorage.getViewUrl).not.toHaveBeenCalled();
  });

  it("reconstructs a generated take's path from its asset basename", async () => {
    const { imageAssets, userStorage } = readers();
    const resolver = createOwnedPictureResolver({ imageAssets, userStorage });

    const resolved = await resolver.resolveOwnedPicture("user-1", {
      assetId: "1758100000000-abcdef01.webp",
    });

    expect(resolved).toEqual({
      storagePath: "users/user-1/previews/images/1758100000000-abcdef01.webp",
      viewUrl:
        "https://cdn.example.com/users/user-1/previews/images/1758100000000-abcdef01.webp?sig",
    });
    expect(userStorage.getPreviewImageViewUrl).toHaveBeenCalledWith(
      "user-1",
      "1758100000000-abcdef01.webp",
    );
  });

  it("prefers the storage path over the asset id when both are present", async () => {
    const { imageAssets, userStorage } = readers();
    const resolver = createOwnedPictureResolver({ imageAssets, userStorage });

    await resolver.resolveOwnedPicture("user-1", {
      storagePath: "image-previews/user-1/abc",
      assetId: "abc",
    });

    // The explicit path is authoritative; the asset-id reconstruction branch is
    // never entered.
    expect(userStorage.getPreviewImageViewUrl).not.toHaveBeenCalled();
    expect(imageAssets.getPublicUrl).toHaveBeenCalledWith("abc", "user-1");
  });

  it("refuses a user-scoped path anchored to another creator, minting nothing", async () => {
    const { imageAssets, userStorage } = readers();
    const resolver = createOwnedPictureResolver({ imageAssets, userStorage });

    const resolved = await resolver.resolveOwnedPicture("user-1", {
      storagePath: "users/someone-else/previews/images/take.webp",
    });

    expect(resolved).toBeNull();
    expect(userStorage.getViewUrl).not.toHaveBeenCalled();
    expect(imageAssets.getPublicUrl).not.toHaveBeenCalled();
  });

  it("refuses an image-asset path whose owner segment is another creator's", async () => {
    const { imageAssets, userStorage } = readers();
    const resolver = createOwnedPictureResolver({ imageAssets, userStorage });

    const resolved = await resolver.resolveOwnedPicture("user-1", {
      storagePath: "image-previews/someone-else/1f2e3d4c",
      assetId: "1f2e3d4c",
    });

    expect(resolved).toBeNull();
    // The pure ownership check refuses it before any signing is attempted.
    expect(imageAssets.getPublicUrl).not.toHaveBeenCalled();
  });

  it("returns null when the image-asset object is absent", async () => {
    const { imageAssets, userStorage } = readers({
      imageAssets: { getPublicUrl: vi.fn(async () => null) },
    });
    const resolver = createOwnedPictureResolver({ imageAssets, userStorage });

    const resolved = await resolver.resolveOwnedPicture("user-1", {
      storagePath: "image-previews/user-1/gone",
      assetId: "gone",
    });

    expect(resolved).toBeNull();
  });

  it("returns null when a generated take's object is absent", async () => {
    const { imageAssets, userStorage } = readers({
      userStorage: { getPreviewImageViewUrl: vi.fn(async () => null) },
    });
    const resolver = createOwnedPictureResolver({ imageAssets, userStorage });

    const resolved = await resolver.resolveOwnedPicture("user-1", {
      assetId: "missing.webp",
    });

    expect(resolved).toBeNull();
  });

  it("returns null for an empty handle", async () => {
    const { imageAssets, userStorage } = readers();
    const resolver = createOwnedPictureResolver({ imageAssets, userStorage });

    expect(await resolver.resolveOwnedPicture("user-1", {})).toBeNull();
  });
});

describe("isOwnedPicturePath", () => {
  it("accepts a user-scoped path anchored to the creator", () => {
    expect(
      isOwnedPicturePath("user-1", "users/user-1/previews/images/x.webp"),
    ).toBe(true);
  });

  it("rejects a user-scoped path anchored to another creator", () => {
    // A prefix that merely contains the uid is not the uid — the check is
    // anchored, not a substring.
    expect(
      isOwnedPicturePath("user-1", "users/xuser-1y/previews/images/x.webp"),
    ).toBe(false);
  });

  it("accepts an image-asset path whose owner segment is the creator's", () => {
    expect(isOwnedPicturePath("user-1", "image-previews/user-1/1f2e3d4c")).toBe(
      true,
    );
  });

  it("rejects an image-asset path whose owner segment is another creator's", () => {
    expect(
      isOwnedPicturePath("user-1", "image-previews/someone-else/1f2e3d4c"),
    ).toBe(false);
  });

  it("compares the image-asset owner segment against the normalized uid", () => {
    // The image store normalizes the owner into the path; the check must
    // normalize the same way, or a legitimate owner would be refused.
    expect(isOwnedPicturePath("a/b", "image-previews/a_b/asset")).toBe(true);
  });
});
