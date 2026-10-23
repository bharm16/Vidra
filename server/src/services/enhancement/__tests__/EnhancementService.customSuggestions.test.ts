import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CacheService } from "@services/cache/CacheService";
import { EnhancementService } from "../EnhancementService";
import type {
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
      metadata: { model: "openai/gpt-oss-20b", provider: "groq" },
    };
  });

  const aiService = {
    getOperationConfig: vi.fn(() => ({
      temperature: 0.6,
      client: "groq",
      model: "openai/gpt-oss-20b",
    })),
    resolveExecution: vi.fn(() => ({
      client: "groq",
      provider: "groq",
      model: "openai/gpt-oss-20b",
      viaFallback: false,
    })),
    execute,
  } as unknown as AIExecutionPort;

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

  const entries = new Map<string, unknown>();
  const cacheService = {
    getConfig: vi.fn(() => ({ ttl: 60, namespace: "enhancement" })),
    get: vi.fn(async (key: string) => entries.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      entries.set(key, value);
      return true;
    }),
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
    cacheService,
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

  const privateRequest = {
    ownerId: "owner-a",
    highlightedText: "the dress",
    customRequest: "make this more cinematic",
    fullPrompt: `A woman walks in the dress. ${"A".repeat(650)} private tail A`,
    contextBefore: "A woman walks in ",
    contextAfter: ".",
    metadata: { spanId: "same-span", constraints: { privateNote: "A" } },
  };
  const modelResult = llmJson([
    { text: "long flowing scarlet gown", category: "subject.appearance" },
    { text: "tailored navy peacoat", category: "subject.appearance" },
    { text: "weathered leather duster", category: "subject.appearance" },
    { text: "minimalist linen tunic", category: "subject.appearance" },
  ]);

  it("reuses identical same-owner custom requests with opaque cache keys", async () => {
    const { service, execute, cacheService } = createService([modelResult]);
    const first = await service.getCustomSuggestions(privateRequest);
    expect(await service.getCustomSuggestions({ ...privateRequest })).toBe(first);
    expect(execute).toHaveBeenCalledTimes(1);
    const key = vi.mocked(cacheService.set).mock.calls[0]?.[0];
    expect(key).toMatch(/^enhancement:private-v3:[a-f0-9]{64}$/);
    expect(key).not.toContain("owner-a");
    expect(key).not.toContain("private tail");
  });

  it.each([
    { ownerId: "owner-b" },
    { fullPrompt: `A woman walks in the dress. ${"A".repeat(650)} private tail B` },
    { metadata: { spanId: "same-span", constraints: { privateNote: "B" } } },
    { contextBefore: "A woman waits in " },
    { contextAfter: " at dusk." },
    { customRequest: "make this historically accurate" },
    { customRequest: "MAKE THIS MORE CINEMATIC" },
  ])("separates complete private custom inputs: %j", async (change) => {
    const { service, execute, cacheService } = createService([modelResult]);
    const first = await service.getCustomSuggestions(privateRequest);
    const second = await service.getCustomSuggestions({ ...privateRequest, ...change });
    expect(second).not.toBe(first);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(new Set(vi.mocked(cacheService.set).mock.calls.map(([key]) => key)).size).toBe(2);
  });

  it("bypasses cache for custom callers without a verified owner", async () => {
    const { service, execute, cacheService } = createService([modelResult]);
    const { ownerId: _ownerId, ...request } = privateRequest;
    await service.getCustomSuggestions(request);
    await service.getCustomSuggestions(request);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(cacheService.get).not.toHaveBeenCalled();
    expect(cacheService.set).not.toHaveBeenCalled();
  });
});
