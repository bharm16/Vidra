import { describe, it, expect } from "vitest";
import {
  serializeKeyframes,
  hydrateKeyframes,
  areKeyframesEqual,
} from "../keyframeTransforms";
import type { PromptKeyframeSource } from "@features/prompt-optimizer/types/domain/prompt-session";

const tile = (
  id: string,
  url: string,
  source: PromptKeyframeSource = "upload",
  assetId?: string,
) => ({
  id,
  url,
  source,
  ...(assetId ? { assetId } : {}),
});

const promptKf = (
  url: string,
  source: PromptKeyframeSource = "upload",
  id?: string,
  assetId?: string,
) => ({
  url,
  source,
  ...(id ? { id } : {}),
  ...(assetId ? { assetId } : {}),
});

describe("serializeKeyframes", () => {
  describe("core behavior", () => {
    it("limits to MAX_KEYFRAMES (3)", () => {
      const tiles = [
        tile("k1", "url1"),
        tile("k2", "url2"),
        tile("k3", "url3"),
        tile("k4", "url4"),
      ];
      expect(serializeKeyframes(tiles)).toHaveLength(3);
    });
  });
});

describe("hydrateKeyframes", () => {
  describe("edge cases", () => {
    it("filters out keyframes with whitespace-only url", () => {
      const keyframes = [promptKf("   ", "upload", "k1")];
      expect(hydrateKeyframes(keyframes)).toHaveLength(0);
    });
  });

  describe("core behavior", () => {
    it("defaults source to upload when missing", () => {
      const keyframes = [{ url: "https://img.com/1.png" }];
      const result = hydrateKeyframes(keyframes as never);
      expect(result[0]!.source).toBe("upload");
    });

    it("limits to MAX_KEYFRAMES (3)", () => {
      const keyframes = [
        promptKf("url1", "upload", "k1"),
        promptKf("url2", "upload", "k2"),
        promptKf("url3", "upload", "k3"),
        promptKf("url4", "upload", "k4"),
      ];
      expect(hydrateKeyframes(keyframes)).toHaveLength(3);
    });
  });
});

describe("areKeyframesEqual", () => {
  describe("edge cases", () => {
    it("returns false when lengths differ", () => {
      expect(
        areKeyframesEqual(
          [tile("k1", "url1")],
          [tile("k1", "url1"), tile("k2", "url2")],
        ),
      ).toBe(false);
    });
  });

  describe("core behavior", () => {
    it("returns true for identical keyframes", () => {
      const left = [tile("k1", "url1", "upload", "asset-1")];
      const right = [tile("k1", "url1", "upload", "asset-1")];
      expect(areKeyframesEqual(left, right)).toBe(true);
    });

    it("returns false when urls differ", () => {
      expect(
        areKeyframesEqual([tile("k1", "url1")], [tile("k1", "url2")]),
      ).toBe(false);
    });

    it("returns false when sources differ", () => {
      expect(
        areKeyframesEqual(
          [tile("k1", "url1", "upload")],
          [tile("k1", "url1", "asset")],
        ),
      ).toBe(false);
    });

    it("returns false when assetId differs", () => {
      expect(
        areKeyframesEqual(
          [tile("k1", "url1", "upload", "asset-1")],
          [tile("k1", "url1", "upload", "asset-2")],
        ),
      ).toBe(false);
    });

    it("ignores id differences (compares by url, source, assetId only)", () => {
      expect(
        areKeyframesEqual(
          [tile("k1", "url1", "upload")],
          [tile("k999", "url1", "upload")],
        ),
      ).toBe(true);
    });

    it("only compares first MAX_KEYFRAMES (3)", () => {
      const left = [
        tile("k1", "url1"),
        tile("k2", "url2"),
        tile("k3", "url3"),
        tile("k4", "urlX"),
      ];
      const right = [
        tile("k1", "url1"),
        tile("k2", "url2"),
        tile("k3", "url3"),
        tile("k4", "urlY"),
      ];
      // Both arrays have 4 items, but normalizeForCompare limits to 3
      expect(areKeyframesEqual(left, right)).toBe(true);
    });
  });
});
