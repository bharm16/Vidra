import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import SpanLabelingConfig from "@llm/span-labeling/config/SpanLabelingConfig";
import type { NlpSpan } from "@llm/span-labeling/nlp/types";

const mockExtractClosedVocabulary = vi.fn();
const mockExtractActionSpans = vi.fn();
const mockExtractLightingSpans = vi.fn();
const mockExtractOpenVocabulary = vi.fn();
const mockFilterSectionHeaders = vi.fn();

vi.mock("@llm/span-labeling/nlp/tier1/closedVocabulary", () => ({
  extractClosedVocabulary: (...args: unknown[]) =>
    mockExtractClosedVocabulary(...args),
}));

vi.mock("@llm/span-labeling/nlp/CompromiseService", () => ({
  extractActionSpans: (...args: unknown[]) => mockExtractActionSpans(...args),
  warmupCompromise: vi.fn(),
  isCompromiseAvailable: vi.fn(),
}));

vi.mock("@llm/span-labeling/nlp/LightingService", () => ({
  extractLightingSpans: (...args: unknown[]) =>
    mockExtractLightingSpans(...args),
  warmupLightingService: vi.fn(),
  isLightingServiceAvailable: vi.fn(),
}));

vi.mock("@llm/span-labeling/nlp/tier2/gliner", () => ({
  extractOpenVocabulary: (...args: unknown[]) =>
    mockExtractOpenVocabulary(...args),
  isGlinerReady: vi.fn(() => true),
  warmupGliner: vi.fn(),
  ALL_GLINER_LABELS: ["person", "location"],
}));

vi.mock("@llm/span-labeling/nlp/filters/sectionHeaders", () => ({
  filterSectionHeaders: (...args: unknown[]) =>
    mockFilterSectionHeaders(...args),
}));

describe("NlpSpanService", () => {
  const setCompromiseEnabled = (enabled: boolean) => {
    (SpanLabelingConfig.COMPROMISE as { ENABLED: boolean }).ENABLED = enabled;
  };

  const setLightingEnabled = (enabled: boolean) => {
    (SpanLabelingConfig.LIGHTING as { ENABLED: boolean }).ENABLED = enabled;
  };

  const setNeuroSymbolicEnabled = (enabled: boolean) => {
    (SpanLabelingConfig.NEURO_SYMBOLIC as { ENABLED: boolean }).ENABLED =
      enabled;
  };

  const setGlinerEnabled = (enabled: boolean) => {
    (SpanLabelingConfig.NEURO_SYMBOLIC.GLINER as { ENABLED: boolean }).ENABLED =
      enabled;
  };

  const originalCompromise = SpanLabelingConfig.COMPROMISE.ENABLED;
  const originalLighting = SpanLabelingConfig.LIGHTING.ENABLED;
  const originalNeuroSymbolic = SpanLabelingConfig.NEURO_SYMBOLIC.ENABLED;
  const originalGliner = SpanLabelingConfig.NEURO_SYMBOLIC.GLINER.ENABLED;

  beforeEach(() => {
    mockExtractClosedVocabulary.mockReset();
    mockExtractActionSpans.mockReset();
    mockExtractLightingSpans.mockReset();
    mockExtractOpenVocabulary.mockReset();
    mockFilterSectionHeaders.mockReset();

    setCompromiseEnabled(true);
    setLightingEnabled(true);
    setNeuroSymbolicEnabled(originalNeuroSymbolic);
    setGlinerEnabled(originalGliner);
  });

  afterEach(() => {
    setCompromiseEnabled(originalCompromise);
    setLightingEnabled(originalLighting);
    setNeuroSymbolicEnabled(originalNeuroSymbolic);
    setGlinerEnabled(originalGliner);
  });

  it("does not invoke GLiNER when neuro-symbolic mode is disabled", async () => {
    const text = "A fast tracking shot through neon rain";

    setNeuroSymbolicEnabled(false);
    setGlinerEnabled(true);

    mockExtractClosedVocabulary.mockReturnValue([] as NlpSpan[]);
    mockExtractActionSpans.mockResolvedValue({
      spans: [] as NlpSpan[],
      stats: { verbPhrases: 0, gerunds: 0, totalExtracted: 0, latencyMs: 0 },
    });
    mockExtractLightingSpans.mockResolvedValue({
      spans: [] as NlpSpan[],
      stats: {
        patternsFound: 0,
        shadowPhrases: 0,
        lightPhrases: 0,
        totalExtracted: 0,
        latencyMs: 0,
      },
    });
    mockExtractOpenVocabulary.mockResolvedValue([
      {
        text: "neon rain",
        start: 27,
        end: 36,
        role: "environment.lighting",
        confidence: 0.9,
        source: "gliner",
      },
    ] as NlpSpan[]);
    mockFilterSectionHeaders.mockImplementation(
      (_text: string, spans: NlpSpan[]) => spans,
    );

    const { extractSemanticSpans } = await import(
      "@llm/span-labeling/nlp/NlpSpanService"
    );
    const result = await extractSemanticSpans(text);

    expect(mockExtractOpenVocabulary).not.toHaveBeenCalled();
    expect(result.stats.openVocabSpans).toBe(0);
  });
});
