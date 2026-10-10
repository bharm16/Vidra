import { describe, it, expect } from "vitest";

import { OpenAiResponseParser } from "@server/clients/adapters/openai/OpenAiResponseParser";

describe("OpenAiResponseParser", () => {
  describe("edge cases", () => {
    it("computes logprob confidence when provided", () => {
      const parser = new OpenAiResponseParser("openai");
      const result = parser.parseResponse(
        {
          choices: [
            {
              message: { content: "Hello" },
              logprobs: {
                content: [
                  { token: "Hello", logprob: 0 },
                  { token: "world", logprob: Math.log(0.25) },
                ],
              },
              finish_reason: "stop",
            },
          ],
          model: "gpt-test",
        },
        { logprobs: true },
      );

      expect(result.metadata?.logprobs).toHaveLength(2);
      expect(result.metadata?.averageConfidence).toBeCloseTo(0.625, 5);
      expect(result.metadata?.finishReason).toBe("stop");
    });
  });
});
