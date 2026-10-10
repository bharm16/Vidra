import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractActionSpans, warmupCompromise } from "../CompromiseService";

// Mock the logger
vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

// Mock VerbSemantics (async classifier)
vi.mock("../VerbSemantics", () => ({
  classifyVerbSemantically: vi.fn().mockResolvedValue({
    actionClass: "movement",
    confidence: 0.9,
  }),
  isVerbSemanticsReady: vi.fn().mockReturnValue(false),
  warmupVerbSemantics: vi.fn().mockResolvedValue(undefined),
}));

describe("extractActionSpans", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("returns empty result when disabled", async () => {
      const result = await extractActionSpans("running through the park", {
        enabled: false,
      });

      expect(result.spans).toHaveLength(0);
      expect(result.stats.totalExtracted).toBe(0);
    });

    it("returns empty result for empty text", async () => {
      const result = await extractActionSpans("");

      expect(result.spans).toHaveLength(0);
    });

    it("returns empty result for non-string input", async () => {
      const result = await extractActionSpans(123 as unknown as string);

      expect(result.spans).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("extracts gerunds tagged as nouns", async () => {
      // Compromise sometimes tags gerunds as nouns in video prompts
      const result = await extractActionSpans("woman dribbling a basketball");

      const texts = result.spans.map((s) => s.text.toLowerCase());
      expect(texts.some((t) => t.includes("dribbling"))).toBe(true);
    });

    it("respects maxPhraseWords limit", async () => {
      const result = await extractActionSpans(
        "the athlete is running extremely quickly and energetically through the dense green forest",
        { maxPhraseWords: 3 },
      );

      expect(result.spans.length).toBeGreaterThan(0);
      result.spans.forEach((span) => {
        const wordCount = span.text.split(/\s+/).length;
        expect(wordCount).toBeLessThanOrEqual(3);
      });
    });
  });

  describe("verb phrase extraction", () => {
    it("extracts verb with object patterns", async () => {
      const result = await extractActionSpans("catching a ball");

      const texts = result.spans.map((s) => s.text.toLowerCase());
      expect(texts.some((t) => t.includes("catching"))).toBe(true);
    });
  });

  describe("exclusion filters", () => {
    it("excludes auxiliary verbs", async () => {
      const result = await extractActionSpans("the dog is sitting");

      const texts = result.spans.map((s) => s.text.toLowerCase());
      expect(texts.every((t) => t !== "is")).toBe(true);
    });

    it("excludes camera/technical verbs", async () => {
      const result = await extractActionSpans(
        "capturing the scene, filming the action",
      );

      const texts = result.spans.map((s) => s.text.toLowerCase());
      expect(
        texts.every((t) => !t.includes("capturing") && !t.includes("filming")),
      ).toBe(true);
    });

    it("excludes template instruction patterns", async () => {
      const result = await extractActionSpans(
        "maintain the framing, isolate the main subject",
      );

      const texts = result.spans.map((s) => s.text.toLowerCase());
      expect(
        texts.every((t) => !t.includes("maintain") && !t.includes("isolate")),
      ).toBe(true);
    });

    it("excludes lighting effect verbs", async () => {
      const result = await extractActionSpans(
        "sunlight streaming through the window, shadows casting on the wall",
      );

      const texts = result.spans.map((s) => s.text.toLowerCase());
      expect(
        texts.every((t) => !t.includes("streaming") || !t.includes("sunlight")),
      ).toBe(true);
    });
  });

  describe("action role classification", () => {
    it("classifies state verbs correctly", async () => {
      const result = await extractActionSpans("the cat sitting on the couch");

      const sittingSpan = result.spans.find((s) =>
        s.text.toLowerCase().includes("sitting"),
      );
      expect(sittingSpan?.role).toBe("action.state");
    });

    it("classifies gesture verbs correctly", async () => {
      const result = await extractActionSpans("a person waving goodbye");

      const wavingSpan = result.spans.find((s) =>
        s.text.toLowerCase().includes("waving"),
      );
      expect(wavingSpan?.role).toBe("action.gesture");
    });

    it("classifies movement verbs correctly", async () => {
      const result = await extractActionSpans("a child jumping with joy");

      const jumpingSpan = result.spans.find((s) =>
        s.text.toLowerCase().includes("jumping"),
      );
      expect(jumpingSpan?.role).toBe("action.movement");
    });
  });

  describe("span structure", () => {
    it("calculates correct character positions", async () => {
      const text = "a person running quickly";
      const result = await extractActionSpans(text);

      expect(result.spans.length).toBeGreaterThan(0);
      result.spans.forEach((span) => {
        expect(span.start).toBeGreaterThanOrEqual(0);
        expect(span.end).toBeLessThanOrEqual(text.length);
        expect(span.end).toBeGreaterThan(span.start);
        // The extracted text should match the substring
        expect(text.slice(span.start, span.end).toLowerCase()).toBe(
          span.text.toLowerCase(),
        );
      });
    });
  });
});

describe("warmupCompromise", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts spans during warmup", async () => {
    const result = await warmupCompromise();

    // The warmup uses a test sentence that should produce spans
    expect(result.success).toBe(true);
  });
});
