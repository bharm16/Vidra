import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnhancementV2Engine } from "../EnhancementV2Engine";
import type { EnhancementV2RequestContext } from "../types";
import type {
  AIService,
  DiversityEnforcer,
  VideoService,
} from "../../services/types";

const mockEnforceJSON = vi.hoisted(() => vi.fn());

vi.mock("@utils/StructuredOutputEnforcer", () => ({
  StructuredOutputEnforcer: {
    enforceJSON: mockEnforceJSON,
  },
}));

function createContext(
  overrides: Partial<EnhancementV2RequestContext> = {},
): EnhancementV2RequestContext {
  return {
    highlightedText: "eye-level",
    contextBefore: "A cinematic portrait in soft rain, ",
    contextAfter: ", at dusk.",
    fullPrompt: "A cinematic portrait in soft rain, eye-level, at dusk.",
    originalUserPrompt: "portrait in rain",
    brainstormContext: null,
    highlightedCategory: "camera.angle",
    highlightedCategoryConfidence: 0.96,
    isPlaceholder: false,
    isVideoPrompt: true,
    phraseRole: "camera.angle",
    highlightWordCount: 1,
    videoConstraints: {
      minWords: 1,
      maxWords: 6,
      maxSentences: 1,
      mode: "concise",
    },
    modelTarget: "sora-2",
    promptSection: "main",
    spanAnchors: '- subject: "portrait"\n- lighting: "soft rain"',
    nearbySpanHints: '- environment: "dusk"',
    lockedSpanCategories: [],
    focusGuidance: ["Keep the subject readable"],
    debug: true,
    ...overrides,
  };
}

function createEngine() {
  const aiService = {
    getOperationConfig: vi.fn(() => ({
      temperature: 0.7,
      client: "groq",
    })),
    execute: vi.fn(),
  } as unknown as AIService;

  const videoPromptService = {
    countWords: vi.fn(
      (text: string) => text.trim().split(/\s+/).filter(Boolean).length,
    ),
  } as unknown as VideoService;

  const diversityEnforcer = {
    filterOriginalEchoes: vi.fn((suggestions) => suggestions),
  } as unknown as DiversityEnforcer;

  return new EnhancementV2Engine({
    aiService,
    videoPromptService,
    diversityEnforcer,
    policyVersion: "2026-03-v2a",
  });
}

describe("EnhancementV2Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses enumerated generation for rigid categories without model calls", async () => {
    const engine = createEngine();

    const execution = await engine.execute(
      createContext({
        highlightedText: "eye-level",
        highlightedCategory: "camera.angle",
        phraseRole: "camera.angle",
      }),
    );

    expect(mockEnforceJSON).not.toHaveBeenCalled();
    expect(execution.debug.mode).toBe("enumerated");
    expect(execution.debug.modelCallCount).toBe(0);
    expect(execution.finalSuggestions.length).toBeGreaterThan(0);
    expect(
      execution.finalSuggestions.map((item) => item.text.toLowerCase()),
    ).not.toContain("eye-level");
  });

  it("uses templated generation for camera movement and blocks invalid combinations", async () => {
    const engine = createEngine();

    const execution = await engine.execute(
      createContext({
        highlightedText: "tracking",
        highlightedCategory: "camera.movement",
        phraseRole: "camera.movement",
        contextBefore: "A runner moves through smoke, ",
        contextAfter: ", under neon lights.",
        fullPrompt:
          "A runner moves through smoke, tracking, under neon lights.",
      }),
    );

    expect(mockEnforceJSON).not.toHaveBeenCalled();
    expect(execution.debug.mode).toBe("templated");
    expect(execution.debug.modelCallCount).toBe(0);

    const texts = execution.finalSuggestions.map((item) =>
      item.text.toLowerCase(),
    );
    expect(
      texts.some((text) =>
        /static\s+(forward|backward|lateral|upward|downward)/.test(text),
      ),
    ).toBe(false);
    expect(texts.some((text) => /handheld locked-off frame/.test(text))).toBe(
      false,
    );
  });

  it("uses a single rescue call for guided LLM policies when too few candidates survive scoring", async () => {
    const engine = createEngine();
    // Engine now calls enforceJSON with captureSiblings:true on the
    // enhancement path, so the mock returns { value, siblings } per
    // the new contract (Sub-project B).
    mockEnforceJSON
      .mockResolvedValueOnce({
        value: [
          { text: "poetic hush of rain", category: "environment.weather" },
          { text: "gentle morning drizzle", category: "environment.weather" },
        ],
        siblings: {
          scene_summary: "weather scene — keep precipitation theme",
        },
      })
      .mockResolvedValueOnce({
        value: [
          {
            text: "heavy snowfall under grey skies",
            category: "environment.weather",
          },
          { text: "wind-driven rain curtain", category: "environment.weather" },
        ],
        siblings: {
          scene_summary: "weather scene — keep precipitation theme",
        },
      });

    const execution = await engine.execute(
      createContext({
        highlightedText: "soft rain",
        highlightedCategory: "environment.weather",
        phraseRole: "environment.weather",
        contextBefore: "A couple walks through ",
        contextAfter: " beside the diner.",
        fullPrompt: "A couple walks through soft rain beside the diner.",
      }),
    );

    expect(mockEnforceJSON).toHaveBeenCalledTimes(2);
    expect(execution.debug.mode).toBe("guided_llm");
    expect(execution.debug.modelCallCount).toBe(2);
    expect(execution.finalSuggestions.length).toBeGreaterThanOrEqual(3);
    // Rescue triggers from candidate-count shortfall (primary returned 2,
    // minAcceptableCount=3), not from rejection-driven shortfall — the
    // V2CandidateScorer no longer carries an "abstract" wordlist gate.
  });

  describe("scene_summary capture (Sub-project B)", () => {
    it("puts scene_summary onto execution.debug.sceneSummary when the LLM emits it", async () => {
      const engine = createEngine();
      mockEnforceJSON.mockResolvedValueOnce({
        value: [
          {
            text: "heavy snowfall under grey skies",
            category: "environment.weather",
          },
          { text: "wind-driven rain curtain", category: "environment.weather" },
          {
            text: "torrential downpour at dawn",
            category: "environment.weather",
          },
        ],
        siblings: {
          scene_summary: "outdoor weather scene — keep precipitation theme",
        },
      });

      const execution = await engine.execute(
        createContext({
          highlightedText: "soft rain",
          highlightedCategory: "environment.weather",
          phraseRole: "environment.weather",
          contextBefore: "A couple walks through ",
          contextAfter: " beside the diner.",
          fullPrompt: "A couple walks through soft rain beside the diner.",
        }),
      );

      expect(execution.debug.sceneSummary).toBe(
        "outdoor weather scene — keep precipitation theme",
      );
      expect(execution.finalSuggestions.length).toBeGreaterThan(0);
    });

    it("tolerates missing scene_summary in the LLM response (sceneSummary = null, no crash)", async () => {
      const engine = createEngine();
      mockEnforceJSON.mockResolvedValueOnce({
        value: [
          {
            text: "heavy snowfall under grey skies",
            category: "environment.weather",
          },
          { text: "wind-driven rain curtain", category: "environment.weather" },
          {
            text: "torrential downpour at dawn",
            category: "environment.weather",
          },
        ],
        siblings: {},
      });

      const execution = await engine.execute(
        createContext({
          highlightedText: "soft rain",
          highlightedCategory: "environment.weather",
          phraseRole: "environment.weather",
          contextBefore: "A couple walks through ",
          contextAfter: " beside the diner.",
          fullPrompt: "A couple walks through soft rain beside the diner.",
        }),
      );

      expect(execution.debug.sceneSummary).toBeNull();
      expect(execution.finalSuggestions.length).toBeGreaterThan(0);
    });
  });

  describe("scene_summary capture on custom-request path (Sub-project B2)", () => {
    it("captures scene_summary from siblings when present on custom requests", async () => {
      const engine = createEngine();
      mockEnforceJSON.mockResolvedValueOnce({
        value: [
          { text: "dreamlike haze of mist" },
          { text: "soft veil of drizzle" },
          { text: "silken curtain of rain" },
          { text: "luminous downpour at dusk" },
          { text: "gentle whisper of evening rain" },
        ],
        siblings: {
          scene_summary:
            "diner exterior, dusk, atmospheric romance — keep weather literal",
        },
      });

      const execution = await engine.execute(
        createContext({
          highlightedText: "soft rain",
          highlightedCategory: "environment.weather",
          phraseRole: "environment.weather",
          contextBefore: "A couple walks through ",
          contextAfter: " beside the diner.",
          fullPrompt: "A couple walks through soft rain beside the diner.",
          customRequest: "make it sound dreamier and more romantic",
        }),
      );

      expect(execution.debug.sceneSummary).toBe(
        "diner exterior, dusk, atmospheric romance — keep weather literal",
      );
      expect(execution.finalSuggestions.length).toBeGreaterThan(0);
    });

    it("returns sceneSummary: null on custom-request path when siblings absent (back-compat)", async () => {
      const engine = createEngine();
      mockEnforceJSON.mockResolvedValueOnce({
        value: [
          { text: "dreamlike haze of mist" },
          { text: "soft veil of drizzle" },
          { text: "silken curtain of rain" },
          { text: "luminous downpour at dusk" },
          { text: "gentle whisper of evening rain" },
        ],
        siblings: {},
      });

      const execution = await engine.execute(
        createContext({
          highlightedText: "soft rain",
          highlightedCategory: "environment.weather",
          phraseRole: "environment.weather",
          contextBefore: "A couple walks through ",
          contextAfter: " beside the diner.",
          fullPrompt: "A couple walks through soft rain beside the diner.",
          customRequest: "make it sound dreamier and more romantic",
        }),
      );

      expect(execution.debug.sceneSummary).toBeNull();
      expect(execution.finalSuggestions.length).toBeGreaterThan(0);
    });
  });
});
