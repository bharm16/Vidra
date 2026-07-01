import { afterEach, describe, expect, it, vi } from "vitest";

import SpanLabelingConfig from "@llm/span-labeling/config/SpanLabelingConfig.js";
import { extractClosedVocabulary } from "@llm/span-labeling/nlp/tier1/closedVocabulary.js";

const mockDetectInjectionPatterns = vi.hoisted(() => vi.fn());
const mockCreateLlmClient = vi.hoisted(() => vi.fn());
const mockGetCurrentSpanProvider = vi.hoisted(() => vi.fn(() => "groq"));

vi.mock("@utils/SecurityPrompts", () => ({
  detectInjectionPatterns: (text: string) => mockDetectInjectionPatterns(text),
}));

vi.mock("@llm/span-labeling/services/LlmClientFactory.js", () => ({
  createLlmClient: (params: unknown) => mockCreateLlmClient(params),
  getCurrentSpanProvider: () => mockGetCurrentSpanProvider(),
}));

vi.mock("@infrastructure/Logger", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Aho-Corasick + hybrid NLP/LLM coordination", () => {
  const originalFastPath = SpanLabelingConfig.NLP_FAST_PATH.ENABLED;
  const originalNeuroSymbolic = SpanLabelingConfig.NEURO_SYMBOLIC.ENABLED;

  afterEach(() => {
    (SpanLabelingConfig.NLP_FAST_PATH as { ENABLED: boolean }).ENABLED =
      originalFastPath;
    (SpanLabelingConfig.NEURO_SYMBOLIC as { ENABLED: boolean }).ENABLED =
      originalNeuroSymbolic;
    vi.restoreAllMocks();
    mockDetectInjectionPatterns.mockReset();
    mockCreateLlmClient.mockReset();
    mockGetCurrentSpanProvider.mockReset();
  });

  it("matches repeated closed-vocabulary terms case-insensitively", () => {
    const text = "PAN then pan, then Pan again.";
    const spans = extractClosedVocabulary(text);
    const panMatches = spans.filter(
      (span) => span.text.toLowerCase() === "pan",
    );

    expect(panMatches.length).toBeGreaterThanOrEqual(3);
  });

  it("does not match closed-vocabulary terms inside larger words", () => {
    const text = "panorama companion panning megapanel";
    const spans = extractClosedVocabulary(text);
    const exactPan = spans.filter((span) => span.text.toLowerCase() === "pan");

    expect(exactPan).toHaveLength(0);
  });

  it("accepts punctuation boundaries for closed-vocabulary terms", () => {
    const text = "Pan, tilt; zoom.";
    const spans = extractClosedVocabulary(text);

    const hasPan = spans.some((span) => span.text.toLowerCase() === "pan");
    const hasTilt = spans.some((span) => span.text.toLowerCase() === "tilt");
    const hasZoom = spans.some((span) => span.text.toLowerCase() === "zoom");

    expect(hasPan).toBe(true);
    expect(hasTilt).toBe(true);
    expect(hasZoom).toBe(true);
  });

  it("falls back to LLM when long-prompt NLP output is insufficient", async () => {
    (SpanLabelingConfig.NLP_FAST_PATH as { ENABLED: boolean }).ENABLED = true;
    (SpanLabelingConfig.NEURO_SYMBOLIC as { ENABLED: boolean }).ENABLED = false;

    mockDetectInjectionPatterns.mockReturnValue({
      hasPatterns: false,
      patterns: [],
    });
    mockGetCurrentSpanProvider.mockReturnValue("groq");

    const nlpService = await import("@llm/span-labeling/nlp/NlpSpanService.js");
    const spanValidator = await import(
      "@llm/span-labeling/validation/SpanValidator.js"
    );

    vi.spyOn(nlpService, "extractKnownSpans").mockReturnValue([
      { text: "shot", start: 0, end: 4, role: "shot.type", confidence: 0.3 },
    ]);
    vi.spyOn(spanValidator, "validateSpans").mockReturnValue({
      ok: true,
      verdict: "pass" as const,
      errors: [],
      result: {
        spans: [{ text: "shot", role: "shot.type", confidence: 0.3 }],
        meta: { version: "v1", notes: "nlp candidate" },
      },
    });

    const getSpans = vi.fn().mockResolvedValue({
      spans: [
        {
          text: "cinematic movement",
          role: "camera.movement",
          start: 10,
          end: 28,
          confidence: 0.9,
        },
      ],
      meta: { version: "v1", notes: "llm fallback" },
    });
    mockCreateLlmClient.mockReturnValue({ getSpans });

    const { labelSpans } = await import(
      "@llm/span-labeling/SpanLabelingService.js"
    );
    const longPrompt = Array.from(
      { length: 120 },
      (_, index) => `word${index}`,
    ).join(" ");

    const result = await labelSpans({ text: longPrompt }, {
      getOperationConfig: () => ({ model: "gpt-4o-mini" }),
      execute: async () => ({}),
    } as never);

    expect(getSpans).toHaveBeenCalledOnce();
    expect(mockCreateLlmClient).toHaveBeenCalledWith({
      operation: "span_labeling",
      model: "gpt-4o-mini",
    });
    expect(result.meta.notes).toContain("llm fallback");
  });
});
