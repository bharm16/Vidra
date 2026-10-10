import { describe, expect, it, vi } from "vitest";

import { V2CandidateScorer } from "../V2CandidateScorer";
import type {
  EnhancementV2RequestContext,
  SemanticFamily,
  SlotPolicy,
} from "../types";
import type { Suggestion, VideoService } from "../../services/types";

const STUB_VIDEO_PROMPT_SERVICE = {
  countWords: vi.fn(
    (text: string) => text.trim().split(/\s+/).filter(Boolean).length,
  ),
} as unknown as VideoService;

function makeScorer(): V2CandidateScorer {
  return new V2CandidateScorer(STUB_VIDEO_PROMPT_SERVICE);
}

function makePolicy(overrides: Partial<SlotPolicy> = {}): SlotPolicy {
  return {
    categoryId: "subject",
    mode: "guided_llm",
    grammar: { kind: "freeform", minWords: 1, maxWords: 8 },
    targetCount: 6,
    minAcceptableCount: 3,
    requiredFamilies: [],
    forbiddenFamilies: [],
    promptGuidance: "Test policy.",
    scorerWeights: {
      familyFit: 0.45,
      contextFit: 0.25,
      literalness: 0.2,
      overlapPenalty: 0.1,
    },
    ...overrides,
  } as SlotPolicy;
}

function makeContext(
  overrides: Partial<EnhancementV2RequestContext> = {},
): EnhancementV2RequestContext {
  return {
    highlightedText: "x",
    contextBefore: "",
    contextAfter: "",
    fullPrompt: "x",
    originalUserPrompt: "x",
    brainstormContext: null,
    highlightedCategory: null,
    highlightedCategoryConfidence: null,
    isPlaceholder: false,
    isVideoPrompt: true,
    phraseRole: null,
    highlightWordCount: 1,
    videoConstraints: null,
    modelTarget: null,
    promptSection: null,
    spanAnchors: "",
    nearbySpanHints: "",
    lockedSpanCategories: [],
    debug: false,
    ...overrides,
  };
}

function suggestion(text: string, category: string | undefined): Suggestion {
  return category ? { text, category } : { text };
}

function scoreOne(
  policy: SlotPolicy,
  candidate: Suggestion,
  context: EnhancementV2RequestContext = makeContext(),
) {
  const [evaluation] = makeScorer().scoreCandidates(
    [candidate],
    context,
    policy,
  );
  return evaluation!;
}

/**
 * Table-driven exercise of familyToCategoryId via observable scorer behavior.
 * Each SemanticFamily that has a taxonomy mapping should accept a candidate
 * whose self-classified category is the canonical taxonomy id. A regression
 * here (e.g. the previous `split("_").join(".")` mangling that produced
 * `lighting.time.of.day` instead of `lighting.timeOfDay`) would silently
 * cause every required check on those slots to reject correct candidates.
 */
describe("V2CandidateScorer — familyToCategoryId structural mapping", () => {
  const cases: Array<{ family: SemanticFamily; canonicalCategoryId: string }> =
    [
      { family: "action", canonicalCategoryId: "action" },
      { family: "audio", canonicalCategoryId: "audio" },
      { family: "camera_angle", canonicalCategoryId: "camera.angle" },
      { family: "camera_focus", canonicalCategoryId: "camera.focus" },
      { family: "camera_lens", canonicalCategoryId: "camera.lens" },
      { family: "camera_movement", canonicalCategoryId: "camera.movement" },
      {
        family: "environment_context",
        canonicalCategoryId: "environment.context",
      },
      {
        family: "environment_location",
        canonicalCategoryId: "environment.location",
      },
      {
        family: "environment_weather",
        canonicalCategoryId: "environment.weather",
      },
      { family: "lighting_quality", canonicalCategoryId: "lighting.quality" },
      { family: "lighting_source", canonicalCategoryId: "lighting.source" },
      // camelCase taxonomy ids — these regressed under the prior split/join heuristic
      {
        family: "lighting_time_of_day",
        canonicalCategoryId: "lighting.timeOfDay",
      },
      { family: "shot_type", canonicalCategoryId: "shot.type" },
      { family: "style_aesthetic", canonicalCategoryId: "style.aesthetic" },
      { family: "style_color_grade", canonicalCategoryId: "style.colorGrade" },
      { family: "style_film_stock", canonicalCategoryId: "style.filmStock" },
      {
        family: "subject_appearance",
        canonicalCategoryId: "subject.appearance",
      },
      { family: "subject_identity", canonicalCategoryId: "subject.identity" },
      {
        family: "technical_aspect_ratio",
        canonicalCategoryId: "technical.aspectRatio",
      },
      {
        family: "technical_duration",
        canonicalCategoryId: "technical.duration",
      },
      {
        family: "technical_frame_rate",
        canonicalCategoryId: "technical.frameRate",
      },
      {
        family: "technical_resolution",
        canonicalCategoryId: "technical.resolution",
      },
    ];

  for (const { family, canonicalCategoryId } of cases) {
    it(`accepts ${canonicalCategoryId} as required for ${family}`, () => {
      const policy = makePolicy({
        requiredFamilies: [family],
      });
      const result = scoreOne(policy, suggestion("alt", canonicalCategoryId));
      expect(result.reasons).not.toContain("family_miss");
    });
  }

  it("returns null mapping for lighting_direction (no taxonomy equivalent → no-op gate)", () => {
    const policy = makePolicy({
      requiredFamilies: ["lighting_direction"],
    });
    // No-op required gate: even an unrelated candidate category should not be
    // rejected for family_miss — that family has no enforceable mapping.
    const result = scoreOne(policy, suggestion("alt", "subject"));
    expect(result.reasons).not.toContain("family_miss");
  });
});

describe("V2CandidateScorer — required vs forbidden symmetry", () => {
  it("intra-parent siblings do NOT satisfy a required slot (rejects parent-parent fallback)", () => {
    // technical.frameRate must not pass a required technical_aspect_ratio slot
    // just because both share a `technical` parent.
    const policy = makePolicy({
      categoryId: "technical.aspectRatio",
      requiredFamilies: ["technical_aspect_ratio"],
    });
    const result = scoreOne(policy, suggestion("60fps", "technical.frameRate"));
    expect(result.reasons).toContain("family_miss");
  });

  it("intra-parent siblings ARE rejected by forbidden gate (parent-child either direction)", () => {
    // technical.frameRate candidate against forbidden technical_frame_rate
    // should be rejected — direct match through correct camelCase mapping.
    const policy = makePolicy({
      categoryId: "technical.duration",
      requiredFamilies: [],
      forbiddenFamilies: ["technical_frame_rate"],
    });
    const result = scoreOne(policy, suggestion("60fps", "technical.frameRate"));
    expect(result.reasons).toContain("forbidden_family");
  });

  it("parent category satisfies child required family", () => {
    // candidate "subject" (parent) satisfies required "subject.identity" (child)
    const policy = makePolicy({
      requiredFamilies: ["subject_identity"],
    });
    const result = scoreOne(policy, suggestion("the cowboy", "subject"));
    expect(result.reasons).not.toContain("family_miss");
  });

  it("child category satisfies parent required family", () => {
    // candidate "subject.identity" satisfies required "subject" (note: no
    // SemanticFamily called just "subject" exists, but action does as parent).
    const policy = makePolicy({
      requiredFamilies: ["action"],
    });
    const result = scoreOne(policy, suggestion("running", "action.movement"));
    expect(result.reasons).not.toContain("family_miss");
  });

  it("missing candidate category fails required match", () => {
    const policy = makePolicy({
      requiredFamilies: ["subject_identity"],
    });
    const result = scoreOne(policy, suggestion("a girl", undefined));
    expect(result.reasons).toContain("family_miss");
  });
});

describe("V2CandidateScorer — grammar inference from category", () => {
  it("verb_phrase policy accepts an action.movement candidate", () => {
    const policy = makePolicy({
      categoryId: "action.movement",
      grammar: { kind: "verb_phrase", minWords: 1, maxWords: 6 },
    });
    const result = scoreOne(
      policy,
      suggestion("pouring steamed milk", "action.movement"),
    );
    expect(result.reasons).not.toContain("grammar");
  });

  it("time_phrase policy accepts only lighting.timeOfDay candidates", () => {
    const policy = makePolicy({
      categoryId: "lighting.timeOfDay",
      grammar: { kind: "time_phrase", minWords: 1, maxWords: 3 },
    });
    const ok = scoreOne(
      policy,
      suggestion("golden hour", "lighting.timeOfDay"),
    );
    expect(ok.reasons).not.toContain("grammar");

    const wrong = scoreOne(
      policy,
      suggestion("soft tungsten", "lighting.source"),
    );
    expect(wrong.reasons).toContain("grammar");
  });

  it("technical_phrase policy accepts lighting.source (not adjective_phrase)", () => {
    // Regression guard: parent-only `lighting → adjective_phrase` mapping
    // would have rejected lighting.source candidates against a
    // technical_phrase policy. Full-category-id mapping resolves it.
    const policy = makePolicy({
      categoryId: "lighting.source",
      grammar: { kind: "technical_phrase", minWords: 2, maxWords: 6 },
    });
    const result = scoreOne(
      policy,
      suggestion("warm window light", "lighting.source"),
    );
    expect(result.reasons).not.toContain("grammar");
  });

  it("any grammar kind rejects sentence-terminator punctuation", () => {
    const policy = makePolicy({
      grammar: { kind: "freeform", minWords: 1, maxWords: 8 },
    });
    const result = scoreOne(
      policy,
      suggestion("a complete sentence.", "subject"),
    );
    expect(result.reasons).toContain("grammar");
  });
});

describe("V2CandidateScorer — locked-category conflict", () => {
  it("rejects candidate whose category falls into a locked parent", () => {
    const policy = makePolicy({ categoryId: "subject" });
    const context = makeContext({
      highlightedCategory: "subject",
      lockedSpanCategories: ["camera.movement"],
    });
    const result = scoreOne(
      policy,
      suggestion("a dolly forward", "camera.movement"),
      context,
    );
    expect(result.reasons).toContain("locked_conflict");
  });

  it("camera and shot are treated as a compatible pair (no conflict)", () => {
    const policy = makePolicy({ categoryId: "shot.type" });
    const context = makeContext({
      highlightedCategory: "shot.type",
      lockedSpanCategories: ["camera.movement"],
    });
    const result = scoreOne(
      policy,
      suggestion("medium close-up", "shot.type"),
      context,
    );
    expect(result.reasons).not.toContain("locked_conflict");
  });
});
