import type {
  Asset,
  AssetListResponse,
  AssetType,
  CreateAssetRequest,
  UpdateAssetRequest,
} from "@shared/types/asset";
import type {
  AssetStorePort,
  ReferenceImageMetadataInput,
} from "./ports/AssetStorePort";
import { ReferenceImageProcessingService } from "./ReferenceImageProcessingService";
import AssetResolverService from "./AssetResolverService";
import TriggerValidationService from "./TriggerValidationService";
import type FaceEmbeddingService from "./FaceEmbeddingService";
import {
  AssetCrudService,
  type ListAssetsByTypeResult,
} from "./services/AssetCrudService";

export type { ListAssetsByTypeResult } from "./services/AssetCrudService";
import { AssetReferenceImageService } from "./services/AssetReferenceImageService";
import { AssetPromptService } from "./services/AssetPromptService";
import { AssetEmbeddingService } from "./services/AssetEmbeddingService";

export class AssetService {
  private readonly crud: AssetCrudService;
  private readonly referenceImages: AssetReferenceImageService;
  private readonly prompts: AssetPromptService;
  private readonly embeddings: AssetEmbeddingService | null;

  constructor(
    assetRepository: AssetStorePort,
    referenceImageRepository: ReferenceImageProcessingService,
    resolverService = new AssetResolverService(assetRepository),
    triggerValidation = new TriggerValidationService(),
    embeddingService: FaceEmbeddingService | null = null,
  ) {
    this.crud = new AssetCrudService(assetRepository, triggerValidation);
    this.embeddings = embeddingService
      ? new AssetEmbeddingService(assetRepository, embeddingService, this.crud)
      : null;
    this.referenceImages = new AssetReferenceImageService(
      assetRepository,
      referenceImageRepository,
      this.crud,
      this.embeddings,
    );
    this.prompts = new AssetPromptService(resolverService);
  }

  async createAsset(
    userId: string,
    payload: CreateAssetRequest,
  ): Promise<Asset> {
    return this.crud.createAsset(userId, payload);
  }

  async getAsset(userId: string, assetId: string): Promise<Asset> {
    return this.crud.getAsset(userId, assetId);
  }

  async listAssets(
    userId: string,
    options: {
      limit?: number;
      orderByField?: string;
      type?: AssetType | null;
    } = {},
  ): Promise<AssetListResponse> {
    return this.crud.listAssets(userId, options);
  }

  async listAssetsByType(
    userId: string,
    type: AssetType,
  ): Promise<ListAssetsByTypeResult> {
    return this.crud.listAssetsByType(userId, type);
  }

  async updateAsset(
    userId: string,
    assetId: string,
    updates: UpdateAssetRequest,
  ): Promise<Asset | null> {
    return this.crud.updateAsset(userId, assetId, updates);
  }

  async deleteAsset(userId: string, assetId: string): Promise<boolean> {
    return this.crud.deleteAsset(userId, assetId);
  }

  async addReferenceImage(
    userId: string,
    assetId: string,
    imageBuffer: Buffer,
    metadata: ReferenceImageMetadataInput = {},
  ): Promise<{ image: Asset["referenceImages"][number]; warnings: string[] }> {
    return this.referenceImages.addReferenceImage(
      userId,
      assetId,
      imageBuffer,
      metadata,
    );
  }

  async deleteReferenceImage(
    userId: string,
    assetId: string,
    imageId: string,
  ): Promise<boolean> {
    return this.referenceImages.deleteReferenceImage(userId, assetId, imageId);
  }

  async setPrimaryImage(
    userId: string,
    assetId: string,
    imageId: string,
  ): Promise<Asset | null> {
    return this.referenceImages.setPrimaryImage(userId, assetId, imageId);
  }

  async resolvePrompt(userId: string, rawPrompt: string) {
    return this.prompts.resolvePrompt(userId, rawPrompt);
  }

  async getSuggestions(userId: string, partialTrigger: string) {
    return this.prompts.getSuggestions(userId, partialTrigger);
  }

  async validateTriggers(userId: string, rawPrompt: string) {
    return this.prompts.validateTriggers(userId, rawPrompt);
  }

  async getAssetForGeneration(
    userId: string,
    assetId: string,
  ): Promise<{
    id: string;
    type: AssetType;
    trigger: string;
    name: string;
    textDefinition: string;
    negativePrompt?: string;
    primaryImageUrl: string | null;
    referenceImages: Asset["referenceImages"];
    faceEmbedding?: string | null;
  }> {
    return this.crud.getAssetForGeneration(userId, assetId);
  }

  async generateDescriptionFromImage(
    _userId: string,
    _assetId: string,
    _imageId?: string | null,
  ) {
    throw new Error("AI description generation not yet implemented");
  }

  async extractAndStoreFaceEmbedding(userId: string, assetId: string) {
    if (!this.embeddings) {
      throw new Error("Face embedding service is not configured");
    }
    return this.embeddings.extractAndStoreFaceEmbedding(userId, assetId);
  }
}

export default AssetService;
