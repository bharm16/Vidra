import { describe, it, expect, vi } from "vitest";
import {
  StudioPolicyEngine,
  type StudioTurnContext,
} from "../StudioPolicyEngine";
import { StudioModelRegistry } from "../StudioModelRegistry";
import type { StudioDecision, StudioTurnRecord } from "../types";

/**
 * Regression (found live 2026-07-25, M5 rejection-fork verification):
 * answering the "What's wrong with the results?" card produced the
 * IDENTICAL diagnose card again — a question loop. Behavior 5's fork
 * allows a second, DIFFERENT question (keep the concept vs new
 * direction); it never allows repeating a question the user just
 * answered.
 *
 * Invariant: a diagnose decision whose question matches the immediately
 * preceding assistant turn's diagnose question is rejected exactly like a
 * schema violation and retried.
 */

const registry = new StudioModelRegistry();

const REPEATED_QUESTION = "What's wrong with the results?";

const priorDiagnose: StudioTurnRecord = {
  id: "turn-d1",
  projectId: "p1",
  userId: "u1",
  status: "complete",
  userMessage: "I don't like any of these",
  decision: {
    action: "diagnose",
    question: REPEATED_QUESTION,
    quickPicks: ["Shape", "Color", "Layout", "Overall feel"],
  },
  calls: [],
  reservedCents: 0,
  refundedCents: 0,
  createdAtMs: 1,
  updatedAtMs: 1,
};

const sameDiagnose: StudioDecision = {
  action: "diagnose",
  question: REPEATED_QUESTION,
  quickPicks: ["Shape", "Color", "Layout", "Overall feel"],
};

const forkDiagnose: StudioDecision = {
  action: "diagnose",
  question: "Keep the fox concept, or try a new direction?",
  quickPicks: ["Keep the concept", "New direction"],
};

function makeContext(): StudioTurnContext {
  return {
    userMessage: "Color",
    projectTitle: "Fox Logo",
    pinnedModel: null,
    roster: registry.listModels(),
    history: [priorDiagnose],
    selectedImageId: null,
    projectImageIds: new Set<string>(),
    allowedActions: ["generate", "edit", "transform", "diagnose", "negotiate"],
  };
}

function llmResponses(...decisions: StudioDecision[]) {
  const execute = vi.fn();
  for (const decision of decisions) {
    execute.mockResolvedValueOnce({ text: JSON.stringify(decision) });
  }
  return execute;
}

describe("regression: the rejection flow never repeats an answered question", () => {
  it("rejects an identical consecutive diagnose and accepts the fork question", async () => {
    const execute = llmResponses(sameDiagnose, forkDiagnose);
    const engine = new StudioPolicyEngine({ ai: { execute } });

    const decision = await engine.decideTurn(makeContext());

    expect(decision).toEqual(forkDiagnose);
    expect(execute).toHaveBeenCalledTimes(2);
    const retryPrompt = String(execute.mock.calls[1]?.[1]?.systemPrompt);
    expect(retryPrompt).toContain("already asked");
  });

  it("accepts a different follow-up question without a retry", async () => {
    const execute = llmResponses(forkDiagnose);
    const engine = new StudioPolicyEngine({ ai: { execute } });

    const decision = await engine.decideTurn(makeContext());

    expect(decision).toEqual(forkDiagnose);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
