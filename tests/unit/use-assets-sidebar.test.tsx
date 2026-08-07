import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useAssetsSidebar } from "@features/prompt-optimizer/components/AssetsSidebar/hooks/useAssetsSidebar";
import { assetsSidebarApi } from "@features/prompt-optimizer/components/AssetsSidebar/api/assetsSidebarApi";
import type { Asset } from "@shared/types/asset";

const listeners: Array<(user: unknown) => void> = [];
const unsubscribe = vi.fn();

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth, callback: (user: unknown) => void) => {
    listeners.push(callback);
    return unsubscribe;
  }),
}));

vi.mock("@/config/firebase", () => ({
  getFirebaseAuth: () => ({}),
}));

vi.mock(
  "@features/prompt-optimizer/components/AssetsSidebar/api/assetsSidebarApi",
  () => ({
    assetsSidebarApi: {
      list: vi.fn(),
    },
  }),
);

const mockAssetsSidebarApi = vi.mocked(assetsSidebarApi);

const createAsset = (overrides: Partial<Asset> = {}): Asset => ({
  id: overrides.id ?? "asset-1",
  userId: "user-1",
  type: overrides.type ?? "character",
  trigger: overrides.trigger ?? "@hero",
  name: overrides.name ?? "Hero",
  textDefinition: overrides.textDefinition ?? "hero",
  referenceImages: [],
  usageCount: 0,
  lastUsedAt: null,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

describe("useAssetsSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners.length = 0;
  });

  describe("error handling", () => {
    it("stores the error message when asset loading fails", async () => {
      mockAssetsSidebarApi.list.mockRejectedValue(new Error("boom"));

      const { result } = renderHook(() => useAssetsSidebar());

      await act(async () => {
        listeners[0]?.({ uid: "user-1" });
        await Promise.resolve();
      });

      expect(result.current.error).toBe("boom");
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("clears assets and stops loading when the user logs out", async () => {
      mockAssetsSidebarApi.list.mockResolvedValue({
        assets: [createAsset()],
        total: 1,
        byType: { character: 1, style: 0, location: 0, object: 0 },
      });

      const { result } = renderHook(() => useAssetsSidebar());

      await act(async () => {
        listeners[0]?.(null);
      });

      expect(result.current.assets).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(mockAssetsSidebarApi.list).not.toHaveBeenCalled();
    });
  });

  describe("core behavior", () => {
    it("loads assets when a user is present", async () => {
      const hero = createAsset();
      mockAssetsSidebarApi.list.mockResolvedValue({
        assets: [hero],
        total: 1,
        byType: { character: 1, style: 0, location: 0, object: 0 },
      });

      const { result } = renderHook(() => useAssetsSidebar());

      await act(async () => {
        listeners[0]?.({ uid: "user-1" });
        await Promise.resolve();
      });

      expect(result.current.assets).toEqual([hero]);
      expect(result.current.byType.character).toEqual([hero]);
      expect(result.current.isLoading).toBe(false);
    });

    it("refreshes assets on demand", async () => {
      const hero = createAsset();
      mockAssetsSidebarApi.list.mockResolvedValueOnce({
        assets: [],
        total: 0,
        byType: { character: 0, style: 0, location: 0, object: 0 },
      });
      mockAssetsSidebarApi.list.mockResolvedValueOnce({
        assets: [hero],
        total: 1,
        byType: { character: 1, style: 0, location: 0, object: 0 },
      });

      const { result } = renderHook(() => useAssetsSidebar());

      await act(async () => {
        listeners[0]?.({ uid: "user-1" });
        await Promise.resolve();
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.assets).toEqual([hero]);
      expect(mockAssetsSidebarApi.list).toHaveBeenCalledTimes(2);
    });
  });
});
