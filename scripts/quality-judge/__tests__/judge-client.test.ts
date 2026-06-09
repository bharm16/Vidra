import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();

vi.mock("openai", () => ({
  default: class OpenAIMock {
    chat = { completions: { create: createMock } };
    constructor() {}
  },
}));

import { runJudge } from "../judge-client.js";
import { OPTIMIZE_DIMENSION_KEYS } from "../judge-event-types.js";

describe("runJudge", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("constructs a prompt containing the rubric verbatim and the surface content", async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              dimensions: {
                fidelity: 5,
                detailEnrichment: 4,
                coherence: 4,
                constraintCompliance: 5,
                brevityDiscipline: 4,
              },
              reasoning: "Good.",
            }),
          },
        },
      ],
      usage: { prompt_tokens: 800, completion_tokens: 120 },
    });

    const result = await runJudge({
      rubric: "RUBRIC_MARKER_XYZ",
      surface: "optimize",
      inputContent: { inputPrompt: "INPUT_MARKER" },
      outputContent: { outputPrompt: "OUTPUT_MARKER" },
    });

    expect(createMock).toHaveBeenCalledOnce();
    const call = createMock.mock.calls[0]![0];
    const userMessage = call.messages.find(
      (m: { role: string }) => m.role === "user",
    );
    expect(userMessage.content).toContain("RUBRIC_MARKER_XYZ");
    expect(userMessage.content).toContain("INPUT_MARKER");
    expect(userMessage.content).toContain("OUTPUT_MARKER");
    expect(call.response_format).toEqual({ type: "json_object" });
    expect(call.model).toBe("gpt-4o-2024-08-06");

    expect(result.dimensions).toEqual({
      fidelity: 5,
      detailEnrichment: 4,
      coherence: 4,
      constraintCompliance: 5,
      brevityDiscipline: 4,
    });
    expect(result.tokensIn).toBe(800);
    expect(result.tokensOut).toBe(120);
    expect(result.costUsd).toBeCloseTo(
      (800 / 1000) * 0.0025 + (120 / 1000) * 0.01,
      6,
    );
  });

  it("throws on malformed JSON output", async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: "not json" } }],
      usage: { prompt_tokens: 100, completion_tokens: 10 },
    });
    await expect(
      runJudge({
        rubric: "r",
        surface: "optimize",
        inputContent: {},
        outputContent: {},
      }),
    ).rejects.toThrow();
  });

  it("rejects output missing a required dimension key", async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              dimensions: {
                fidelity: 5,
                detailEnrichment: 4,
                coherence: 4,
                constraintCompliance: 5,
                // brevityDiscipline missing
              },
              reasoning: "x",
            }),
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 10 },
    });
    await expect(
      runJudge({
        rubric: "r",
        surface: "optimize",
        inputContent: {},
        outputContent: {},
      }),
    ).rejects.toThrow(/brevityDiscipline/);
  });

  it("rejects output where a dimension value is not a number", async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              dimensions: {
                fidelity: "high", // string instead of number
                detailEnrichment: 4,
                coherence: 4,
                constraintCompliance: 5,
                brevityDiscipline: 4,
              },
              reasoning: "x",
            }),
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 10 },
    });
    await expect(
      runJudge({
        rubric: "r",
        surface: "optimize",
        inputContent: {},
        outputContent: {},
      }),
    ).rejects.toThrow(/not a number/);
  });

  it("clamps dimension values to integers 0–5", async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              dimensions: {
                fidelity: 5,
                detailEnrichment: 4.7, // not an integer
                coherence: 4,
                constraintCompliance: 9, // out of range
                brevityDiscipline: -1, // out of range
              },
              reasoning: "x",
            }),
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 10 },
    });
    const r = await runJudge({
      rubric: "r",
      surface: "optimize",
      inputContent: {},
      outputContent: {},
    });
    // Use the dimension keys to assert each value is an integer in [0, 5].
    for (const k of OPTIMIZE_DIMENSION_KEYS) {
      const v = (r.dimensions as Record<string, number>)[k];
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});
