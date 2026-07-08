import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from "vitest";
import { ImageGenerationService } from "../ImageGenerationService";
import { ImageGenerationService as IndexImageGenerationService } from "..";
import type {
  ImagePreviewProvider,
  ImagePreviewProviderId,
  ImagePreviewRequest,
  ImagePreviewResult,
} from "../providers/types";
import type { ImageAssetStore, StoredImageAsset } from "../storage/types";
import * as responseTypesModule from "../types/responses";
import * as typesIndexModule from "../types";

const createProvider = (
  id: ImagePreviewProviderId,
  overrides: Partial<ImagePreviewProvider> = {},
): ImagePreviewProvider => {
  const generatePreview: MockedFunction<
    ImagePreviewProvider["generatePreview"]
  > = vi.fn();
  const isAvailable: MockedFunction<ImagePreviewProvider["isAvailable"]> = vi
    .fn()
    .mockReturnValue(true);

  return {
    id,
    displayName: `provider-${id}`,
    isAvailable,
    generatePreview,
    ...overrides,
  };
};

const createAssetStore = (
  overrides: Partial<ImageAssetStore> = {},
): ImageAssetStore => {
  const storeFromUrl: MockedFunction<ImageAssetStore["storeFromUrl"]> = vi.fn();
  const storeFromBuffer: MockedFunction<ImageAssetStore["storeFromBuffer"]> =
    vi.fn();
  const getPublicUrl: MockedFunction<ImageAssetStore["getPublicUrl"]> = vi.fn();
  const exists: MockedFunction<ImageAssetStore["exists"]> = vi.fn();
  const cleanupExpired: MockedFunction<ImageAssetStore["cleanupExpired"]> =
    vi.fn();

  return {
    storeFromUrl,
    storeFromBuffer,
    getPublicUrl,
    exists,
    cleanupExpired,
    ...overrides,
  };
};

describe("ImageGenerationService", () => {
  let assetStore: ImageAssetStore;

  beforeEach(() => {
    vi.clearAllMocks();
    assetStore = createAssetStore();
  });

  describe("error handling", () => {
    it("throws when prompt is empty or whitespace", async () => {
      const service = new ImageGenerationService({
        providers: [],
        assetStore,
        skipStorage: true,
      });

      await expect(service.generatePreview("   ")).rejects.toThrow(
        "Prompt is required and must be a non-empty string",
      );
    });

    it("throws a 503 when no providers are available for selection", async () => {
      const provider = createProvider("replicate-flux-schnell", {
        isAvailable: vi.fn().mockReturnValue(false),
      });
      const service = new ImageGenerationService({
        providers: [provider],
        defaultProvider: "replicate-flux-schnell",
        assetStore,
        skipStorage: true,
      });

      await expect(service.generatePreview("cat")).rejects.toMatchObject({
        message: expect.stringContaining(
          "No available image preview providers",
        ),
        statusCode: 503,
      });
    });

    it("rethrows the last provider error when all providers fail", async () => {
      const firstProvider = createProvider("replicate-flux-schnell");
      const secondProvider = createProvider("replicate-flux-kontext-fast");
      const errorOne = new Error("first failure");
      const errorTwo = new Error("second failure");

      (
        firstProvider.generatePreview as MockedFunction<
          ImagePreviewProvider["generatePreview"]
        >
      ).mockRejectedValueOnce(errorOne);
      (
        secondProvider.generatePreview as MockedFunction<
          ImagePreviewProvider["generatePreview"]
        >
      ).mockRejectedValueOnce(errorTwo);

      const service = new ImageGenerationService({
        providers: [firstProvider, secondProvider],
        fallbackOrder: [
          "replicate-flux-schnell",
          "replicate-flux-kontext-fast",
        ],
        assetStore,
        skipStorage: true,
      });

      await expect(service.generatePreview("cat")).rejects.toThrow(
        "second failure",
      );
    });

    it("propagates asset store errors when resolving public URLs", async () => {
      const error = new Error("asset store unavailable");
      (
        assetStore.getPublicUrl as MockedFunction<
          ImageAssetStore["getPublicUrl"]
        >
      ).mockRejectedValueOnce(error);

      const service = new ImageGenerationService({ providers: [], assetStore });

      await expect(service.getImageUrl("asset-id", "user-1")).rejects.toThrow(
        "asset store unavailable",
      );
    });

    it("propagates asset store errors when checking image existence", async () => {
      const error = new Error("existence check failed");
      (
        assetStore.exists as MockedFunction<ImageAssetStore["exists"]>
      ).mockRejectedValueOnce(error);

      const service = new ImageGenerationService({ providers: [], assetStore });

      await expect(service.imageExists("asset-id", "user-1")).rejects.toThrow(
        "existence check failed",
      );
    });

    it("fails when storage persistence fails after generation", async () => {
      const provider = createProvider("replicate-flux-schnell");
      (
        provider.generatePreview as MockedFunction<
          ImagePreviewProvider["generatePreview"]
        >
      ).mockResolvedValueOnce({
        imageUrl: "https://cdn.example.com/preview.webp",
        model: "flux-schnell",
        durationMs: 500,
        aspectRatio: "16:9",
      });
      (
        assetStore.storeFromUrl as MockedFunction<
          ImageAssetStore["storeFromUrl"]
        >
      ).mockRejectedValueOnce(new Error("storage down"));

      const service = new ImageGenerationService({
        providers: [provider],
        assetStore,
      });

      await expect(service.generatePreview("prompt")).rejects.toThrow(
        "storage down",
      );
    });
  });

  describe("edge cases", () => {
    it("skips storage and returns provider URL directly when configured", async () => {
      const provider = createProvider("replicate-flux-schnell");
      const previewResult: ImagePreviewResult = {
        imageUrl: "https://cdn.example.com/preview.webp",
        model: "flux-schnell",
        durationMs: 1234,
        aspectRatio: "16:9",
      };
      (
        provider.generatePreview as MockedFunction<
          ImagePreviewProvider["generatePreview"]
        >
      ).mockResolvedValueOnce(previewResult);

      const service = new ImageGenerationService({
        providers: [provider],
        assetStore,
        skipStorage: true,
      });

      const result = await service.generatePreview("  a prompt  ");

      expect(result.imageUrl).toBe(previewResult.imageUrl);
      expect(result.providerUrl).toBe(previewResult.imageUrl);
      expect(result.metadata.aspectRatio).toBe("16:9");
      expect(Number.isNaN(Date.parse(result.metadata.generatedAt))).toBe(false);
    });

    it("omits undefined optional request fields and trims prompts", async () => {
      const provider = createProvider("replicate-flux-schnell");
      (
        provider.generatePreview as MockedFunction<
          ImagePreviewProvider["generatePreview"]
        >
      ).mockResolvedValueOnce({
        imageUrl: "https://cdn.example.com/preview.webp",
        model: "flux-schnell",
        durationMs: 50,
        aspectRatio: "1:1",
      });

      const service = new ImageGenerationService({
        providers: [provider],
        assetStore,
        skipStorage: true,
      });

      await service.generatePreview("  trimmed prompt  ", { userId: "user-1" });

      const request = (
        provider.generatePreview as MockedFunction<
          ImagePreviewProvider["generatePreview"]
        >
      ).mock.calls[0]?.[0] as ImagePreviewRequest;

      expect(request.prompt).toBe("trimmed prompt");
      expect(request.userId).toBe("user-1");
      expect("seed" in request).toBe(false);
      expect("inputImageUrl" in request).toBe(false);
    });

    it("forwards all defined preview options to the selected provider", async () => {
      const provider = createProvider("replicate-flux-schnell");
      (
        provider.generatePreview as MockedFunction<
          ImagePreviewProvider["generatePreview"]
        >
      ).mockResolvedValueOnce({
        imageUrl: "https://cdn.example.com/preview.webp",
        model: "flux-schnell",
        durationMs: 50,
        aspectRatio: "4:5",
      });

      const service = new ImageGenerationService({
        providers: [provider],
        assetStore,
        skipStorage: true,
      });

      await service.generatePreview("prompt", {
        userId: "user-1",
        aspectRatio: "4:5",
        inputImageUrl: "https://images.example.com/source.png",
        seed: 12,
        speedMode: "Juiced",
        outputQuality: 77,
      });

      expect(provider.generatePreview).toHaveBeenCalledWith({
        prompt: "prompt",
        userId: "user-1",
        aspectRatio: "4:5",
        inputImageUrl: "https://images.example.com/source.png",
        seed: 12,
        speedMode: "Juiced",
        outputQuality: 77,
      });
    });

    it("keeps type-only modules empty at runtime", async () => {
      expect(Object.keys(responseTypesModule)).toHaveLength(0);
      expect(Object.keys(typesIndexModule)).toHaveLength(0);
    });
  });

  describe("core behavior", () => {
    it("stores provider output and enriches metadata when storage succeeds", async () => {
      const provider = createProvider("replicate-flux-schnell");
      const previewResult: ImagePreviewResult = {
        imageUrl: "https://cdn.example.com/preview.webp",
        model: "flux-schnell",
        durationMs: 2500,
        aspectRatio: "21:9",
      };
      (
        provider.generatePreview as MockedFunction<
          ImagePreviewProvider["generatePreview"]
        >
      ).mockResolvedValueOnce(previewResult);

      const storedAsset: StoredImageAsset = {
        id: "asset-123",
        storagePath: "image-previews/asset-123.webp",
        url: "https://storage.example.com/asset-123",
        contentType: "image/webp",
        createdAt: 1710000000000,
        expiresAt: 1710003600000,
        sizeBytes: 2048,
      };
      (
        assetStore.storeFromUrl as MockedFunction<
          ImageAssetStore["storeFromUrl"]
        >
      ).mockResolvedValueOnce(storedAsset);

      const service = new ImageGenerationService({
        providers: [provider],
        assetStore,
      });

      const result = await service.generatePreview("prompt");

      expect(result.imageUrl).toBe(storedAsset.url);
      expect(result.providerUrl).toBe(previewResult.imageUrl);
      expect(result.storagePath).toBe(storedAsset.storagePath);
      expect(result.viewUrl).toBe(storedAsset.url);
      const expiresAt = storedAsset.expiresAt;
      expect(expiresAt).toBeDefined();
      if (expiresAt === undefined) {
        throw new Error("expected expiresAt to be defined");
      }
      expect(result.viewUrlExpiresAt).toBe(new Date(expiresAt).toISOString());
      expect(result.sizeBytes).toBe(2048);
      expect(result.metadata.model).toBe("flux-schnell");
    });

    it("falls back to the next provider when the first one fails", async () => {
      const firstProvider = createProvider("replicate-flux-schnell");
      const secondProvider = createProvider("replicate-flux-kontext-fast");

      (
        firstProvider.generatePreview as MockedFunction<
          ImagePreviewProvider["generatePreview"]
        >
      ).mockRejectedValueOnce(new Error("timeout"));
      (
        secondProvider.generatePreview as MockedFunction<
          ImagePreviewProvider["generatePreview"]
        >
      ).mockResolvedValueOnce({
        imageUrl: "https://cdn.example.com/secondary.webp",
        model: "kontext-fast",
        durationMs: 300,
        aspectRatio: "4:5",
      });

      const service = new ImageGenerationService({
        providers: [firstProvider, secondProvider],
        fallbackOrder: [
          "replicate-flux-schnell",
          "replicate-flux-kontext-fast",
        ],
        assetStore,
        skipStorage: true,
      });

      const result = await service.generatePreview("prompt");

      expect(result.imageUrl).toBe("https://cdn.example.com/secondary.webp");
      expect(result.metadata.aspectRatio).toBe("4:5");
    });

    it("uses explicit provider selection and ignores fallback order", async () => {
      const firstProvider = createProvider("replicate-flux-schnell");
      const selectedProvider = createProvider("replicate-flux-kontext-fast");

      (
        selectedProvider.generatePreview as MockedFunction<
          ImagePreviewProvider["generatePreview"]
        >
      ).mockResolvedValueOnce({
        imageUrl: "https://cdn.example.com/kontext.webp",
        model: "kontext-fast",
        durationMs: 300,
        aspectRatio: "1:1",
      });

      const service = new ImageGenerationService({
        providers: [firstProvider, selectedProvider],
        fallbackOrder: [
          "replicate-flux-schnell",
          "replicate-flux-kontext-fast",
        ],
        assetStore,
        skipStorage: true,
      });

      const result = await service.generatePreview("prompt", {
        provider: "replicate-flux-kontext-fast",
      });

      expect(result.imageUrl).toBe("https://cdn.example.com/kontext.webp");
      expect(firstProvider.generatePreview).not.toHaveBeenCalled();
      expect(selectedProvider.generatePreview).toHaveBeenCalledTimes(1);
    });

    it("uses available provider order when auto-selection has no fallback order", async () => {
      const firstProvider = createProvider("replicate-flux-schnell");
      const secondProvider = createProvider("replicate-flux-kontext-fast");

      (
        firstProvider.generatePreview as MockedFunction<
          ImagePreviewProvider["generatePreview"]
        >
      ).mockRejectedValueOnce(new Error("first failed"));
      (
        secondProvider.generatePreview as MockedFunction<
          ImagePreviewProvider["generatePreview"]
        >
      ).mockResolvedValueOnce({
        imageUrl: "https://cdn.example.com/second.webp",
        model: "kontext-fast",
        durationMs: 300,
        aspectRatio: "16:9",
      });

      const service = new ImageGenerationService({
        providers: [firstProvider, secondProvider],
        assetStore,
        skipStorage: true,
      });

      const result = await service.generatePreview("prompt");

      expect(result.imageUrl).toBe("https://cdn.example.com/second.webp");
      expect(firstProvider.generatePreview).toHaveBeenCalledTimes(1);
      expect(secondProvider.generatePreview).toHaveBeenCalledTimes(1);
      const firstCallOrder = (
        firstProvider.generatePreview as MockedFunction<
          ImagePreviewProvider["generatePreview"]
        >
      ).mock.invocationCallOrder[0];
      const secondCallOrder = (
        secondProvider.generatePreview as MockedFunction<
          ImagePreviewProvider["generatePreview"]
        >
      ).mock.invocationCallOrder[0];
      expect(firstCallOrder).toBeDefined();
      expect(secondCallOrder).toBeDefined();
      expect(firstCallOrder!).toBeLessThan(secondCallOrder!);
    });

    it("re-exports the service from the index module", () => {
      expect(IndexImageGenerationService).toBe(ImageGenerationService);
    });
  });
});
