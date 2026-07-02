import { describe, it, expect, vi, beforeEach } from "vitest";
import { assetApi } from "../api/assetApi";
import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";
import type { Asset } from "@shared/types/asset";

vi.mock("@/services/http/firebaseAuth", () => ({
  buildFirebaseAuthHeaders: vi.fn(),
}));

describe("assetApi", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    vi.mocked(buildFirebaseAuthHeaders).mockResolvedValue({
      Authorization: "Bearer token",
    });
  });

  describe("error handling", () => {
    it("throws server error message when list response is not ok", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Nope" }),
      });

      await expect(assetApi.list()).rejects.toThrow("Nope");
      expect(fetchMock).toHaveBeenCalledWith("/api/assets", {
        headers: { Authorization: "Bearer token" },
        credentials: "include",
      });
    });

    it("uses fallback message when error payload cannot be parsed", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => {
          throw "bad";
        },
      });

      await expect(assetApi.get("asset-1")).rejects.toThrow(
        "Failed to fetch asset",
      );
    });
  });

  describe("edge cases", () => {
    it("includes type query parameter for list requests", async () => {
      const response = {
        assets: [],
        total: 0,
        byType: { character: 0, style: 0, location: 0, object: 0 },
      };
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: response }),
      });

      const result = await assetApi.list("character");

      expect(fetchMock).toHaveBeenCalledWith("/api/assets?type=character", {
        headers: { Authorization: "Bearer token" },
        credentials: "include",
      });
      expect(result).toEqual(response);
    });

    it("sends FormData with metadata when uploading images", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            image: {
              id: "img-1",
              url: "https://example.com/image.png",
              thumbnailUrl: "https://example.com/thumb.png",
              isPrimary: false,
              metadata: {
                uploadedAt: "now",
                width: 100,
                height: 100,
                sizeBytes: 1234,
              },
            },
            warnings: [],
          },
        }),
      });

      const file = new File(["image"], "test.png", { type: "image/png" });
      await assetApi.addImage("asset-1", file, {
        angle: "front",
        lighting: undefined,
      });

      const firstCall = fetchMock.mock.calls[0];
      expect(firstCall).toBeDefined();
      const [, options] = firstCall!;
      const body = options?.body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get("image")).toBe(file);
      expect(body.get("angle")).toBe("front");
      expect(body.get("lighting")).toBeNull();
    });
  });

  describe("core behavior", () => {
    it("creates assets with JSON payload and returns asset", async () => {
      const asset: Asset = {
        id: "a1",
        userId: "u1",
        type: "character",
        trigger: "@Ada",
        name: "Ada",
        textDefinition: "A user",
        referenceImages: [],
        usageCount: 0,
        lastUsedAt: null,
        createdAt: "now",
        updatedAt: "now",
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: asset }),
      });

      const result = await assetApi.create({
        type: "character",
        trigger: "@Ada",
        name: "Ada",
      });

      const firstCall = fetchMock.mock.calls[0];
      expect(firstCall).toBeDefined();
      const [, options] = firstCall!;
      expect(options?.method).toBe("POST");
      expect(options?.headers).toEqual({
        "Content-Type": "application/json",
        Authorization: "Bearer token",
      });
      expect(options?.body).toBe(
        JSON.stringify({ type: "character", trigger: "@Ada", name: "Ada" }),
      );
      expect(result).toEqual(asset);
    });
  });
});
