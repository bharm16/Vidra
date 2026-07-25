import { describe, it, expect, vi } from "vitest";
import {
  StudioPolicyEngine,
  StudioPolicyError,
  type StudioTurnContext,
} from "../StudioPolicyEngine";
import { StudioModelRegistry } from "../StudioModelRegistry";
import type { StudioDecision, StudioTurnRecord } from "../types";

const registry = new StudioModelRegistry();

const GENERATE: Extract<StudioDecision, { action: "generate" }> = {
  action: "generate",
  basePrompt: "A minimal geometric fox logo for a coffee brand",
  variants: [
    "A minimal geometric fox logo, flat vector, warm orange",
    "A fox head mark built from triangles, coffee-brown accents",
    "A negative-space fox inside a coffee cup silhouette",
    "A round badge with an origami fox and wordmark space",
  ],
  capability: "design",
  suggestions: [
    "Put the fox inside a circular badge",
    "Try a monochrome espresso palette",
    "Add a small wordmark under the fox",
  ],
  title: "Fox Coffee Logo",
};

function llmResponses(...payloads: unknown[]) {
  const execute = vi.fn();
  for (const payload of payloads) {
    execute.mockResolvedValueOnce({
      text: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
  }
  return execute;
}

function makeContext(
  overrides?: Partial<StudioTurnContext>,
): StudioTurnContext {
  return {
    userMessage: "a fox logo for my coffee brand",
    projectTitle: "Untitled",
    pinnedModel: null,
    roster: registry.listModels(),
    history: [],
    selectedImageId: null,
    projectImageIds: new Set<string>(),
    allowedActions: ["clarify", "generate", "diagnose", "negotiate"],
    ...overrides,
  };
}

function makeGenerateTurn(id: string, message: string): StudioTurnRecord {
  return {
    id,
    projectId: "p1",
    userId: "u1",
    status: "complete",
    userMessage: message,
    decision: GENERATE,
    resolvedModel: "recraft-v4.1",
    calls: GENERATE.variants.map((variant, index) => ({
      index,
      status: "succeeded" as const,
      image: {
        id: `img-${id}-${index}`,
        storagePath: `users/u1/x${index}.webp`,
        sourcePrompt: variant,
        model: "recraft-v4.1" as const,
      },
    })),
    reservedCents: 16,
    refundedCents: 0,
    createdAtMs: 1,
    updatedAtMs: 2,
  };
}

describe("StudioPolicyEngine", () => {
  it("returns a valid generate decision and prompts with roster + Auto mode", async () => {
    const execute = llmResponses(GENERATE);
    const engine = new StudioPolicyEngine({ ai: { execute } });

    const decision = await engine.decideTurn(makeContext());

    expect(decision).toEqual(GENERATE);
    expect(execute).toHaveBeenCalledTimes(1);
    const [operation, options] = execute.mock.calls[0] ?? [];
    expect(operation).toBe("studio_turn");
    const systemPrompt = String(options?.systemPrompt);
    // Roster capabilities are in the system prompt (behavior 9 grounding).
    expect(systemPrompt).toContain("recraft-v4.1-svg");
    expect(systemPrompt).toContain("Auto mode");
    expect(systemPrompt).toContain("clarify, generate, diagnose, negotiate");
    // The user's text rides in the user role, never the system prompt.
    expect(systemPrompt).not.toContain("a fox logo for my coffee brand");
    expect(String(options?.userMessage)).toContain(
      "a fox logo for my coffee brand",
    );
  });

  it("names the pinned model and its capabilities when one is pinned", async () => {
    const execute = llmResponses(GENERATE);
    const engine = new StudioPolicyEngine({ ai: { execute } });

    await engine.decideTurn(
      makeContext({ pinnedModel: registry.getModel("recraft-v4.1-pro") }),
    );

    const systemPrompt = String(execute.mock.calls[0]?.[1]?.systemPrompt);
    expect(systemPrompt).toContain("pinned **recraft-v4.1-pro**");
    expect(systemPrompt).not.toContain("Auto mode —");
  });

  it("renders history and image inventory into the user message", async () => {
    const execute = llmResponses(GENERATE);
    const engine = new StudioPolicyEngine({ ai: { execute } });
    const prior = makeGenerateTurn("t1", "a fox logo");

    await engine.decideTurn(
      makeContext({
        userMessage: "make it more playful",
        history: [prior],
        selectedImageId: "img-t1-2",
        projectImageIds: new Set([
          "img-t1-0",
          "img-t1-1",
          "img-t1-2",
          "img-t1-3",
        ]),
      }),
    );

    const userMessage = String(execute.mock.calls[0]?.[1]?.userMessage);
    expect(userMessage).toContain("User: a fox logo");
    expect(userMessage).toContain("img-t1-0");
    expect(userMessage).toContain(`Working basePrompt: ${GENERATE.basePrompt}`);
    // Selection is surfaced with its full source prompt (behavior 6 seed).
    expect(userMessage).toContain(
      "Selected image: img-t1-2 (source prompt: A negative-space fox inside a coffee cup silhouette)",
    );
    expect(userMessage).toContain("NEW USER MESSAGE\n\nmake it more playful");
  });

  it("retries with feedback when the JSON misses the decision schema", async () => {
    const badGenerate = {
      ...GENERATE,
      variants: GENERATE.variants.slice(0, 3),
    };
    const execute = llmResponses(badGenerate, GENERATE);
    const engine = new StudioPolicyEngine({ ai: { execute } });

    const decision = await engine.decideTurn(makeContext());

    expect(decision).toEqual(GENERATE);
    expect(execute).toHaveBeenCalledTimes(2);
    const retryPrompt = String(execute.mock.calls[1]?.[1]?.systemPrompt);
    expect(retryPrompt).toContain("PREVIOUS ATTEMPT REJECTED");
    expect(retryPrompt).toContain("variants");
  });

  it("rejects actions outside allowedActions with a corrective retry", async () => {
    const edit: StudioDecision = {
      action: "edit",
      instruction: "remove the background",
      sourceImageIds: ["img-1"],
      suggestions: ["a", "b", "c"],
    };
    const execute = llmResponses(edit, GENERATE);
    const engine = new StudioPolicyEngine({ ai: { execute } });

    const decision = await engine.decideTurn(
      makeContext({ projectImageIds: new Set(["img-1"]) }),
    );

    expect(decision).toEqual(GENERATE);
    const retryPrompt = String(execute.mock.calls[1]?.[1]?.systemPrompt);
    expect(retryPrompt).toContain('Action "edit" is not available');
  });

  it("rejects referential violations (unknown source image) like a schema failure", async () => {
    const edit: StudioDecision = {
      action: "edit",
      instruction: "remove the background",
      sourceImageIds: ["img-does-not-exist"],
      suggestions: ["a", "b", "c"],
    };
    const execute = llmResponses(edit, GENERATE);
    const engine = new StudioPolicyEngine({ ai: { execute } });

    const decision = await engine.decideTurn(
      makeContext({
        allowedActions: ["generate", "edit"],
        projectImageIds: new Set(["img-1"]),
      }),
    );

    expect(decision).toEqual(GENERATE);
    const retryPrompt = String(execute.mock.calls[1]?.[1]?.systemPrompt);
    expect(retryPrompt).toContain("img-does-not-exist");
  });

  it("nudges titling while Untitled and stops once the project is titled", async () => {
    const execute = llmResponses(GENERATE, GENERATE);
    const engine = new StudioPolicyEngine({ ai: { execute } });

    await engine.decideTurn(makeContext());
    await engine.decideTurn(makeContext({ projectTitle: "Fox Coffee Logo" }));

    const untitled = String(execute.mock.calls[0]?.[1]?.userMessage);
    expect(untitled).toContain(
      "Project title: Untitled — include `title` in your next generate decision.",
    );
    const titled = String(execute.mock.calls[1]?.[1]?.userMessage);
    expect(titled).toContain("Project title: Fox Coffee Logo");
    expect(titled).not.toContain("include `title`");
  });

  it("names unavailable actions and redirects a blocked clarify toward generate-with-defaults", async () => {
    const clarify: StudioDecision = {
      action: "clarify",
      questions: [{ text: "What mood?", quickPicks: ["Playful", "Serious"] }],
    };
    const execute = llmResponses(clarify, GENERATE);
    const engine = new StudioPolicyEngine({ ai: { execute } });

    const decision = await engine.decideTurn(
      makeContext({ allowedActions: ["generate", "diagnose", "negotiate"] }),
    );

    expect(decision).toEqual(GENERATE);
    const basePrompt = String(execute.mock.calls[0]?.[1]?.systemPrompt);
    expect(basePrompt).toContain(
      "NOT available this turn: clarify, edit, transform",
    );
    expect(basePrompt).toContain("fill the gaps with sensible defaults");
    const retryPrompt = String(execute.mock.calls[1]?.[1]?.systemPrompt);
    expect(retryPrompt).toContain(
      "Do not ask more questions — respond with a generate decision",
    );
  });

  it("throws StudioPolicyError after exhausting corrective attempts", async () => {
    const execute = llmResponses({ action: "unknown" }, { action: "unknown" });
    const engine = new StudioPolicyEngine({ ai: { execute } });

    await expect(engine.decideTurn(makeContext())).rejects.toBeInstanceOf(
      StudioPolicyError,
    );
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
