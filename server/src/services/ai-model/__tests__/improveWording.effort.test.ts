/**
 * Improve wording's effort comes from its operation config, so it changes with
 * the model setting; operations without one keep their wire shape.
 */
import { describe, expect, it } from "vitest";

import { AIModelService } from "../AIModelService";
import type { IAIClient } from "@interfaces/IAIClient";

function capturingClient(): { client: IAIClient; options: () => Record<string, unknown> | undefined } {
  let captured: Record<string, unknown> | undefined;
  return {
    client: {
      complete: (_systemPrompt, options) => {
        captured = options as Record<string, unknown>;
        return Promise.resolve({ text: "Better words.", metadata: {} });
      },
    },
    options: () => captured,
  };
}

describe("improve_wording effort", () => {
  it("sends the configured effort to the Anthropic client", async () => {
    const { client, options } = capturingClient();
    const service = new AIModelService({ clients: { openai: null, anthropic: client } });

    await service.execute("improve_wording", { systemPrompt: "Rewrite.", userMessage: "words" });

    expect(options()).toMatchObject({ model: "claude-haiku-5-5", effort: "high" });
  });

  it("sends no effort for an operation that names none", async () => {
    const { client, options } = capturingClient();
    const service = new AIModelService({ clients: { openai: client } });

    await service.execute("optimize_standard", { systemPrompt: "Rewrite.", userMessage: "words" });

    expect(options()).not.toHaveProperty("effort");
  });
});
