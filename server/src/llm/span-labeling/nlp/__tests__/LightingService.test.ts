import { describe, it, expect, vi } from "vitest";
import {
  extractLightingSpans,
  DEFAULT_LIGHTING_CONFIG,
} from "../LightingService";

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// Mock the semantic classifier to return deterministic results
vi.mock("../LightingSemantics", () => ({
  classifyLightingSemantically: vi.fn(async (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes("shadow") || lower.includes("silhouette")) {
      return { lightingClass: "quality", confidence: 0.85 };
    }
    if (
      lower.includes("golden hour") ||
      lower.includes("dawn") ||
      lower.includes("sunset")
    ) {
      return { lightingClass: "timeOfDay", confidence: 0.9 };
    }
    if (
      lower.includes("neon") ||
      lower.includes("candle") ||
      lower.includes("sun")
    ) {
      return { lightingClass: "source", confidence: 0.88 };
    }
    return { lightingClass: "quality", confidence: 0.75 };
  }),
  lightingClassToTaxonomy: vi.fn((cls: string) => {
    const map: Record<string, string> = {
      quality: "lighting.quality",
      timeOfDay: "lighting.timeOfDay",
      source: "lighting.source",
      colorTemp: "lighting.colorTemp",
    };
    return map[cls] || "lighting.quality";
  }),
  isLightingSemanticsReady: vi.fn(() => true),
  warmupLightingSemantics: vi.fn(async () => {}),
}));

describe("extractLightingSpans", () => {
  describe("error handling and edge cases", () => {
    it("returns empty result when disabled", async () => {
      const result = await extractLightingSpans("soft shadows and warm glow", {
        enabled: false,
      });
      expect(result.spans).toEqual([]);
      expect(result.stats.totalExtracted).toBe(0);
    });

    it("returns empty result for non-string input", async () => {
      // @ts-expect-error testing runtime behavior
      const result = await extractLightingSpans(null);
      expect(result.spans).toEqual([]);
    });

    it("returns empty result for text with no lighting terms", async () => {
      const result = await extractLightingSpans(
        "A cowboy rides a horse through a desert",
      );
      expect(result.spans).toEqual([]);
    });

    it('excludes compound phrases like "traffic light"', async () => {
      const result = await extractLightingSpans("The traffic light turned red");
      expect(result.spans).toEqual([]);
    });

    it('excludes "light switch" as non-lighting descriptor', async () => {
      const result = await extractLightingSpans(
        "He flipped the light switch on",
      );
      expect(result.spans).toEqual([]);
    });
  });

  describe("core behavior", () => {
    it("extracts adjective + shadow noun patterns", async () => {
      const result = await extractLightingSpans(
        "The scene has soft shadows across the floor",
      );
      expect(result.spans.length).toBeGreaterThan(0);
      const shadowSpan = result.spans.find((s) =>
        s.text.toLowerCase().includes("shadow"),
      );
      expect(shadowSpan).toBeDefined();
      expect(shadowSpan?.role).toBe("lighting.quality");
    });

    it("extracts adjective + light/glow noun patterns", async () => {
      const result = await extractLightingSpans(
        "warm ambient glow fills the room",
      );
      expect(result.spans.length).toBeGreaterThan(0);
      const glowSpan = result.spans.find((s) =>
        s.text.toLowerCase().includes("glow"),
      );
      expect(glowSpan).toBeDefined();
    });

    it("includes correct start/end positions matching original text", async () => {
      const text = "The scene has soft shadows and warm glow";
      const result = await extractLightingSpans(text);
      expect(result.spans.length).toBeGreaterThan(0);
      for (const span of result.spans) {
        expect(span.start).toBeGreaterThanOrEqual(0);
        expect(span.end).toBeGreaterThan(span.start);
        expect(span.end).toBeLessThanOrEqual(text.length);
        expect(text.slice(span.start, span.end).toLowerCase()).toBe(
          span.text.toLowerCase(),
        );
      }
    });

    it("returns confidence at or above minConfidence", async () => {
      const result = await extractLightingSpans(
        "dramatic shadows fill the room",
      );
      expect(result.spans.length).toBeGreaterThan(0);
      for (const span of result.spans) {
        expect(span.confidence).toBeGreaterThanOrEqual(
          DEFAULT_LIGHTING_CONFIG.minConfidence,
        );
        expect(span.confidence).toBeLessThanOrEqual(1.0);
      }
    });

    it("deduplicates overlapping matches", async () => {
      const text = "beautiful soft shadows cast dramatic shadows";
      const result = await extractLightingSpans(text);
      expect(result.spans.length).toBeGreaterThan(1);
      // Check no two spans have overlapping ranges
      const sorted = [...result.spans].sort((a, b) => a.start - b.start);
      for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i];
        const previous = sorted[i - 1];
        expect(current).toBeDefined();
        expect(previous).toBeDefined();
        if (!current || !previous) continue;
        expect(current.start).toBeGreaterThanOrEqual(previous.end);
      }
    });

    it("respects maxPhraseWords config", async () => {
      const result = await extractLightingSpans(
        "extremely intensely bright dramatic shadows appear",
        { maxPhraseWords: 2 },
      );
      expect(result.spans.length).toBeGreaterThan(0);
      for (const span of result.spans) {
        const wordCount = span.text.split(/\s+/).length;
        expect(wordCount).toBeLessThanOrEqual(2);
      }
    });
  });
});
