import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SignedUrlMinter } from "@infrastructure/signedUrl/SignedUrlMinter";
import { SIGNED_URL_TTL_MS } from "@config/signedUrlPolicy";
import { ownerSegment } from "@services/owned-media";
import { GcsImageAssetStore } from "@services/image-generation/storage/GcsImageAssetStore";
import { LocalImageAssetStore } from "@services/image-generation/storage/LocalImageAssetStore";
import type {
  ImageAssetStore,
  StoredImageAsset,
} from "@services/image-generation/storage";
import { StorageService } from "@services/storage/StorageService";
import { STORAGE_TYPES } from "@services/storage/config/storageConfig";
import {
  contentAddressedObjectId,
  InMemoryImageAssetStore,
  InMemoryObjectStore,
  InMemoryStorageService,
} from "./helpers/cross-mode/boundaryDoubles";
import {
  asBucket,
  ControlledBucket,
  controlledStorage,
} from "./helpers/storage-conformance/controlledBucket";
import {
  assertMintsDistinctObjects,
  runStorageAdapterConformance,
  type ConformanceOps,
} from "./helpers/storage-conformance/conformanceContract";

/**
 * Storage-adapter conformance suite (issue #138).
 *
 * ONE conformance contract (`runStorageAdapterConformance`) run against every
 * image-store and storage implementation: the PRODUCTION adapters
 * (`GcsImageAssetStore` and `StorageService`, driven against a controlled
 * in-memory GCS bucket, plus `LocalImageAssetStore` on a real temp directory)
 * and the cross-mode DOUBLES (`InMemoryImageAssetStore`, `InMemoryStorageService`).
 *
 * ## Why a controlled bucket, not the emulator
 *
 * The ticket permits "the emulator OR a controlled bucket". CI's
 * `integration-firestore` job — which runs this file via `npm run test:integration`
 * — starts only the Firestore emulator; there is no Cloud Storage emulator in
 * that job. So the production adapters run against `ControlledBucket`, a
 * stateful stand-in that sits exactly where GCS sits while the adapters' own id
 * minting, path building, precondition writes and signed-URL expiry all run
 * their real code. This is not a mock of the adapter — only the process-external
 * bucket is controlled.
 *
 * ## The mutation check
 *
 * The last block deliberately breaks a double — a content-addressed image store
 * that deduplicates identical bytes, exactly the pre-#138 bug — and confirms the
 * suite's identity assertion turns red. A double can never be quietly more
 * deduplicating than production without this suite catching it.
 */

const IMAGE_BASE_PATH = "image-previews";

/**
 * The `ImageAssetStore` family adapter: `GcsImageAssetStore`,
 * `LocalImageAssetStore` and `InMemoryImageAssetStore` all satisfy the same
 * interface, so one binding drives all three.
 */
function imageAssetStoreOps(store: ImageAssetStore): ConformanceOps {
  return {
    async store(bytes, owner) {
      const asset: StoredImageAsset = await store.storeFromBuffer(
        bytes,
        "image/webp",
        owner,
      );
      return {
        id: asset.id,
        storagePath: asset.storagePath,
        url: asset.url,
        ...(asset.expiresAt !== undefined
          ? { expiresAtMs: asset.expiresAt }
          : {}),
      };
    },
    resolveOwn: (handle, owner) => store.getPublicUrl(handle.id, owner),
    resolveCrossOwner: (handle, otherOwner) =>
      store.getPublicUrl(handle.id, otherOwner),
    resolveAbsent: (owner) =>
      store.getPublicUrl("nonexistent-conformance-asset", owner),
  };
}

/** The last path segment — the object's basename / id. */
function lastSegment(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/**
 * The `StorageService` production facade, driven through its buffer intake and
 * owner-checked reads. `getViewUrl` throws on a cross-owner path (Forbidden);
 * `getPreviewImageViewUrl` answers null for a never-stored basename.
 */
function storageServiceOps(service: StorageService): ConformanceOps {
  return {
    async store(bytes, owner) {
      const result = await service.uploadBuffer(
        owner,
        STORAGE_TYPES.PREVIEW_IMAGE,
        bytes,
        "image/png",
        {},
      );
      return {
        id: lastSegment(result.storagePath),
        storagePath: result.storagePath,
        url: result.viewUrl,
        expiresAtMs: Date.parse(result.expiresAt),
      };
    },
    async resolveOwn(handle, owner) {
      return (await service.getViewUrl(owner, handle.storagePath)).viewUrl;
    },
    async resolveCrossOwner(handle, otherOwner) {
      return (await service.getViewUrl(otherOwner, handle.storagePath)).viewUrl;
    },
    resolveAbsent: (owner) =>
      service.getPreviewImageViewUrl(owner, "0-nonexistentconformance.webp"),
  };
}

/**
 * The `InMemoryStorageService` double stores buffers through its `saveFromUrl`
 * data-URI intake — the same door the cross-mode studio copy uses. It has no
 * presence-checking read (the walkthrough never asks it for one), so it does
 * not support the absent probe.
 */
function inMemoryStorageServiceOps(
  service: InMemoryStorageService,
): ConformanceOps {
  return {
    async store(bytes, owner) {
      const dataUri = `data:image/png;base64,${bytes.toString("base64")}`;
      const result = await service.saveFromUrl(
        owner,
        dataUri,
        STORAGE_TYPES.PREVIEW_IMAGE,
        {},
      );
      return {
        id: lastSegment(result.storagePath),
        storagePath: result.storagePath,
        url: result.viewUrl,
        expiresAtMs: Date.parse(result.expiresAt),
      };
    },
    async resolveOwn(handle, owner) {
      return (await service.getViewUrl(owner, handle.storagePath)).viewUrl;
    },
    async resolveCrossOwner(handle, otherOwner) {
      return (await service.getViewUrl(otherOwner, handle.storagePath)).viewUrl;
    },
  };
}

/**
 * The pre-#138 bug, reincarnated for the mutation check: a content-addressed
 * image store that returns the SAME object for identical bytes. Production never
 * does this — it mints a fresh id per store — so the conformance identity axis
 * must turn red on it.
 */
class ContentAddressedImageAssetStore implements ImageAssetStore {
  private readonly objects = new InMemoryObjectStore();

  private objectPath(userId: string, assetId: string): string {
    return `${IMAGE_BASE_PATH}/${ownerSegment(userId)}/${assetId}`;
  }

  storeFromBuffer(
    buffer: Buffer,
    contentType: string,
    userId: string,
  ): Promise<StoredImageAsset> {
    const id = createHash("sha256")
      .update(userId)
      .update(buffer)
      .digest("hex")
      .slice(0, 24);
    const storagePath = this.objectPath(userId, id);
    this.objects.put(storagePath, { buffer, contentType });
    return Promise.resolve({
      id,
      storagePath,
      url: this.objects.urlFor(storagePath),
      contentType,
      createdAt: Date.now(),
      sizeBytes: buffer.byteLength,
      expiresAt: Date.now() + SIGNED_URL_TTL_MS.view,
    });
  }

  storeFromUrl(): Promise<StoredImageAsset> {
    return Promise.reject(new Error("not used by the mutation check"));
  }

  getPublicUrl(assetId: string, userId: string): Promise<string | null> {
    const storagePath = this.objectPath(userId, assetId);
    return Promise.resolve(
      this.objects.get(storagePath) ? this.objects.urlFor(storagePath) : null,
    );
  }

  exists(assetId: string, userId: string): Promise<boolean> {
    return Promise.resolve(
      this.objects.get(this.objectPath(userId, assetId)) !== undefined,
    );
  }

  cleanupExpired(): Promise<number> {
    return Promise.resolve(0);
  }
}

describe("Storage adapter conformance (integration)", () => {
  runStorageAdapterConformance({
    name: "GcsImageAssetStore (production, controlled bucket)",
    urlsExpire: true,
    crossOwnerRefusal: "null",
    supportsAbsentProbe: true,
    refusesBlankOwner: true,
    namespacePrefix: (owner) => `${IMAGE_BASE_PATH}/${ownerSegment(owner)}/`,
    make: () => {
      const bucket = new ControlledBucket();
      const store = new GcsImageAssetStore({
        bucket: asBucket(bucket),
        minter: new SignedUrlMinter(asBucket(bucket)),
        basePath: IMAGE_BASE_PATH,
        signedUrlTtlMs: SIGNED_URL_TTL_MS.view,
        cacheControl: "public, max-age=86400",
      });
      return Promise.resolve(imageAssetStoreOps(store));
    },
  });

  runStorageAdapterConformance({
    name: "LocalImageAssetStore (production, temp filesystem)",
    urlsExpire: false,
    crossOwnerRefusal: "null",
    supportsAbsentProbe: true,
    refusesBlankOwner: true,
    namespacePrefix: (owner) => `${ownerSegment(owner)}/`,
    make: async () => {
      const directory = await mkdtemp(join(tmpdir(), "conformance-local-"));
      const store = new LocalImageAssetStore({
        directory,
        publicPath: "https://cdn.conformance.invalid/media",
      });
      return {
        ...imageAssetStoreOps(store),
        teardown: () => rm(directory, { recursive: true, force: true }),
      };
    },
  });

  runStorageAdapterConformance({
    name: "InMemoryImageAssetStore (cross-mode double)",
    urlsExpire: true,
    crossOwnerRefusal: "null",
    supportsAbsentProbe: true,
    refusesBlankOwner: true,
    namespacePrefix: (owner) => `${IMAGE_BASE_PATH}/${ownerSegment(owner)}/`,
    make: () =>
      Promise.resolve(
        imageAssetStoreOps(
          new InMemoryImageAssetStore(new InMemoryObjectStore()),
        ),
      ),
  });

  runStorageAdapterConformance({
    name: "StorageService (production, controlled bucket)",
    urlsExpire: true,
    crossOwnerRefusal: "throws",
    supportsAbsentProbe: true,
    // `StorageService.uploadBuffer` does not guard a blank owner — the route's
    // auth does — so, unlike the image-asset family, it is not asserted here.
    refusesBlankOwner: false,
    namespacePrefix: (owner) => `users/${owner}/`,
    make: () => {
      const bucket = new ControlledBucket();
      const service = new StorageService({
        storage: controlledStorage(bucket),
        bucketName: bucket.name,
        signedUrlLedger: null,
      });
      return Promise.resolve(storageServiceOps(service));
    },
  });

  runStorageAdapterConformance({
    name: "InMemoryStorageService (cross-mode double)",
    urlsExpire: true,
    crossOwnerRefusal: "throws",
    // No presence-checking read: the cross-mode walkthrough never asks the
    // double to resolve a missing object, so adding one would be a rule of its
    // own. Its production twin's honest-404 is covered by the StorageService run.
    supportsAbsentProbe: false,
    refusesBlankOwner: false,
    namespacePrefix: (owner) => `users/${owner}/`,
    make: () =>
      Promise.resolve(
        inMemoryStorageServiceOps(
          new InMemoryStorageService(new InMemoryObjectStore()),
        ),
      ),
  });

  describe("mutation check: a deduplicating double fails the identity axis", () => {
    it("catches a content-addressed image store that production would never be", async () => {
      const ops = imageAssetStoreOps(new ContentAddressedImageAssetStore());
      // The exact assertion every subject above passes, here expected to turn
      // red: a re-store of identical bytes returns the same object.
      await expect(
        assertMintsDistinctObjects(ops, "content-addressed image double"),
      ).rejects.toThrow();
    });

    it("catches the storage double if its cross-mode determinism id became the default", async () => {
      // `contentAddressedObjectId` is what the cross-mode harness injects for
      // cassette reproducibility. If it were the DEFAULT (as production is not),
      // the double would deduplicate — and the identity axis must catch it.
      const ops = inMemoryStorageServiceOps(
        new InMemoryStorageService(
          new InMemoryObjectStore(),
          contentAddressedObjectId,
        ),
      );
      await expect(
        assertMintsDistinctObjects(ops, "content-addressed storage double"),
      ).rejects.toThrow();
    });
  });
});
