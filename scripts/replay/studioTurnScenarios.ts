/**
 * Studio M3 conversation-policy scenario pack (behaviors 1, 2, 3, 9).
 *
 * Shared by scripts/replay/record-studio-scenarios.ts (records live
 * gpt-4o-mini decisions into server/src/replay/fixtures/studio-turn/) and
 * the replay unit test (which re-runs the SAME contexts against the
 * cassette with zero network). Sharing one definition is what keeps the
 * prompts byte-identical, so the replay request keys hit the recording.
 *
 * Expectations are structural invariants of the behaviors — never exact
 * LLM prose. `verify` returns violations; empty array = pass.
 */

import { StudioModelRegistry } from "../../server/src/services/studio/StudioModelRegistry.ts";
import type { StudioTurnContext } from "../../server/src/services/studio/StudioPolicyEngine.ts";
import type {
  StudioDecision,
  StudioTurnRecord,
} from "../../server/src/services/studio/types.ts";

export const STUDIO_TURN_SURFACE = "studio-turn" as const;
export const STUDIO_TURN_SCENARIO = "m3-behaviors" as const;

const registry = new StudioModelRegistry();

/**
 * M3's executable sets, mirroring StudioService: clarify is
 * first-message-only, so scenarios with history use the follow-up set.
 */
const FIRST_TURN_ACTIONS = [
  "clarify",
  "generate",
  "diagnose",
  "negotiate",
] as const satisfies readonly StudioDecision["action"][];

const FOLLOW_UP_ACTIONS = [
  "generate",
  "edit",
  "transform",
  "diagnose",
  "negotiate",
] as const satisfies readonly StudioDecision["action"][];

/**
 * Shared content words (len > 4, punctuation stripped — no regex, house
 * rule) between two texts. The M4 derivation assertion: a refinement's
 * basePrompt must carry the selected image's concept forward.
 */
export function contentWordOverlap(a: string, b: string): number {
  const words = (text: string): Set<string> =>
    new Set(
      text
        .toLowerCase()
        .split(" ")
        .map((word) =>
          [...word]
            .filter((ch) => "abcdefghijklmnopqrstuvwxyz0123456789".includes(ch))
            .join(""),
        )
        .filter((word) => word.length > 4),
    );
  const aWords = words(a);
  let overlap = 0;
  for (const word of words(b)) {
    if (aWords.has(word)) overlap += 1;
  }
  return overlap;
}

const SPECIFIC_REQUEST =
  "A minimal geometric fox logo for a coffee brand called Ember & Oak — flat vector style, warm orange and brown palette, must stay legible at app-icon size";

/** Deterministic prior turn for the follow-up scenario. */
const PRIOR_FOX_TURN: StudioTurnRecord = {
  id: "turn-prior-1",
  projectId: "replay-project",
  userId: "replay-user",
  status: "complete",
  userMessage: SPECIFIC_REQUEST,
  decision: {
    action: "generate",
    basePrompt:
      "Minimal geometric fox logo for coffee brand Ember & Oak, flat vector, warm orange and brown palette, app-icon legible",
    variants: [
      "Minimal geometric fox head logo built from clean triangles, flat vector, warm orange with brown accents, centered on white, app-icon legible",
      "Origami-style fox logo for a coffee brand, flat vector, ember-orange gradient panels, dark brown outline, simple silhouette",
      "Negative-space fox face inside a rounded coffee-bean shape, flat vector, two-tone orange and brown, minimal detail",
      "Circular badge logo with a geometric fox and space for the Ember & Oak wordmark, flat vector, warm autumn palette",
    ],
    capability: "design",
    suggestions: [
      "Put the fox inside a circular badge",
      "Try a monochrome espresso palette",
      "Add the Ember & Oak wordmark",
    ],
    title: "Ember & Oak Fox Logo",
  },
  resolvedModel: "recraft-v4.1",
  calls: [0, 1, 2, 3].map((index) => ({
    index,
    status: "succeeded" as const,
    image: {
      id: `img-fox-${index}`,
      storagePath: `users/replay-user/previews/images/fox-${index}.webp`,
      sourcePrompt: `variant-${index}`,
      model: "recraft-v4.1" as const,
    },
  })),
  reservedCents: 16,
  refundedCents: 0,
  createdAtMs: 1_753_000_000_000,
  updatedAtMs: 1_753_000_060_000,
};

// Full source prompts belong on the images the LLM may reference.
for (const call of PRIOR_FOX_TURN.calls) {
  if (call.image && PRIOR_FOX_TURN.decision.action === "generate") {
    call.image.sourcePrompt =
      PRIOR_FOX_TURN.decision.variants[call.index] ?? call.image.sourcePrompt;
  }
}

function baseContext(overrides: Partial<StudioTurnContext>): StudioTurnContext {
  const context: StudioTurnContext = {
    userMessage: "",
    projectTitle: "Untitled",
    pinnedModel: null,
    roster: registry.listModels(),
    history: [],
    selectedImageId: null,
    projectImageIds: new Set<string>(),
    allowedActions: FIRST_TURN_ACTIONS,
    ...overrides,
  };
  // Mirror StudioService: clarify is first-message-only.
  if (context.history.length > 0) {
    context.allowedActions = FOLLOW_UP_ACTIONS;
  }
  return context;
}

/** Variant 2's image — the one "selected" in the M4 routing scenarios. */
export const SELECTED_IMAGE_ID = "img-fox-2";

export const SELECTED_SOURCE_PROMPT = (() => {
  const decision = PRIOR_FOX_TURN.decision;
  if (decision.action !== "generate") throw new Error("fixture shape");
  return decision.variants[2];
})();

function foxImageIds(): Set<string> {
  return new Set(
    PRIOR_FOX_TURN.calls.flatMap((call) => (call.image ? [call.image.id] : [])),
  );
}

/** The titled fox project with variant 2 selected — M4's routing stage. */
function foxProjectContext(
  userMessage: string,
  overrides?: Partial<StudioTurnContext>,
): StudioTurnContext {
  return baseContext({
    userMessage,
    projectTitle: "Ember & Oak Fox Logo",
    history: [PRIOR_FOX_TURN],
    selectedImageId: SELECTED_IMAGE_ID,
    projectImageIds: foxImageIds(),
    ...overrides,
  });
}

export interface StudioTurnScenario {
  name: string;
  /** Which numbered product behaviors this scenario exercises. */
  behaviors: string;
  context: StudioTurnContext;
  verify: (decision: StudioDecision) => string[];
}

export const STUDIO_TURN_SCENARIOS: StudioTurnScenario[] = [
  {
    name: "vague-first-message-clarifies",
    behaviors: "behavior 1 (clarify with quick picks)",
    context: baseContext({ userMessage: "make me a logo" }),
    verify: (decision) => {
      const violations: string[] = [];
      if (decision.action !== "clarify") {
        violations.push(`expected clarify, got ${decision.action}`);
        return violations;
      }
      if (decision.questions.length < 1 || decision.questions.length > 2) {
        violations.push(
          `expected 1-2 questions, got ${decision.questions.length}`,
        );
      }
      for (const question of decision.questions) {
        if (question.quickPicks.length < 3 || question.quickPicks.length > 4) {
          violations.push(
            `question "${question.text}" has ${question.quickPicks.length} quick picks (want 3-4)`,
          );
        }
      }
      return violations;
    },
  },
  {
    name: "specific-first-message-generates",
    behaviors: "behaviors 2, 3, 8 (4 variants, suggestions, title)",
    context: baseContext({ userMessage: SPECIFIC_REQUEST }),
    verify: (decision) => {
      const violations: string[] = [];
      if (decision.action !== "generate") {
        violations.push(`expected generate, got ${decision.action}`);
        return violations;
      }
      if (new Set(decision.variants).size !== 4) {
        violations.push("expected 4 distinct variants");
      }
      if (!decision.title) {
        violations.push("expected a title on the first generation");
      }
      if (decision.capability !== "design" && decision.capability !== "svg") {
        violations.push(
          `logo work should hint design/svg, got ${decision.capability}`,
        );
      }
      if (new Set(decision.suggestions).size !== 3) {
        violations.push("expected 3 distinct suggestions");
      }
      return violations;
    },
  },
  {
    name: "follow-up-never-reclarifies",
    behaviors: "behaviors 1 + basePrompt maintenance (rewrite, don't append)",
    context: baseContext({
      userMessage: "make it more playful",
      projectTitle: "Ember & Oak Fox Logo",
      history: [PRIOR_FOX_TURN],
      projectImageIds: new Set(
        PRIOR_FOX_TURN.calls.flatMap((call) =>
          call.image ? [call.image.id] : [],
        ),
      ),
    }),
    verify: (decision) => {
      const violations: string[] = [];
      if (decision.action !== "generate") {
        violations.push(
          `follow-up must generate (never re-clarify), got ${decision.action}`,
        );
        return violations;
      }
      if (!decision.basePrompt.trim()) {
        violations.push("expected a rewritten basePrompt");
      }
      if (new Set(decision.variants).size !== 4) {
        violations.push("expected 4 distinct variants");
      }
      return violations;
    },
  },
  {
    name: "pinned-model-context-generates",
    behaviors: "behavior 9 (pin honored; capability hint still emitted)",
    context: baseContext({
      userMessage: SPECIFIC_REQUEST,
      pinnedModel: registry.getModel("recraft-v4.1-pro"),
    }),
    verify: (decision) => {
      const violations: string[] = [];
      if (decision.action !== "generate") {
        violations.push(`expected generate, got ${decision.action}`);
        return violations;
      }
      if (!decision.capability) {
        violations.push("capability hint must be present even when pinned");
      }
      return violations;
    },
  },
  {
    name: "selected-small-change-edits",
    behaviors: "behavior 6 (small change to a liked image → edit it)",
    context: foxProjectContext("make it bolder"),
    verify: (decision) => {
      const violations: string[] = [];
      if (decision.action !== "edit") {
        violations.push(
          `a small change to the selected image must edit, got ${decision.action}`,
        );
        return violations;
      }
      if (!decision.sourceImageIds.includes(SELECTED_IMAGE_ID)) {
        violations.push(
          `edit must source the selected image ${SELECTED_IMAGE_ID}, got [${decision.sourceImageIds.join(", ")}]`,
        );
      }
      return violations;
    },
  },
  {
    name: "selected-more-options-generates-from-source",
    behaviors:
      "behavior 6 (more variations → generate seeded from the selection's source prompt)",
    context: foxProjectContext("give me more options like this one"),
    verify: (decision) => {
      const violations: string[] = [];
      if (decision.action !== "generate") {
        violations.push(
          `more variations must generate, got ${decision.action}`,
        );
        return violations;
      }
      if (contentWordOverlap(SELECTED_SOURCE_PROMPT, decision.basePrompt) < 2) {
        violations.push(
          `basePrompt must derive from the selected image's source prompt ("${SELECTED_SOURCE_PROMPT}"), got "${decision.basePrompt}"`,
        );
      }
      return violations;
    },
  },
  {
    name: "selected-new-concept-generates",
    behaviors: "behavior 6 (a new direction → generate, never an edit)",
    context: foxProjectContext("try a completely different concept"),
    verify: (decision) => {
      const violations: string[] = [];
      if (decision.action !== "generate") {
        violations.push(
          `a new direction must generate, got ${decision.action}`,
        );
        return violations;
      }
      if (new Set(decision.variants).size !== 4) {
        violations.push("expected 4 distinct variants");
      }
      return violations;
    },
  },
  {
    name: "rejection-diagnoses",
    behaviors: "behavior 5 (rejection → diagnose what's wrong)",
    context: baseContext({
      userMessage: "I don't like any of these",
      projectTitle: "Ember & Oak Fox Logo",
      history: [PRIOR_FOX_TURN],
      projectImageIds: foxImageIds(),
    }),
    verify: (decision) => {
      const violations: string[] = [];
      if (decision.action !== "diagnose") {
        violations.push(`rejection must diagnose, got ${decision.action}`);
        return violations;
      }
      if (decision.quickPicks.length < 3) {
        violations.push(
          `diagnose needs preset answers, got ${decision.quickPicks.length}`,
        );
      }
      return violations;
    },
  },
  {
    name: "rejection-answer-forks",
    behaviors:
      "behavior 5 (an answered what's-wrong never repeats; fork or refine)",
    context: baseContext({
      userMessage: "Color",
      projectTitle: "Ember & Oak Fox Logo",
      history: [
        PRIOR_FOX_TURN,
        {
          id: "turn-diagnose-1",
          projectId: "replay-project",
          userId: "replay-user",
          status: "complete",
          userMessage: "I don't like any of these",
          decision: {
            action: "diagnose",
            question: "What's wrong with the results?",
            quickPicks: ["Shape", "Color", "Layout", "Overall feel"],
          },
          calls: [],
          reservedCents: 0,
          refundedCents: 0,
          createdAtMs: 1_753_000_120_000,
          updatedAtMs: 1_753_000_120_000,
        },
      ],
      projectImageIds: foxImageIds(),
    }),
    verify: (decision) => {
      const violations: string[] = [];
      if (
        decision.action === "diagnose" &&
        decision.question.trim().toLowerCase() ===
          "what's wrong with the results?"
      ) {
        violations.push("repeated the already-answered what's-wrong question");
        return violations;
      }
      if (!["generate", "edit", "diagnose"].includes(decision.action)) {
        violations.push(
          `expected a refinement or the keep/new-direction fork, got ${decision.action}`,
        );
      }
      return violations;
    },
  },
  {
    name: "incapable-pin-edit-negotiates",
    behaviors: "behavior 7 (pinned text-only model asked to edit → negotiate)",
    context: foxProjectContext(
      "add a steaming coffee cup next to the fox in the selected image",
      { pinnedModel: registry.getModel("recraft-v4.1") },
    ),
    verify: (decision) => {
      const violations: string[] = [];
      if (decision.action !== "negotiate") {
        violations.push(
          `an edit request on a text-only pin must negotiate, got ${decision.action}`,
        );
        return violations;
      }
      if (decision.options.length < 2) {
        violations.push("negotiate must offer at least 2 options");
      }
      if (!decision.options[0]?.label.includes("Recommended")) {
        violations.push("first option must be marked (Recommended)");
      }
      return violations;
    },
  },
  {
    name: "remove-background-routes-transform",
    behaviors:
      "S-30 (remove background → the prompt-less utility, not an edit)",
    context: foxProjectContext("remove the background from the selected one"),
    verify: (decision) => {
      const violations: string[] = [];
      if (decision.action !== "transform") {
        violations.push(
          `remove background must route to transform, got ${decision.action}`,
        );
        return violations;
      }
      if (decision.operation !== "remove_background") {
        violations.push(
          `expected remove_background, got ${decision.operation}`,
        );
      }
      if (decision.sourceImageId !== SELECTED_IMAGE_ID) {
        violations.push(
          `transform must target the selected image, got ${decision.sourceImageId}`,
        );
      }
      return violations;
    },
  },
];
