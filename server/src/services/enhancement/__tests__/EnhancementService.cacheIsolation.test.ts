import { describe, expect, it, vi } from "vitest";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import type { CacheService } from "@services/cache/CacheService";
import { CategoryGuidanceService } from "@services/video-prompt-analysis/services/guidance/CategoryGuidanceService";
import { EnhancementService } from "../EnhancementService";
import type { BrainstormBuilder, DiversityEnforcer, Suggestion, VideoService } from "../services/types";

vi.mock("@infrastructure/Logger", () => {
  const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
  log.child.mockReturnValue(log);
  return { logger: log };
});

function createService() {
  const execute = vi.fn(async () => ({
    text: JSON.stringify({
      scene_summary: "A traveler waits in a quiet scene.",
      suggestions: ["an astronaut", "an elderly gardener", "a coastal fisherman", "a street musician"].map((text) => ({
        text, category: "subject.identity", explanation: "A visible person in the scene",
      })),
    }),
    metadata: { provider: "groq", model: "openai/gpt-oss-20b" },
  }));
  const aiService = {
    execute,
    getOperationConfig: vi.fn(() => ({ temperature: 0.6, client: "groq", model: "openai/gpt-oss-20b" })),
    resolveExecution: vi.fn(() => ({ client: "groq", provider: "groq", model: "openai/gpt-oss-20b", viaFallback: false })),
  } as unknown as AIExecutionPort;
  const guidance = new CategoryGuidanceService();
  const videoPromptService = {
    detectVideoContext: vi.fn(() => ({
      isVideoPrompt: true, modelTarget: null, promptSection: null,
      highlightWordCount: 2, phraseRole: "mood", videoConstraints: null,
    })),
    getCategoryFocusGuidance: guidance.getCategoryFocusGuidance.bind(guidance),
    countWords: (text: string): number => text.trim().split(/\s+/).filter(Boolean).length,
  } as unknown as VideoService;
  const entries = new Map<string, unknown>();
  const cacheService = {
    getConfig: vi.fn(() => ({ ttl: 60, namespace: "enhancement" })),
    get: vi.fn(async (key: string) => entries.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => { entries.set(key, value); return true; }),
  } as unknown as CacheService;
  const service = new EnhancementService({
    aiService, videoPromptService, cacheService,
    brainstormBuilder: { buildBrainstormSignature: vi.fn(() => null) } as unknown as BrainstormBuilder,
    diversityEnforcer: { filterOriginalEchoes: (suggestions: Suggestion[]) => suggestions } as unknown as DiversityEnforcer,
    enhancementConfig: { policyVersion: "2026-03-v2a" },
  });
  return { service, execute, cacheService };
}

const request = {
  ownerId: "owner-a",
  highlightedText: "quiet atmosphere",
  contextBefore: "A traveler waits beneath ",
  contextAfter: ".",
  fullPrompt: "A traveler waits beneath quiet atmosphere.",
  originalUserPrompt: "A traveler waits.",
  highlightedCategory: "mood",
  editHistory: [{ category: "mood", original: "sameprefix-private-original-A", replacement: "private replacement A" }],
};

describe("EnhancementService ordinary private cache", () => {
  it("reuses complete identical input only for the same owner", async () => {
    const { service, execute, cacheService } = createService();
    const first = await service.getEnhancementSuggestions(request);
    const second = await service.getEnhancementSuggestions({ ...request });
    expect(second.fromCache).toBe(true);
    expect(second.suggestions).toEqual(first.suggestions);
    expect(execute).toHaveBeenCalledTimes(1);
    const key = vi.mocked(cacheService.set).mock.calls[0]?.[0];
    expect(key).toMatch(/^enhancement:private-v3:[a-f0-9]{64}$/);
    expect(key).not.toContain("owner-a");
    expect(key).not.toContain("private replacement");
    expect(JSON.stringify(execute.mock.calls[0])).toContain("private replacement A");
  });

  it("does not share ordinary generation results across owners", async () => {
    const { service, execute, cacheService } = createService();
    await service.getEnhancementSuggestions(request);
    const other = await service.getEnhancementSuggestions({ ...request, ownerId: "owner-b" });
    expect(other.fromCache).not.toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(new Set(vi.mocked(cacheService.set).mock.calls.map(([key]) => key)).size).toBe(2);
  });

  it.each([
    { category: "mood", original: "sameprefix-private-original-A", replacement: "private replacement B" },
    { category: "mood", original: "sameprefix-private-original-B", replacement: "private replacement A" },
  ])("separates private edit values beyond the old lossy fingerprint", async (edit) => {
    const { service, execute, cacheService } = createService();
    await service.getEnhancementSuggestions(request);
    const second = await service.getEnhancementSuggestions({ ...request, editHistory: [edit] });
    expect(second.fromCache).not.toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(execute.mock.calls[1])).toContain(edit.original);
    expect(JSON.stringify(execute.mock.calls[1])).toContain(edit.replacement);
    expect(new Set(vi.mocked(cacheService.set).mock.calls.map(([key]) => key)).size).toBe(2);
  });

  it("preserves legacy generation without reading or writing a shared anonymous cache", async () => {
    const { service, execute, cacheService } = createService();
    const { ownerId: _ownerId, ...ownerless } = request;
    await service.getEnhancementSuggestions(ownerless);
    await service.getEnhancementSuggestions(ownerless);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(cacheService.get).not.toHaveBeenCalled();
    expect(cacheService.set).not.toHaveBeenCalled();
  });
});
