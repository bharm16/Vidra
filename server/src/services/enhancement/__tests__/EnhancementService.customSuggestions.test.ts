import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CacheService } from "@services/cache/CacheService";
import { EnhancementService } from "../EnhancementService";
import type {
  AIService,
  BrainstormBuilder,
  DiversityEnforcer,
  VideoService,
  Suggestion,
} from "../services/types";

/**
 * Runs the REAL StructuredOutputEnforcer — the scripted aiService port is
 * the only boundary stub. LLM payloads are raw JSON text; prompt-content
 * assertions read what was actually sent to the port.
 */

function llmJson(suggestions: Array<Record<string, unknown>>): string {
  return JSON.stringify({ suggestions });
}

function createService(responses: string[] = []) {
  const execute = vi.fn(async () => {
    const index = Math.min(execute.mock.calls.length - 1, responses.length - 1);
    return {
      text: responses[index] ?? "{}",
      metadata: { model: "llama-3.1-8b-instant", provider: "groq" },
    };
  });

  const aiService = {
    getOperationConfig: vi.fn(() => ({
      temperature: 0.6,
      client: "groq",
      model: "llama-3.1-8b-instant",
    })),
    resolveExecution: vi.fn(() => ({
      client: "groq",
      provider: "groq",
      model: "llama-3.1-8b-instant",
      viaFallback: false,
    })),
    execute,
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
  } as unknown as VideoService;

  const brainstormBuilder = {
    buildBrainstormSignature: vi.fn(() => null),
  } as unknown as BrainstormBuilder;

  const filterOriginalEchoesSpy = vi.fn(
    (suggestions: Suggestion[]) => suggestions,
  );

  const diversityEnforcer = {
    ensureDiverseSuggestions: vi.fn(
      async (suggestions: Suggestion[]) => suggestions,
    ),
    filterOriginalEchoes: filterOriginalEchoesSpy,
  } as unknown as DiversityEnforcer;

  const generateKeySpy = vi.fn(
    (_namespace: string, params: Record<string, unknown>) =>
      JSON.stringify(params),
  );

  const cacheService = {
    getConfig: vi.fn(() => ({ ttl: 60, namespace: "enhancement" })),
    get: vi.fn(async () => null),
    set: vi.fn(async () => true),
    generateKey: generateKeySpy,
  } as unknown as CacheService;

  const service = new EnhancementService({
    aiService,
    videoPromptService,
    brainstormBuilder,
    diversityEnforcer,
    cacheService,
    enhancementConfig: { policyVersion: "2026-03-v2a" },
  });

  return {
    service,
    execute,
    filterOriginalEchoesSpy,
    generateKeySpy,
  };
}

function sentPromptOfCall(
  execute: ReturnType<typeof vi.fn>,
  callIndex: number,
): string {
  return JSON.stringify(execute.mock.calls[callIndex] ?? []);
}

describe("EnhancementService.getCustomSuggestions (V2 routing)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes through V2 engine and applies its post-processing (no legacy buildCustomPrompt call)", async () => {
    const { service, execute, filterOriginalEchoesSpy } = createService([
      llmJson([
        { text: "long flowing scarlet gown", category: "subject.appearance" },
        { text: "long flowing scarlet gown", category: "subject.appearance" },
        { text: "tailored navy peacoat", category: "subject.appearance" },
        { text: "weathered leather duster", category: "subject.appearance" },
        { text: "minimalist linen tunic", category: "subject.appearance" },
      ]),
    ]);

    const result = await service.getCustomSuggestions({
      highlightedText: "the dress",
      customRequest: "make this more cinematic",
      fullPrompt: "A woman walks across the rooftop in the dress at dusk.",
      contextBefore: "A woman walks across the rooftop in ",
      contextAfter: " at dusk.",
    });

    // The V2 engine issued exactly one model call; the legacy
    // CleanPromptBuilder path no longer exists on this service.
    expect(execute).toHaveBeenCalledTimes(1);

    // The prompt that actually reached the port is the V2 custom-mode
    // prompt, steered by the user's request.
    const sentPrompt = sentPromptOfCall(execute, 0);
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
    // Primary call returns 1 unique candidate after V2 dedupe; below
    // CustomPolicy.minAcceptableCount (4) → triggers the single rescue call.
    const { service, execute } = createService([
      llmJson([
        { text: "tailored navy peacoat", category: "subject.appearance" },
      ]),
      llmJson([
        { text: "weathered leather duster", category: "subject.appearance" },
        { text: "minimalist linen tunic", category: "subject.appearance" },
        {
          text: "wool overcoat with brass buttons",
          category: "subject.appearance",
        },
        { text: "vintage tweed blazer", category: "subject.appearance" },
      ]),
    ]);

    const result = await service.getCustomSuggestions({
      highlightedText: "the outfit",
      customRequest: "more grounded and historical",
      fullPrompt: "A traveler walks the rainy alley in the outfit at dawn.",
      contextBefore: "A traveler walks the rainy alley in ",
      contextAfter: " at dawn.",
    });

    expect(execute).toHaveBeenCalledTimes(2);
    // Rescue prompt explicitly references the custom-request frame.
    const rescuePrompt = sentPromptOfCall(execute, 1);
    expect(rescuePrompt).toContain("RESCUE PASS:");
    expect(rescuePrompt).toContain("custom request");
    expect(result.suggestions.length).toBeGreaterThan(1);
  });

  it("partitions cache from the legacy custom-suggestions key shape (engineVersion + policyVersion encoded)", async () => {
    const { service, generateKeySpy } = createService([
      llmJson([
        { text: "tailored navy peacoat", category: "subject.appearance" },
      ]),
    ]);

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
