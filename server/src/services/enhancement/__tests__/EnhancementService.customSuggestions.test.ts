import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CacheService } from "@services/cache/CacheService";
import { EnhancementService } from "../EnhancementService";
import type {
  AIService,
  BrainstormBuilder,
  CategoryAligner,
  DiversityEnforcer,
  PromptBuilder,
  ValidationService,
  VideoService,
  Suggestion,
} from "../services/types";

const mockEnforceJSON = vi.hoisted(() => vi.fn());
const mockCacheGet = vi.hoisted(() => vi.fn(async () => null));
const mockCacheSet = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@utils/StructuredOutputEnforcer", () => ({
  StructuredOutputEnforcer: {
    enforceJSON: mockEnforceJSON,
  },
}));

function createService() {
  const aiService = {
    getOperationConfig: vi.fn(() => ({
      temperature: 0.6,
      client: "groq",
      model: "llama-3.1-8b-instant",
    })),
    execute: vi.fn(),
  } as unknown as AIService;

  const videoPromptService = {
    isVideoPrompt: vi.fn(() => true),
    countWords: vi.fn(
      (text: string) => text.trim().split(/\s+/).filter(Boolean).length,
    ),
    detectVideoPhraseRole: vi.fn(() => null),
    getVideoReplacementConstraints: vi.fn(() => null),
    detectTargetModel: vi.fn(() => null),
    detectPromptSection: vi.fn(() => null),
    getCategoryFocusGuidance: vi.fn(() => []),
    getVideoFallbackConstraints: vi.fn(() => null),
  } as unknown as VideoService;

  const brainstormBuilder = {
    buildBrainstormSignature: vi.fn(() => null),
  } as unknown as BrainstormBuilder;

  const promptBuilder = {
    buildPlaceholderPrompt: vi.fn(),
    buildRewritePrompt: vi.fn(),
    buildCustomPrompt: vi.fn(() => "legacy custom prompt (should NOT be used)"),
  } as unknown as PromptBuilder;

  const validationService = {
    sanitizeSuggestions: vi.fn((suggestions: Suggestion[]) => suggestions),
    groupSuggestionsByCategory: vi.fn(() => []),
    validateSuggestions: vi.fn((suggestions: Suggestion[]) => suggestions),
  } as unknown as ValidationService;

  const filterOriginalEchoesSpy = vi.fn(
    (suggestions: Suggestion[]) => suggestions,
  );

  const diversityEnforcer = {
    ensureDiverseSuggestions: vi.fn(
      async (suggestions: Suggestion[]) => suggestions,
    ),
    filterOriginalEchoes: filterOriginalEchoesSpy,
  } as unknown as DiversityEnforcer;

  const categoryAligner = {
    enforceCategoryAlignment: vi.fn((suggestions: Suggestion[]) => ({
      suggestions,
      fallbackApplied: false,
      context: {},
    })),
  } as unknown as CategoryAligner;

  const generateKeySpy = vi.fn(
    (_namespace: string, params: Record<string, unknown>) =>
      JSON.stringify(params),
  );

  const cacheService = {
    getConfig: vi.fn(() => ({ ttl: 60, namespace: "enhancement" })),
    get: mockCacheGet,
    set: mockCacheSet,
    generateKey: generateKeySpy,
  } as unknown as CacheService;

  const service = new EnhancementService({
    aiService,
    videoPromptService,
    brainstormBuilder,
    promptBuilder,
    validationService,
    diversityEnforcer,
    categoryAligner,
    cacheService,
    enhancementConfig: { policyVersion: "2026-03-v2a" },
  });

  return {
    service,
    promptBuilder,
    filterOriginalEchoesSpy,
    generateKeySpy,
  };
}

describe("EnhancementService.getCustomSuggestions (V2 routing)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  it("routes through V2 engine and applies its post-processing (no legacy buildCustomPrompt call)", async () => {
    const { service, promptBuilder, filterOriginalEchoesSpy } = createService();

    mockEnforceJSON.mockResolvedValueOnce({
      value: [
        { text: "long flowing scarlet gown", category: "subject.appearance" },
        { text: "long flowing scarlet gown", category: "subject.appearance" },
        { text: "tailored navy peacoat", category: "subject.appearance" },
        { text: "weathered leather duster", category: "subject.appearance" },
        { text: "minimalist linen tunic", category: "subject.appearance" },
      ],
      siblings: {},
    });

    const result = await service.getCustomSuggestions({
      highlightedText: "the dress",
      customRequest: "make this more cinematic",
      fullPrompt: "A woman walks across the rooftop in the dress at dusk.",
      contextBefore: "A woman walks across the rooftop in ",
      contextAfter: " at dusk.",
    });

    // The V2 engine was invoked exactly once. The legacy CleanPromptBuilder
    // path is no longer reachable from this method.
    expect(mockEnforceJSON).toHaveBeenCalledTimes(1);
    expect(promptBuilder.buildCustomPrompt).not.toHaveBeenCalled();

    // The prompt sent to the LLM is the V2 custom-mode prompt (steered by
    // the user's request), not the legacy one.
    const [, sentPrompt] = mockEnforceJSON.mock.calls[0]!;
    expect(sentPrompt).toContain(
      "<custom_request>make this more cinematic</custom_request>",
    );
    expect(sentPrompt).not.toContain("legacy custom prompt");

    // V2's diversity filter (filterOriginalEchoes) is part of the pipeline.
    expect(filterOriginalEchoesSpy).toHaveBeenCalled();

    // Duplicate texts are deduped by V2's _dedupeByText.
    const texts = result.suggestions.map((item) => item.text);
    expect(new Set(texts).size).toBe(texts.length);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("invokes the V2 rescue pass when too few candidates survive scoring", async () => {
    const { service } = createService();

    // Primary call returns 1 unique candidate after V2 dedupe; below
    // CustomPolicy.minAcceptableCount (4) → triggers the single rescue call.
    mockEnforceJSON
      .mockResolvedValueOnce({
        value: [
          { text: "tailored navy peacoat", category: "subject.appearance" },
        ],
        siblings: {},
      })
      .mockResolvedValueOnce({
        value: [
          { text: "weathered leather duster", category: "subject.appearance" },
          { text: "minimalist linen tunic", category: "subject.appearance" },
          {
            text: "wool overcoat with brass buttons",
            category: "subject.appearance",
          },
          { text: "vintage tweed blazer", category: "subject.appearance" },
        ],
        siblings: {},
      });

    const result = await service.getCustomSuggestions({
      highlightedText: "the outfit",
      customRequest: "more grounded and historical",
      fullPrompt: "A traveler walks the rainy alley in the outfit at dawn.",
      contextBefore: "A traveler walks the rainy alley in ",
      contextAfter: " at dawn.",
    });

    expect(mockEnforceJSON).toHaveBeenCalledTimes(2);
    // Rescue prompt explicitly references the custom-request frame.
    const [, rescuePrompt] = mockEnforceJSON.mock.calls[1]!;
    expect(rescuePrompt).toContain("RESCUE PASS:");
    expect(rescuePrompt).toContain("custom request");
    expect(result.suggestions.length).toBeGreaterThan(1);
  });

  it("partitions cache from the legacy custom-suggestions key shape (engineVersion + policyVersion encoded)", async () => {
    const { service, generateKeySpy } = createService();

    mockEnforceJSON.mockResolvedValue({
      value: [
        { text: "tailored navy peacoat", category: "subject.appearance" },
      ],
      siblings: {},
    });

    await service.getCustomSuggestions({
      highlightedText: "the dress",
      customRequest: "more cinematic",
      fullPrompt: "Walking the rooftop in the dress.",
    });

    expect(generateKeySpy).toHaveBeenCalled();
    const [, params] = generateKeySpy.mock.calls[0]!;
    expect(params).toMatchObject({
      engineVersion: "v2",
      mode: "custom",
      policyVersion: "2026-03-v2a",
    });
  });
});
