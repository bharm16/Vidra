import { v4 as uuidv4 } from "uuid";
import type { Bucket } from "@google-cloud/storage";
import { getFirestore } from "@infrastructure/firebaseAdmin";
import { logger } from "@infrastructure/Logger";
import { ReferenceImageProcessingService } from "@services/asset/ReferenceImageProcessingService";
import { fetchRemoteMedia } from "@services/owned-media";
import type {
  CreateReferenceImageInput,
  ListReferenceImagesOptions,
  ReferenceImageRecord,
  ReferenceImageStorePort,
} from "../ports/ReferenceImageStorePort";

interface FirestoreReferenceImageStoreOptions {
  db?: FirebaseFirestore.Firestore;
  bucket: Bucket;
  bucketName?: string;
  processor?: ReferenceImageProcessingService;
  signedUrlLedger?: SignedUrlRecorder | null;
}

interface SignedUrlRecorder {
  record(objectPath: string, signedUrl: string): void;
}

interface StoredReferenceImageDocument {
  id: string;
  userId: string;
  storagePath: string;
  thumbnailPath: string;
  label: string | null;
  metadata: ReferenceImageRecord["metadata"];
  createdAt: string;
  updatedAt: string;
}

function getUrlHost(value: string): string | null {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

/**
 * Firestore + GCS implementation of `ReferenceImageStorePort`.
 *
 * Combines image processing (via injected `ReferenceImageProcessingService`),
 * GCS upload, and Firestore document write into a single domain operation.
 * The split between "processing" and "storage" is a known abstraction
 * boundary that could be tightened in a follow-up — for now the port matches
 * the public surface of the original `ReferenceImageRepository`.
 */
export class FirestoreReferenceImageStore implements ReferenceImageStorePort {
  private readonly db: FirebaseFirestore.Firestore;
  private readonly bucket: Bucket;
  private readonly bucketName: string;
  private readonly processor: ReferenceImageProcessingService;
  private readonly signedUrlLedger: SignedUrlRecorder | null;
  private readonly log = logger.child({
    service: "FirestoreReferenceImageStore",
  });

  constructor(options: FirestoreReferenceImageStoreOptions) {
    if (!options.bucket) {
      throw new Error(
        "FirestoreReferenceImageStore requires an injected storage bucket",
      );
    }
    this.db = options.db || getFirestore();
    this.bucket = options.bucket;
    this.bucketName = options.bucketName || options.bucket.name;
    this.processor = options.processor || new ReferenceImageProcessingService();
    this.signedUrlLedger = options.signedUrlLedger ?? null;
  }

  private collection(userId: string): FirebaseFirestore.CollectionReference {
    return this.db
      .collection("users")
      .doc(userId)
      .collection("referenceImages");
  }

  async listImages(
    userId: string,
    options: ListReferenceImagesOptions = {},
  ): Promise<ReferenceImageRecord[]> {
    const limit =
      typeof options.limit === "number" && Number.isFinite(options.limit)
        ? Math.max(1, Math.min(options.limit, 200))
        : 50;
    const snapshot = await this.collection(userId)
      .orderBy("updatedAt", "desc")
      .limit(limit)
      .get();

    return await Promise.all(
      snapshot.docs.map(async (doc) =>
        this.toPresentationRecord(
          { ...(doc.data() as StoredReferenceImageDocument), id: doc.id },
          userId,
        ),
      ),
    );
  }

  async createFromBuffer(
    userId: string,
    buffer: Buffer,
    input: CreateReferenceImageInput = {},
  ): Promise<ReferenceImageRecord> {
    const operation = "createFromBuffer";
    const startTime = performance.now();
    this.log.debug("Starting operation.", {
      operation,
      userId,
      bufferSize: buffer.length,
      hasLabel: Boolean(input.label),
      hasSource: Boolean(input.source),
      hasOriginalName: Boolean(input.originalName),
    });

    const imageId = `ref_${uuidv4().replace(/-/g, "").slice(0, 12)}`;
    const storagePath = `users/${userId}/reference-images/${imageId}.jpg`;
    const thumbnailPath = `users/${userId}/reference-images/${imageId}_thumb.jpg`;

    try {
      const processedImage = await this.processor.processImage(buffer);
      const thumbnail = await this.processor.generateThumbnail(
        processedImage.buffer,
      );

      await this.bucket.file(storagePath).save(processedImage.buffer, {
        resumable: false,
        contentType: "image/jpeg",
        metadata: {
          cacheControl: "public, max-age=31536000",
        },
        preconditionOpts: { ifGenerationMatch: 0 },
      });

      await this.bucket.file(thumbnailPath).save(thumbnail.buffer, {
        resumable: false,
        contentType: "image/jpeg",
        metadata: {
          cacheControl: "public, max-age=31536000",
        },
        preconditionOpts: { ifGenerationMatch: 0 },
      });

      const now = new Date().toISOString();
      const record: StoredReferenceImageDocument = {
        id: imageId,
        userId,
        storagePath,
        thumbnailPath,
        label: input.label ?? null,
        metadata: {
          width: processedImage.width,
          height: processedImage.height,
          sizeBytes: processedImage.sizeBytes,
          contentType: "image/jpeg",
          source: input.source ?? null,
          originalName: input.originalName ?? null,
        },
        createdAt: now,
        updatedAt: now,
      };

      await this.collection(userId).doc(imageId).set(record);

      this.log.info("Operation completed.", {
        operation,
        userId,
        duration: Math.round(performance.now() - startTime),
        imageId,
        storagePath,
        thumbnailPath,
        sizeBytes: processedImage.sizeBytes,
        width: processedImage.width,
        height: processedImage.height,
      });

      return await this.toPresentationRecord(record, userId);
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      this.log.error("Operation failed.", errorObj, {
        operation,
        userId,
        duration: Math.round(performance.now() - startTime),
      });
      throw error;
    }
  }

  async createFromUrl(
    userId: string,
    sourceUrl: string,
    input: CreateReferenceImageInput = {},
  ): Promise<ReferenceImageRecord> {
    const operation = "createFromUrl";
    const sourceHost = getUrlHost(sourceUrl);
    this.log.debug("Fetching reference image.", {
      operation,
      userId,
      ...(sourceHost ? { sourceHost } : {}),
    });

    const remoteMedia = await fetchRemoteMedia({
      sourceUrl,
      fieldName: "sourceUrl",
      allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
      maxBytes: 5 * 1024 * 1024,
    });
    return await this.createFromBuffer(userId, remoteMedia.buffer, {
      ...input,
      source: input.source ?? "url",
    });
  }

  async deleteImage(userId: string, imageId: string): Promise<boolean> {
    const operation = "deleteImage";
    const startTime = performance.now();
    this.log.debug("Starting operation.", { operation, userId, imageId });

    const docRef = this.collection(userId).doc(imageId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      this.log.info("Operation completed.", {
        operation,
        userId,
        imageId,
        duration: Math.round(performance.now() - startTime),
        deleted: false,
        reason: "not_found",
      });
      return false;
    }

    const data = snapshot.data() as StoredReferenceImageDocument | undefined;
    const paths = [data?.storagePath, data?.thumbnailPath].filter(
      (path): path is string => typeof path === "string" && path.length > 0,
    );

    let failedDeletes = 0;
    for (const path of paths) {
      try {
        await this.bucket.file(path).delete();
      } catch (error) {
        failedDeletes += 1;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.log.warn("Failed to delete reference image from storage", {
          operation,
          userId,
          imageId,
          path,
          error: errorMessage,
        });
      }
    }

    await docRef.delete();
    this.log.info("Operation completed.", {
      operation,
      userId,
      imageId,
      duration: Math.round(performance.now() - startTime),
      deleted: true,
      deletedPaths: paths.length - failedDeletes,
      failedDeletes,
    });
    return true;
  }

  private async toPresentationRecord(
    record: StoredReferenceImageDocument,
    userId: string,
  ): Promise<ReferenceImageRecord> {
    if (record.userId !== userId) {
      throw new Error("Reference image owner does not match its collection");
    }
    return {
      id: record.id,
      userId: record.userId,
      imageRef: record.id,
      thumbnailRef: `${record.id}:thumbnail`,
      imageUrl: await this.getPresentationUrl(record.storagePath),
      thumbnailUrl: await this.getPresentationUrl(record.thumbnailPath),
      label: record.label,
      metadata: record.metadata,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private async getPresentationUrl(storagePath: string): Promise<string> {
    const file = this.bucket.file(storagePath);
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 60 * 60 * 1000,
    });
    this.signedUrlLedger?.record(storagePath, url);
    return url;
  }
}
