import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const extractSemanticSpansMock = vi.fn();
const extractKnownSpansMock = vi.fn();
const getVocabStatsMock = vi.fn();
const isGlinerAvailableMock = vi.fn();

vi.mock("@llm/span-labeling/nlp/NlpSpanService.js", () => ({
  extractSemanticSpans: (...args: unknown[]) =>
    extractSemanticSpansMock(...args),
  extractKnownSpans: (...args: unknown[]) => extractKnownSpansMock(...args),
  getVocabStats: (...args: unknown[]) => getVocabStatsMock(...args),
  isGlinerAvailable: (...args: unknown[]) => isGlinerAvailableMock(...args),
}));

const validateSpansMock = vi.fn();
vi.mock("@llm/span-labeling/validation/SpanValidator.js", () => ({
  validateSpans: (...args: unknown[]) => validateSpansMock(...args),
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import SpanLabelingConfig from "@llm/span-labeling/config/SpanLabelingConfig.js";
import { NlpSpanStrategy } from "@llm/span-labeling/strategies/NlpSpanStrategy.js";

describe("NlpSpanStrategy", () => {
  const setNeuroSymbolicEnabled = (enabled: boolean) => {
    (SpanLabelingConfig.NEURO_SYMBOLIC as { ENABLED: boolean }).ENABLED =
      enabled;
  };

  const setGlinerEnabled = (enabled: boolean) => {
    (SpanLabelingConfig.NEURO_SYMBOLIC.GLINER as { ENABLED: boolean }).ENABLED =
      enabled;
  };

  const setNlpFastPathEnabled = (enabled: boolean) => {
    (SpanLabelingConfig.NLP_FAST_PATH as { ENABLED: boolean }).ENABLED =
      enabled;
  };

  const originalFlags = {
    neuroSymbolicEnabled: SpanLabelingConfig.NEURO_SYMBOLIC.ENABLED,
    glinerEnabled: SpanLabelingConfig.NEURO_SYMBOLIC.GLINER.ENABLED,
    nlpFastPathEnabled: SpanLabelingConfig.NLP_FAST_PATH.ENABLED,
  };

  beforeEach(() => {
    setNeuroSymbolicEnabled(true);
    setGlinerEnabled(true);
    setNlpFastPathEnabled(true);
    extractSemanticSpansMock.mockReset();
    extractKnownSpansMock.mockReset();
    getVocabStatsMock.mockReset();
    isGlinerAvailableMock.mockReset();
    validateSpansMock.mockReset();
  });

  afterEach(() => {
    setNeuroSymbolicEnabled(originalFlags.neuroSymbolicEnabled);
    setGlinerEnabled(originalFlags.glinerEnabled);
    setNlpFastPathEnabled(originalFlags.nlpFastPathEnabled);
  });

  describe("error handling", () => {
    it("falls back to dictionary spans when neuro-symbolic extraction fails", async () => {
      extractSemanticSpansMock.mockRejectedValue(new Error("boom"));
      extractKnownSpansMock.mockReturnValue([
        { text: "Hero", start: 0, end: 4, role: "subject", confidence: 0.9 },
      ]);
      validateSpansMock.mockReturnValue({
        ok: true,
        errors: [],
        result: {
          spans: [{ text: "Hero", role: "subject" }],
          meta: { version: "v1", notes: "" },
        },
      });

      const strategy = new NlpSpanStrategy();
      const result = await strategy.extractSpans(
        "Hero runs fast.",
        { allowOverlap: false },
        { maxSpans: 5 },
        {} as never,
      );

      expect(result?.spans).toHaveLength(1);
      expect(extractKnownSpansMock).toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("returns null when GLiNER is unavailable for long prompts", async () => {
      const longText = new Array(90).fill("word").join(" ");
      extractSemanticSpansMock.mockResolvedValue({
        spans: [
          { text: "word", start: 0, end: 4, role: "subject", confidence: 0.95 },
        ],
        stats: { phase: "neuro-symbolic" },
      });
      isGlinerAvailableMock.mockReturnValue(false);
      validateSpansMock.mockReturnValue({
        ok: true,
        errors: [],
        result: {
          spans: [{ text: "word", role: "subject", confidence: 0.95 }],
          meta: { version: "v1", notes: "" },
        },
      });

      const strategy = new NlpSpanStrategy();
      const result = await strategy.extractSpans(
        longText,
        { allowOverlap: false },
        { maxSpans: 10, minConfidence: 0.5 },
        {} as never,
      );

      expect(result).toBeNull();
    });
  });
});
