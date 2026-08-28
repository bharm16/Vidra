import { describe, it, expect, vi } from "vitest";

import { assetsSidebarApi } from "@features/prompt-optimizer/components/AssetsSidebar/api/assetsSidebarApi";
import { assetApi } from "@features/assets/api/assetApi";

vi.mock("@features/assets/api/assetApi", () => ({
  assetApi: {
    list: vi.fn(),
  },
}));

const mockAssetApi = vi.mocked(assetApi);

describe("assetsSidebarApi", () => {
  describe("error handling", () => {
    it("propagates list errors from assetApi", async () => {
      mockAssetApi.list.mockRejectedValue(new Error("boom"));

      await expect(assetsSidebarApi.list("character")).rejects.toThrow("boom");
    });
  });

  describe("core behavior", () => {
    it("calls assetApi.list with the provided type", async () => {
      mockAssetApi.list.mockResolvedValue({
        assets: [],
        total: 0,
        byType: { character: 0, style: 0, location: 0, object: 0 },
      });

      const result = await assetsSidebarApi.list("style");

      expect(mockAssetApi.list).toHaveBeenCalledWith("style");
      expect(result).toEqual({
        assets: [],
        total: 0,
        byType: { character: 0, style: 0, location: 0, object: 0 },
      });
    });
  });
});
