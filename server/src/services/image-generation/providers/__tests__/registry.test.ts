import { describe, it, expect, vi } from "vitest";
import {
  buildProviderPlan,
  isImagePreviewProviderId,
  parseImagePreviewProviderOrder,
  resolveImagePreviewProviderSelection,
} from "../registry";
import type { ImagePreviewProvider } from "../types";
import { IMAGE_PREVIEW_PROVIDER_IDS } from "../types";

const createProvider = (
  id: ImagePreviewProvider["id"],
  available = true,
): ImagePreviewProvider => ({
  id,
  displayName: id,
  isAvailable: vi.fn().mockReturnValue(available),
  generatePreview: vi.fn(),
});

describe("image preview provider registry", () => {
  describe("error handling", () => {
    it("skips invalid entries when parsing provider order", () => {
      const order = parseImagePreviewProviderOrder("invalid, ,,,,");
      expect(order).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("normalizes aliases and removes duplicates in provider order", () => {
      const order = parseImagePreviewProviderOrder(
        "replicate,kontext,replicate-kontext-fast,replicate",
      );

      expect(order).toEqual([
        "replicate-flux-schnell",
        "replicate-flux-kontext-fast",
      ]);
    });
  });

  describe("core behavior", () => {
    it("returns fallback providers in order when auto selection is used", () => {
      const providerA = createProvider("replicate-flux-schnell");
      const providerB = createProvider("replicate-flux-kontext-fast");

      const plan = buildProviderPlan({
        providers: [providerA, providerB],
        requestedProvider: "auto",
        fallbackOrder: [
          "replicate-flux-kontext-fast",
          "replicate-flux-schnell",
        ],
      });

      expect(plan.map((provider) => provider.id)).toEqual([
        "replicate-flux-kontext-fast",
        "replicate-flux-schnell",
      ]);
    });
  });
});
