import { describe, it, expect, vi } from "vitest";
import { AIServiceRequirementsClassifier } from "../services/RequirementsClassifier";
import type { AIModelService } from "@services/ai-model/AIModelService";
import type { PromptSpan } from "../types";

type ExecuteImpl = (operation: string, params: unknown) => Promise<unknown>;

const makeAiService = (impl: ExecuteImpl): AIModelService =>
  ({ execute: vi.fn(impl) }) as unknown as AIModelService;

describe("AIServiceRequirementsClassifier", () => {
  it("maps the LLM's observations into requirements", async () => {
    const ai = makeAiService(async () => ({
      text: JSON.stringify({
        hasWater: true,
        characterKinds: ["human"],
        showsFace: true,
      }),
      metadata: {},
    }));
    const classifier = new AIServiceRequirementsClassifier(ai);

    const req = await classifier.classify("a diver in the deep sea", []);

    expect(req.physics.hasFluidDynamics).toBe(true);
    expect(req.character.requiresFacialPerformance).toBe(true);
  });

  it("falls back to role derivation when the LLM call throws", async () => {
    const ai = makeAiService(async () => {
      throw new Error("provider down");
    });
    const classifier = new AIServiceRequirementsClassifier(ai);
    const spans: PromptSpan[] = [{ text: "snow", role: "environment.weather" }];

    const req = await classifier.classify("snow falls quietly", spans);

    expect(req.physics.hasParticleSystems).toBe(true);
  });

  it("falls back when the LLM returns unparseable content", async () => {
    const ai = makeAiService(async () => ({
      text: "not json at all",
      metadata: {},
    }));
    const classifier = new AIServiceRequirementsClassifier(ai);

    const req = await classifier.classify("anything", []);

    expect(req).toBeDefined();
    expect(req.character.hasHumanCharacter).toBe(false);
  });

  it("invokes the requirements_extraction operation in JSON mode", async () => {
    const execute = vi.fn(async () => ({ text: "{}", metadata: {} }));
    const ai = { execute } as unknown as AIModelService;
    const classifier = new AIServiceRequirementsClassifier(ai);

    await classifier.classify("a prompt", []);

    expect(execute).toHaveBeenCalledWith(
      "requirements_extraction",
      expect.objectContaining({ jsonMode: true }),
    );
  });
});
