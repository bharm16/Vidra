import { afterEach, describe, expect, it, vi } from "vitest";

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: () => mockLogger,
    debug: mockLogger.debug,
    info: mockLogger.info,
    warn: mockLogger.warn,
    error: mockLogger.error,
  },
}));

vi.mock("@server/llm/span-labeling/nlp/NlpSpanService", () => ({
  extractKnownSpans: vi.fn(),
  getVocabStats: vi.fn().mockReturnValue({}),
  extractSemanticSpans: vi.fn(),
  isGlinerAvailable: vi.fn().mockReturnValue(true),
}));

import SpanLabelingConfig from "@server/llm/span-labeling/config/SpanLabelingConfig";
import { NlpSpanStrategy } from "@server/llm/span-labeling/strategies/NlpSpanStrategy";
import * as NlpSpanService from "@server/llm/span-labeling/nlp/NlpSpanService";
import * as SpanValidator from "@server/llm/span-labeling/validation/SpanValidator";
import { SubstringPositionCache } from "@server/llm/span-labeling/cache/SubstringPositionCache";

const setFastPathEnabled = (value: boolean) => {
  (SpanLabelingConfig.NLP_FAST_PATH as { ENABLED: boolean }).ENABLED = value;
};
const setNeuroSymbolicEnabled = (value: boolean) => {
  (SpanLabelingConfig.NEURO_SYMBOLIC as { ENABLED: boolean }).ENABLED = value;
};
const setGlinerEnabled = (value: boolean) => {
  (SpanLabelingConfig.NEURO_SYMBOLIC.GLINER as { ENABLED: boolean }).ENABLED =
    value;
};

const originalFastPath = SpanLabelingConfig.NLP_FAST_PATH.ENABLED;
const originalNeuroSymbolic = SpanLabelingConfig.NEURO_SYMBOLIC.ENABLED;
const originalGliner = SpanLabelingConfig.NEURO_SYMBOLIC.GLINER.ENABLED;

const makeText = (count: number) =>
  Array.from({ length: count }, (_, i) => `word${i}`).join(" ");

afterEach(() => {
  setFastPathEnabled(originalFastPath);
  setNeuroSymbolicEnabled(originalNeuroSymbolic);
  setGlinerEnabled(originalGliner);
  vi.restoreAllMocks();
});

describe("NlpSpanStrategy", () => {
  describe("error handling", () => {
    it("returns null when NLP extraction fails", async () => {
      setFastPathEnabled(true);
      setNeuroSymbolicEnabled(true);

      vi.mocked(NlpSpanService.extractSemanticSpans).mockRejectedValue(
        new Error("fail"),
      );
      vi.mocked(NlpSpanService.extractKnownSpans).mockImplementation(() => {
        throw new Error("fallback failed");
      });

      const strategy = new NlpSpanStrategy();
      const result = await strategy.extractSpans(
        "short text",
        {},
        {},
        new SubstringPositionCache(),
      );

      expect(result).toBeNull();
    });

    it("returns null when span count is insufficient for long prompts", async () => {
      setFastPathEnabled(true);
      setNeuroSymbolicEnabled(false);

      vi.mocked(NlpSpanService.extractKnownSpans).mockReturnValue([
        { text: "shot", start: 0, end: 4, role: "shot.type", confidence: 0.4 },
      ]);
      vi.spyOn(SpanValidator, "validateSpans").mockReturnValue({
        ok: true,
        verdict: "pass" as const,
        errors: [],
        result: {
          spans: [{ text: "shot", role: "shot.type", confidence: 0.4 }],
          meta: { version: "v1", notes: "" },
        },
      });

      const strategy = new NlpSpanStrategy();
      const result = await strategy.extractSpans(
        makeText(120),
        {},
        {},
        new SubstringPositionCache(),
      );

      expect(result).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("falls back when GLiNER is required but unavailable", async () => {
      setFastPathEnabled(true);
      setNeuroSymbolicEnabled(true);
      setGlinerEnabled(true);

      vi.mocked(NlpSpanService.extractSemanticSpans).mockResolvedValue({
        spans: [
          {
            text: "subject",
            start: 0,
            end: 7,
            role: "subject",
            confidence: 0.9,
          },
        ],
        stats: {
          phase: "neuro-symbolic",
          totalSpans: 1,
          closedVocabSpans: 0,
          openVocabSpans: 1,
          tier1Latency: 1,
          tier2Latency: 1,
          totalLatency: 2,
        },
      });
      vi.mocked(NlpSpanService.isGlinerAvailable).mockReturnValue(false);
      vi.spyOn(SpanValidator, "validateSpans").mockReturnValue({
        ok: true,
        verdict: "pass" as const,
        errors: [],
        result: {
          spans: [{ text: "subject", role: "subject", confidence: 0.9 }],
          meta: { version: "v1", notes: "" },
        },
      });

      const strategy = new NlpSpanStrategy();
      const result = await strategy.extractSpans(
        makeText(100),
        {},
        {},
        new SubstringPositionCache(),
      );

      expect(result).toBeNull();
    });

    it("accepts sparse high-confidence spans when coverage is low", async () => {
      setFastPathEnabled(true);
      setNeuroSymbolicEnabled(false);

      vi.mocked(NlpSpanService.extractKnownSpans).mockReturnValue([
        {
          text: "camera move",
          start: 0,
          end: 11,
          role: "camera.movement",
          confidence: 0.9,
        },
      ]);
      vi.spyOn(SpanValidator, "validateSpans").mockReturnValue({
        ok: true,
        verdict: "pass" as const,
        errors: [],
        result: {
          spans: [
            { text: "camera move", role: "camera.movement", confidence: 0.9 },
          ],
          meta: { version: "v1", notes: "" },
        },
      });

      const strategy = new NlpSpanStrategy();
      const result = await strategy.extractSpans(
        makeText(50),
        {},
        {},
        new SubstringPositionCache(),
      );

      expect(result?.spans).toHaveLength(1);
      expect(result?.spans[0]?.text).toBe("camera move");
    });
  });

  describe("core behavior", () => {
    it("returns validated NLP spans when acceptance criteria are met", async () => {
      setFastPathEnabled(true);
      setNeuroSymbolicEnabled(false);

      vi.mocked(NlpSpanService.extractKnownSpans).mockReturnValue([
        { text: "hero", start: 0, end: 4, role: "subject", confidence: 0.8 },
      ]);
      vi.spyOn(SpanValidator, "validateSpans").mockReturnValue({
        ok: true,
        verdict: "pass" as const,
        errors: [],
        result: {
          spans: [{ text: "hero", role: "subject", confidence: 0.8 }],
          meta: { version: "v1", notes: "ok" },
        },
      });

      const strategy = new NlpSpanStrategy();
      const result = await strategy.extractSpans(
        "hero",
        {},
        {},
        new SubstringPositionCache(),
      );

      expect(result?.meta.notes).toBe("ok");
      expect(result?.spans[0]?.role).toBe("subject");
    });
  });
});
