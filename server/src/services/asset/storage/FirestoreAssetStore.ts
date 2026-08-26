import { v4 as uuidv4 } from "uuid";
import type { Bucket } from "@google-cloud/storage";
import { admin, getFirestore } from "@infrastructure/firebaseAdmin";
import { logger } from "@infrastructure/Logger";
import type {
  Asset,
  AssetReferenceImage,
  AssetType,
} from "@shared/types/asset";
import { parseGcsObjectUrl } from "@shared/utils/gcsObjectUrl";
import type {
  AssetStorePort,
  BulkUsageRecord,
  CreateAssetInput,
  CreateUsageRecordInput,
  GetAllAssetsOptions,
  GetByTypeResult,
  ProcessedImageInput,
  ReferenceImageMetadataInput,
} from "../ports/AssetStorePort";

interface FirestoreAssetStoreOptions {
  db?: FirebaseFirestore.Firestore;
  bucket: Bucket;
  bucketName?: string;
}

const MAX_IN_QUERY = 10;
const MAX_BATCH_WRITES = 500;

function buildDownloadUrl(
  bucketName: string,
  storagePath: string,
  token: string,
): string {
  const encodedPath = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;
}

function extractTokenFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("token");
  } catch {
    return null;
  }
}

function extractBucketFromUrl(url: string): string | null {
  // Delegate to the shared GCS URL parser (as the sibling storage/pathUtils
  // already does) rather than re-deriving the bucket with a local regex.
  return parseGcsObjectUrl(url)?.bucket ?? null;
}

function isValidFirebaseStorageUrl(url: string): boolean {
  const bucket = extractBucketFromUrl(url);
  const token = extractTokenFromUrl(url);
  return bucket !== null && token !== null;
}

function refreshImageUrls(
  image: AssetReferenceImage,
  bucketName: string,
): AssetReferenceImage {
  if (!image.storagePath) {
    return image;
  }

  // Preserve URLs that already point to a valid Firebase Storage bucket
  // (even a different bucket than the current one) — files may legitimately
  // live in their original bucket.
  if (isValidFirebaseStorageUrl(image.url)) {
    return image;
  }

  const imageToken = extractTokenFromUrl(image.url);
  const thumbToken = image.thumbnailUrl
    ? extractTokenFromUrl(image.thumbnailUrl)
    : null;

  if (!imageToken) {
    return image;
  }

  return {
    ...image,
    url: buildDownloadUrl(bucketName, image.storagePath, imageToken),
    thumbnailUrl:
      image.thumbnailPath && thumbToken
        ? buildDownloadUrl(bucketName, image.thumbnailPath, thumbToken)
        : image.thumbnailUrl,
  };
}

function refreshAssetUrls(asset: Asset, bucketName: string): Asset {
  if (!asset.referenceImages?.length) {
    return asset;
  }

  return {
    ...asset,
    referenceImages: asset.referenceImages.map((img) =>
      refreshImageUrls(img, bucketName),
    ),
  };
}

/**
 * Firestore + GCS implementation of `AssetStorePort`.
 *
 * Single concrete adapter for asset persistence. Bundles three concerns
 * (asset CRUD, reference-image-on-asset management, usage tracking) which
 * could be split into segregated stores in a follow-up.
 */
export class FirestoreAssetStore implements AssetStorePort {
  private readonly db: FirebaseFirestore.Firestore;
  private readonly bucket: Bucket;
  private readonly bucketName: string;
  private readonly log = logger.child({ service: "FirestoreAssetStore" });

  constructor(options: FirestoreAssetStoreOptions) {
    if (!options.bucket) {
      throw new Error(
        "FirestoreAssetStore requires an injected storage bucket",
      );
    }
    this.db = options.db || getFirestore();
    this.bucket = options.bucket;
    this.bucketName = options.bucketName || options.bucket.name;
  }

  private getAssetsCollection(
    userId: string,
  ): FirebaseFirestore.CollectionReference {
    return this.db.collection("users").doc(userId).collection("assets");
  }

  private getAssetDoc(
    userId: string,
    assetId: string,
  ): FirebaseFirestore.DocumentReference {
    return this.getAssetsCollection(userId).doc(assetId);
  }

  private getUsageCollection(
    userId: string,
  ): FirebaseFirestore.CollectionReference {
    return this.db.collection("users").doc(userId).collection("assetUsage");
  }

  async create(userId: string, assetData: CreateAssetInput): Promise<Asset> {
    const operation = "create";
    const startTime = performance.now();
    this.log.debug("Starting operation.", {
      operation,
      userId,
      type: assetData.type,
      triggerLength: assetData.trigger.length,
      nameLength: assetData.name.length,
    });

    const assetId = `asset_${uuidv4().replace(/-/g, "").slice(0, 12)}`;
    const now = new Date().toISOString();

    const asset: Asset = {
      id: assetId,
      userId,
      type: assetData.type,
      trigger: assetData.trigger.toLowerCase(),
      name: assetData.name,
      textDefinition: assetData.textDefinition || "",
      negativePrompt: assetData.negativePrompt || "",
      referenceImages: [],
      faceEmbedding: null,
      usageCount: 0,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.getAssetDoc(userId, assetId).set(asset);
      this.log.info("Operation completed.", {
        operation,
        userId,
        assetId,
        type: asset.type,
        duration: Math.round(performance.now() - startTime),
      });
      return asset;
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      this.log.error("Operation failed.", errorObj, {
        operation,
        userId,
        assetId,
        duration: Math.round(performance.now() - startTime),
      });
      throw error;
    }
  }

  async getById(userId: string, assetId: string): Promise<Asset | null> {
    const snapshot = await this.getAssetDoc(userId, assetId).get();
    if (!snapshot.exists) {
      return null;
    }
    const asset = snapshot.data() as Asset;
    return refreshAssetUrls(asset, this.bucketName);
  }

  async getByTrigger(userId: string, trigger: string): Promise<Asset | null> {
    const normalized = trigger.toLowerCase();
    const snapshot = await this.getAssetsCollection(userId)
      .where("trigger", "==", normalized)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    const asset = snapshot.docs[0]?.data() as Asset | undefined;
    return asset ? refreshAssetUrls(asset, this.bucketName) : null;
  }

  async getByTriggers(userId: string, triggers: string[]): Promise<Asset[]> {
    if (!triggers.length) return [];

    const normalizedTriggers = triggers.map((t) => t.toLowerCase());
    const batches: string[][] = [];
    for (let i = 0; i < normalizedTriggers.length; i += MAX_IN_QUERY) {
      batches.push(normalizedTriggers.slice(i, i + MAX_IN_QUERY));
    }

    const batchResults = await Promise.all(
      batches.map((batch) =>
        this.getAssetsCollection(userId).where("trigger", "in", batch).get(),
      ),
    );

    const results: Asset[] = [];
    for (const snapshot of batchResults) {
      results.push(
        ...snapshot.docs.map((doc) =>
          refreshAssetUrls(doc.data() as Asset, this.bucketName),
        ),
      );
    }

    return results;
  }

  async getByTriggerPrefix(
    userId: string,
    prefix: string,
    limit: number,
  ): Promise<Asset[]> {
    if (!prefix) return [];

    const cappedLimit = Math.min(limit, 50);

    const snapshot = await this.getAssetsCollection(userId)
      .where("trigger", ">=", prefix)
      .where("trigger", "<", prefix + "\uf8ff")
      .limit(cappedLimit)
      .get();

    return snapshot.docs.map((doc) =>
      refreshAssetUrls(doc.data() as Asset, this.bucketName),
    );
  }

  async getAll(
    userId: string,
    options: GetAllAssetsOptions = {},
  ): Promise<Asset[]> {
    const {
      limit: maxResults = 100,
      orderByField = "updatedAt",
      type = null,
    } = options;

    let query = this.getAssetsCollection(userId)
      .orderBy(orderByField, "desc")
      .limit(maxResults);

    if (type) {
      query = this.getAssetsCollection(userId)
        .where("type", "==", type)
        .orderBy(orderByField, "desc")
        .limit(maxResults);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) =>
      refreshAssetUrls(doc.data() as Asset, this.bucketName),
    );
  }

  async getByType(
    userId: string,
    type: AssetType,
    limit: number = 200,
  ): Promise<GetByTypeResult> {
    const snapshot = await this.getAssetsCollection(userId)
      .where("type", "==", type)
      .orderBy("updatedAt", "desc")
      .limit(limit + 1)
      .get();
    const allItems = snapshot.docs.map((doc) =>
      refreshAssetUrls(doc.data() as Asset, this.bucketName),
    );
    const hasMore = allItems.length > limit;
    const items = hasMore ? allItems.slice(0, limit) : allItems;
    return { items, hasMore };
  }

  async update(
    userId: string,
    assetId: string,
    updates: Partial<Asset>,
  ): Promise<Asset | null> {
    const operation = "update";
    const startTime = performance.now();
    this.log.debug("Starting operation.", {
      operation,
      userId,
      assetId,
      updateKeys: Object.keys(updates),
    });

    const updateData: Partial<Asset> & { updatedAt: string } = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    delete updateData.id;
    delete updateData.userId;
    delete updateData.type;
    delete updateData.createdAt;

    try {
      await this.getAssetDoc(userId, assetId).update(updateData);
      const updated = await this.getById(userId, assetId);
      this.log.debug("Operation completed.", {
        operation,
        userId,
        assetId,
        duration: Math.round(performance.now() - startTime),
      });
      return updated;
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      this.log.error("Operation failed.", errorObj, {
        operation,
        userId,
        assetId,
        duration: Math.round(performance.now() - startTime),
      });
      throw error;
    }
  }

  async incrementUsage(userId: string, assetId: string): Promise<void> {
    const operation = "incrementUsage";
    const startTime = performance.now();
    const now = new Date().toISOString();
    try {
      await this.getAssetDoc(userId, assetId).update({
        usageCount: admin.firestore.FieldValue.increment(1),
        lastUsedAt: now,
        updatedAt: now,
      });
      this.log.debug("Operation completed.", {
        operation,
        userId,
        assetId,
        duration: Math.round(performance.now() - startTime),
      });
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      this.log.error("Operation failed.", errorObj, {
        operation,
        userId,
        assetId,
        duration: Math.round(performance.now() - startTime),
      });
      throw error;
    }
  }

  async delete(userId: string, assetId: string): Promise<boolean> {
    const operation = "delete";
    const startTime = performance.now();
    this.log.debug("Starting operation.", { operation, userId, assetId });

    try {
      const asset = await this.getById(userId, assetId);
      if (asset?.referenceImages?.length) {
        for (const image of asset.referenceImages) {
          await this.deleteReferenceImage(userId, assetId, image.id);
        }
      }

      await this.getAssetDoc(userId, assetId).delete();
      this.log.info("Operation completed.", {
        operation,
        userId,
        assetId,
        duration: Math.round(performance.now() - startTime),
      });
      return true;
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      this.log.error("Operation failed.", errorObj, {
        operation,
        userId,
        assetId,
        duration: Math.round(performance.now() - startTime),
      });
      throw error;
    }
  }

  async addReferenceImage(
    userId: string,
    assetId: string,
    image: ProcessedImageInput,
    thumbnail: ProcessedImageInput,
    metadata: ReferenceImageMetadataInput,
  ): Promise<AssetReferenceImage> {
    const operation = "addReferenceImage";
    const startTime = performance.now();
    this.log.debug("Starting operation.", {
      operation,
      userId,
      assetId,
      imageSize: image.sizeBytes,
      thumbnailSize: thumbnail.sizeBytes,
    });

    const imageId = `img_${uuidv4().replace(/-/g, "").slice(0, 8)}`;
    const storagePath = `users/${userId}/assets/${assetId}/${imageId}.jpg`;
    const thumbnailPath = `users/${userId}/assets/${assetId}/${imageId}_thumb.jpg`;

    const imageToken = uuidv4();
    const thumbnailToken = uuidv4();

    try {
      await this.bucket.file(storagePath).save(image.buffer, {
        resumable: false,
        contentType: "image/jpeg",
        metadata: {
          cacheControl: "public, max-age=31536000",
          metadata: {
            firebaseStorageDownloadTokens: imageToken,
          },
        },
        preconditionOpts: { ifGenerationMatch: 0 },
      });

      try {
        await this.bucket.file(thumbnailPath).save(thumbnail.buffer, {
          resumable: false,
          contentType: "image/jpeg",
          metadata: {
            cacheControl: "public, max-age=31536000",
            metadata: {
              firebaseStorageDownloadTokens: thumbnailToken,
            },
          },
          preconditionOpts: { ifGenerationMatch: 0 },
        });
      } catch (thumbnailError) {
        await this.bucket
          .file(storagePath)
          .delete()
          .catch(() => undefined);
        throw thumbnailError;
      }

      const referenceImage: AssetReferenceImage = {
        id: imageId,
        url: buildDownloadUrl(this.bucketName, storagePath, imageToken),
        thumbnailUrl: buildDownloadUrl(
          this.bucketName,
          thumbnailPath,
          thumbnailToken,
        ),
        isPrimary: false,
        storagePath,
        thumbnailPath,
        metadata: {
          angle: metadata.angle ?? null,
          expression: metadata.expression ?? null,
          styleType: metadata.styleType ?? null,
          timeOfDay: metadata.timeOfDay ?? null,
          lighting: metadata.lighting ?? null,
          uploadedAt: new Date().toISOString(),
          width: metadata.width ?? image.width,
          height: metadata.height ?? image.height,
          sizeBytes: image.sizeBytes ?? image.buffer.length,
        },
      };

      const asset = await this.getById(userId, assetId);
      const referenceImages = [
        ...(asset?.referenceImages || []),
        referenceImage,
      ];

      if (referenceImages.length === 1) {
        referenceImages[0] = {
          ...referenceImages[0],
          isPrimary: true,
        } as AssetReferenceImage;
      }

      await this.update(userId, assetId, { referenceImages });
      this.log.info("Operation completed.", {
        operation,
        userId,
        assetId,
        imageId,
        duration: Math.round(performance.now() - startTime),
      });
      return referenceImage;
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      this.log.error("Operation failed.", errorObj, {
        operation,
        userId,
        assetId,
        duration: Math.round(performance.now() - startTime),
      });
      throw error;
    }
  }

  async deleteReferenceImage(
    userId: string,
    assetId: string,
    imageId: string,
  ): Promise<boolean> {
    const operation = "deleteReferenceImage";
    const startTime = performance.now();
    this.log.debug("Starting operation.", {
      operation,
      userId,
      assetId,
      imageId,
    });

    try {
      const asset = await this.getById(userId, assetId);
      if (!asset?.referenceImages?.length) return false;

      const image = asset.referenceImages.find((img) => img.id === imageId);
      if (!image) return false;

      const storageTargets = [
        image.storagePath ? { path: image.storagePath } : null,
        image.thumbnailPath ? { path: image.thumbnailPath } : null,
      ].filter((value): value is { path: string } => Boolean(value));

      for (const target of storageTargets) {
        try {
          await this.bucket.file(target.path).delete();
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.log.warn("Failed to delete asset image from storage", {
            operation,
            assetId,
            imageId,
            path: target.path,
            bucket: this.bucketName,
            error: errorMessage,
          });
        }
      }

      const referenceImages = asset.referenceImages.filter(
        (img) => img.id !== imageId,
      );
      if (image.isPrimary && referenceImages.length > 0) {
        referenceImages[0] = {
          ...referenceImages[0],
          isPrimary: true,
        } as AssetReferenceImage;
      }

      await this.update(userId, assetId, { referenceImages });
      this.log.info("Operation completed.", {
        operation,
        userId,
        assetId,
        imageId,
        duration: Math.round(performance.now() - startTime),
      });
      return true;
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      this.log.error("Operation failed.", errorObj, {
        operation,
        userId,
        assetId,
        imageId,
        duration: Math.round(performance.now() - startTime),
      });
      throw error;
    }
  }

  async setPrimaryImage(
    userId: string,
    assetId: string,
    imageId: string,
  ): Promise<Asset | null> {
    const operation = "setPrimaryImage";
    const startTime = performance.now();
    this.log.debug("Starting operation.", {
      operation,
      userId,
      assetId,
      imageId,
    });

    try {
      const asset = await this.getById(userId, assetId);
      if (!asset?.referenceImages?.length) return null;

      const referenceImages = asset.referenceImages.map((img) => ({
        ...img,
        isPrimary: img.id === imageId,
      }));

      await this.update(userId, assetId, { referenceImages });
      const updated = await this.getById(userId, assetId);
      this.log.info("Operation completed.", {
        operation,
        userId,
        assetId,
        imageId,
        duration: Math.round(performance.now() - startTime),
      });
      return updated;
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      this.log.error("Operation failed.", errorObj, {
        operation,
        userId,
        assetId,
        imageId,
        duration: Math.round(performance.now() - startTime),
      });
      throw error;
    }
  }

  async triggerExists(
    userId: string,
    trigger: string,
    excludeAssetId?: string | null,
  ): Promise<boolean> {
    const normalized = trigger.toLowerCase();
    const snapshot = await this.getAssetsCollection(userId)
      .where("trigger", "==", normalized)
      .limit(1)
      .get();
    if (snapshot.empty) return false;

    if (excludeAssetId) {
      return snapshot.docs[0]?.data()?.id !== excludeAssetId;
    }
    return true;
  }

  async createUsageRecord(
    userId: string,
    input: CreateUsageRecordInput,
  ): Promise<void> {
    const operation = "createUsageRecord";
    const startTime = performance.now();
    const usageId = `usage_${uuidv4().replace(/-/g, "").slice(0, 12)}`;
    try {
      await this.getUsageCollection(userId)
        .doc(usageId)
        .set({
          id: usageId,
          assetId: input.assetId,
          assetType: input.assetType,
          generationId: input.generationId || null,
          promptText: input.promptText || "",
          expandedText: input.expandedText || "",
          createdAt: new Date().toISOString(),
        });
      this.log.debug("Operation completed.", {
        operation,
        userId,
        assetId: input.assetId,
        duration: Math.round(performance.now() - startTime),
      });
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      this.log.error("Operation failed.", errorObj, {
        operation,
        userId,
        assetId: input.assetId,
        duration: Math.round(performance.now() - startTime),
      });
      throw error;
    }
  }

  async recordBulkUsage(
    userId: string,
    records: BulkUsageRecord[],
  ): Promise<void> {
    if (!records.length) return;

    const operation = "recordBulkUsage";
    const startTime = performance.now();
    this.log.debug("Starting operation.", {
      operation,
      userId,
      recordCount: records.length,
    });

    try {
      const now = new Date().toISOString();
      const usageCollection = this.getUsageCollection(userId);

      const chunks: Array<typeof records> = [];
      for (let i = 0; i < records.length; i += MAX_BATCH_WRITES) {
        chunks.push(records.slice(i, i + MAX_BATCH_WRITES));
      }

      for (const chunk of chunks) {
        const batch = this.db.batch();
        for (const record of chunk) {
          const usageId = `usage_${uuidv4().replace(/-/g, "").slice(0, 12)}`;
          const docRef = usageCollection.doc(usageId);
          batch.set(docRef, {
            id: usageId,
            assetId: record.assetId,
            assetType: record.assetType,
            promptHash: record.promptHash,
            promptLength: record.promptLength,
            expandedHash: record.expandedHash,
            expandedLength: record.expandedLength,
            createdAt: now,
          });
        }
        await batch.commit();
      }
      this.log.debug("Operation completed.", {
        operation,
        userId,
        recordCount: records.length,
        duration: Math.round(performance.now() - startTime),
      });
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      this.log.error("Operation failed.", errorObj, {
        operation,
        userId,
        recordCount: records.length,
        duration: Math.round(performance.now() - startTime),
      });
      throw error;
    }
  }
}

export default FirestoreAssetStore;
