import { describe, expect, it, vi } from "vitest";
import type { CacheService } from "@services/cache/CacheService";
import { EnhancementService } from "../EnhancementService";
import type { SuggestionsTrace } from "@services/observability/SuggestionsTelemetryService";
import type {
  AIService,
  BrainstormBuilder,
  CategoryAligner,
  DiversityEnforcer,
  PromptBuilder,
  ValidationService,
  VideoService,
} from "../services/types";

/**
 * Invariant (cache-hit path): EnhancementService.getEnhancementSuggestions
 * MUST call trace.complete() exactly once with outcome="success" when a
 * cached result is returned. Without this, no `suggestions.completed`
 * PostHog event is emitted, silently breaking the T2V Optimize Health
 * dashboard.
 *
 * This guards the call site at the service (not the route — the route
 * forwards the trace; the service owns lifecycle).
 *
 * Coverage gap: the cache-miss success, validation-empty fallback, and
 * thrown-error terminal paths are NOT covered here because they require
 * driving the full pipeline (aiService.execute, validation, diversity,
 * category alignment) which is heavy to mock. Adding those cases is
 * tracked separately; if you delete a `trace.complete()` from one of
 * those paths this test will not catch it.
 */
describe("EnhancementService telemetry trace lifecycle (regression)", () => {
  function buildHarness(opts: { cachedValue: unknown }) {
    const trace = {
      recordStage: vi.fn(),
      recordCacheHit: vi.fn(),
      recordError: vi.fn(),
      complete: vi.fn(),
    };

    const aiService = {
      getOperationConfig: vi.fn(() => ({ temperature: 0.6 })),
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
    } as unknown as VideoService;

    const brainstormBuilder = {
      buildBrainstormSignature: vi.fn(() => null),
    } as unknown as BrainstormBuilder;

    const promptBuilder = {
      buildPlaceholderPrompt: vi.fn(),
      buildRewritePrompt: vi.fn(),
      buildCustomPrompt: vi.fn(),
    } as unknown as PromptBuilder;

    const validationService = {
      sanitizeSuggestions: vi.fn(),
      groupSuggestionsByCategory: vi.fn(),
    } as unknown as ValidationService;

    const diversityEnforcer = {
      ensureDiverseSuggestions: vi.fn(),
      filterOriginalEchoes: vi.fn(),
    } as unknown as DiversityEnforcer;

    const categoryAligner = {
      enforceCategoryAlignment: vi.fn(),
    } as unknown as CategoryAligner;

    const cacheService = {
      getConfig: vi.fn(() => ({ ttl: 60, namespace: "enhancement" })),
      get: vi.fn(async () => opts.cachedValue),
      set: vi.fn(async () => true),
      generateKey: vi.fn(
        (_namespace: string, params: Record<string, unknown>) =>
          JSON.stringify(params),
      ),
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
    });

    return { service, trace };
  }

  it("calls trace.complete exactly once with outcome='success' on cache hit", async () => {
    const cachedResult = {
      suggestions: [{ text: "a", category: "subject" }],
      isPlaceholder: false,
      hasCategories: true,
      phraseRole: null,
      appliedConstraintMode: null,
      fallbackApplied: false,
    };
    const { service, trace } = buildHarness({ cachedValue: cachedResult });

    await service.getEnhancementSuggestions({
      highlightedText: "x",
      contextBefore: "",
      contextAfter: "",
      fullPrompt: "a wide shot of x",
      originalUserPrompt: "a wide shot of x",
      trace: trace as unknown as SuggestionsTrace,
    });

    expect(trace.complete).toHaveBeenCalledTimes(1);
    const completeArg = trace.complete.mock.calls[0]?.[0] as
      | { outcome?: string; suggestionCount?: number }
      | undefined;
    expect(completeArg?.outcome).toBe("success");
    expect(completeArg?.suggestionCount).toBe(1);
  });
});
