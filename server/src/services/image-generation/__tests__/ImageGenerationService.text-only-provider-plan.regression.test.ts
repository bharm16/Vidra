import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from "vitest";
import * as fc from "fast-check";
import { ImageGenerationService } from "../ImageGenerationService";
import { buildProviderPlan } from "../providers/registry";
import type {
  ImagePreviewProvider,
  ImagePreviewProviderId,
} from "../providers/types";
import type { ImageAssetStore } from "../storage/types";

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

describe("regression: text-only preview requests never route to img2img-only providers", () => {
  let assetStore: ImageAssetStore;

  beforeEach(() => {
    vi.clearAllMocks();
    assetStore = createAssetStore();
  });

  it("auto provider plans without an input image exclude providers that require one", () => {
    const schnell = createProvider("replicate-flux-schnell");
    const kontext = createProvider("replicate-flux-kontext-fast", {
      requiresInputImage: true,
    });

    const plan = buildProviderPlan({
      providers: [schnell, kontext],
      requestedProvider: "auto",
      hasInputImage: false,
    });

    expect(plan.map((p) => p.id)).toEqual(["replicate-flux-schnell"]);
  });

  it("auto provider plans with an input image keep img2img providers eligible", () => {
    const schnell = createProvider("replicate-flux-schnell");
    const kontext = createProvider("replicate-flux-kontext-fast", {
      requiresInputImage: true,
    });

    const plan = buildProviderPlan({
      providers: [schnell, kontext],
      requestedProvider: "auto",
      hasInputImage: true,
    });

    expect(plan.map((p) => p.id)).toEqual([
      "replicate-flux-schnell",
      "replicate-flux-kontext-fast",
    ]);
  });

  it("for any text-only prompt, a t2i failure surfaces its own error and the img2img provider is never invoked", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }).filter((s) => {
          return s.trim().length > 0;
        }),
        async (prompt) => {
          const t2iFailure = new Error(
            "invalid_grant: Invalid grant: account not found",
          );
          const schnell = createProvider("replicate-flux-schnell", {
            generatePreview: vi.fn().mockRejectedValue(t2iFailure),
          });
          const kontext = createProvider("replicate-flux-kontext-fast", {
            requiresInputImage: true,
            generatePreview: vi
              .fn()
              .mockRejectedValue(
                new Error(
                  "Flux Kontext Fast requires inputImageUrl for img2img edits. Generate a base image first.",
                ),
              ),
          });
          const service = new ImageGenerationService({
            providers: [schnell, kontext],
            assetStore,
            skipStorage: true,
          });

          await expect(service.generatePreview(prompt)).rejects.toThrow(
            "invalid_grant",
          );
          expect(kontext.generatePreview).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 25 },
    );
  });
});
