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

/** M3's executable set (StudioService.EXECUTABLE_ACTIONS at M3). */
const ALLOWED_ACTIONS = [
  "clarify",
  "generate",
  "diagnose",
  "negotiate",
] as const satisfies readonly StudioDecision["action"][];

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
  return {
    userMessage: "",
    pinnedModel: null,
    roster: registry.listModels(),
    history: [],
    selectedImageId: null,
    projectImageIds: new Set<string>(),
    allowedActions: ALLOWED_ACTIONS,
    ...overrides,
  };
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
];
