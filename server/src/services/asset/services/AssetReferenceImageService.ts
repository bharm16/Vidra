import type { Asset } from "@shared/types/asset";
import type {
  AssetStorePort,
  ReferenceImageMetadataInput,
} from "../ports/AssetStorePort";
import { ReferenceImageProcessingService } from "../ReferenceImageProcessingService";
import { logger } from "@infrastructure/Logger";
import type { AssetCrudService } from "./AssetCrudService";
import type { AssetEmbeddingService } from "./AssetEmbeddingService";

export class AssetReferenceImageService {
  private readonly repository: AssetStorePort;
  private readonly imageService: ReferenceImageProcessingService;
  private readonly assetCrud: AssetCrudService;
  private readonly embeddingService: AssetEmbeddingService | null;
  private readonly log = logger.child({
    service: "AssetReferenceImageService",
  });

  constructor(
    repository: AssetStorePort,
    imageService: ReferenceImageProcessingService,
    assetCrud: AssetCrudService,
    embeddingService: AssetEmbeddingService | null,
  ) {
    this.repository = repository;
    this.imageService = imageService;
    this.assetCrud = assetCrud;
    this.embeddingService = embeddingService;
  }

  async addReferenceImage(
    userId: string,
    assetId: string,
    imageBuffer: Buffer,
    metadata: ReferenceImageMetadataInput = {},
  ): Promise<{ image: Asset["referenceImages"][number]; warnings: string[] }> {
    const operation = "addReferenceImage";
    const startTime = performance.now();
    this.log.debug("Starting operation.", {
      operation,
      userId,
      assetId,
      bufferSize: imageBuffer.length,
      metadataKeys: Object.keys(metadata).length,
    });
    try {
      const asset = await this.assetCrud.getAsset(userId, assetId);

      const maxImages = asset.type === "character" ? 10 : 5;
      if ((asset.referenceImages || []).length >= maxImages) {
        throw new Error(
          `Maximum ${maxImages} reference images per ${asset.type}`,
        );
      }

      const validation = await this.imageService.validateForAssetType(
        imageBuffer,
        asset.type,
      );
      if (!validation.isValid) {
        throw new Error(validation.errors.join(", "));
      }

      const processedImage = await this.imageService.processImage(imageBuffer);
      const thumbnail = await this.imageService.generateThumbnail(
        processedImage.buffer,
      );

      const referenceImage = await this.repository.addReferenceImage(
        userId,
        assetId,
        {
          buffer: processedImage.buffer,
          width: processedImage.width,
          height: processedImage.height,
          sizeBytes: processedImage.sizeBytes,
          format: processedImage.format,
        },
        {
          buffer: thumbnail.buffer,
          width: thumbnail.width,
          height: thumbnail.height,
          sizeBytes: thumbnail.sizeBytes,
          format: thumbnail.format,
        },
        {
          ...metadata,
          width: processedImage.width,
          height: processedImage.height,
        },
      );

      if (asset.type === "character" && this.embeddingService) {
        const updatedAsset = await this.assetCrud.getAsset(userId, assetId);
        const isPrimary =
          referenceImage.isPrimary ||
          (updatedAsset.referenceImages || []).length === 1;
        if (isPrimary) {
          try {
            await this.embeddingService.extractAndStoreFaceEmbedding(
              userId,
              assetId,
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            this.log.warn("Face embedding extraction failed", {
              operation,
              userId,
              assetId,
              message,
            });
          }
        }
      }

      this.log.info("Operation completed.", {
        operation,
        userId,
        assetId,
        imageId: referenceImage.id,
        warnings: validation.warnings.length,
        duration: Math.round(performance.now() - startTime),
      });

      return {
        image: referenceImage,
        warnings: validation.warnings,
      };
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
      await this.assetCrud.getAsset(userId, assetId);
      const deleted = await this.repository.deleteReferenceImage(
        userId,
        assetId,
        imageId,
      );
      this.log.info("Operation completed.", {
        operation,
        userId,
        assetId,
        imageId,
        deleted,
        duration: Math.round(performance.now() - startTime),
      });
      return deleted;
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
      const asset = await this.assetCrud.getAsset(userId, assetId);
      const imageExists = asset.referenceImages?.some(
        (img) => img.id === imageId,
      );
      if (!imageExists) {
        throw new Error(`Image not found: ${imageId}`);
      }
      const updated = await this.repository.setPrimaryImage(
        userId,
        assetId,
        imageId,
      );
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
}
