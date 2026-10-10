import { beforeEach, describe, expect, it } from "vitest";
import { loadSelectedMode, loadVideoTier } from "../promptStateStorage";

beforeEach(() => {
  localStorage.clear();
});

describe("promptStateStorage", () => {
  describe("loadSelectedMode", () => {
    it("returns stored mode when valid", () => {
      localStorage.setItem("prompt-optimizer:selectedMode", "image");
      expect(loadSelectedMode()).toBe("image");
    });

    it("falls back to default when empty or whitespace", () => {
      localStorage.setItem("prompt-optimizer:selectedMode", "");
      expect(loadSelectedMode()).toBe("video");

      localStorage.setItem("prompt-optimizer:selectedMode", "   ");
      expect(loadSelectedMode()).toBe("video");
    });
  });

  describe("loadVideoTier", () => {
    it("returns stored tier when valid", () => {
      localStorage.setItem("prompt-optimizer:videoTier", "draft");
      expect(loadVideoTier()).toBe("draft");
    });

    it("falls back to default when invalid", () => {
      localStorage.setItem("prompt-optimizer:videoTier", "invalid");
      expect(loadVideoTier()).toBe("render");
    });
  });
});
