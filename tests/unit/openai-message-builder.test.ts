import { describe, it, expect } from "vitest";

import { OpenAiMessageBuilder } from "@server/clients/adapters/openai/OpenAiMessageBuilder";

describe("OpenAiMessageBuilder", () => {
  describe("error handling", () => {
    it("builds simple messages when history is missing", () => {
      const builder = new OpenAiMessageBuilder();
      const messages = builder.buildMessages("System prompt", {
        userMessage: "Hello",
      });

      expect(messages).toEqual([
        { role: "system", content: "System prompt" },
        { role: "user", content: "Hello" },
      ]);
    });
  });

  describe("edge cases", () => {
    it("injects a developer message and appends bookending when long", () => {
      const builder = new OpenAiMessageBuilder();
      const longContent = "a".repeat(120_100);
      const messages = builder.buildMessages("System prompt", {
        developerMessage: "Keep JSON valid",
        enableBookending: true,
        messages: [
          { role: "system", content: "Respond only with valid JSON." },
          { role: "user", content: longContent },
        ],
      });

      expect(messages[0]).toEqual({
        role: "developer",
        content: "Keep JSON valid",
      });
      expect(messages[messages.length - 1]?.content).toContain(
        "Based on the context above",
      );
    });
  });
});
