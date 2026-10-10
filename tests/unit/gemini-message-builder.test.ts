import { describe, it, expect } from "vitest";

import { GeminiMessageBuilder } from "@server/clients/adapters/gemini/GeminiMessageBuilder";

describe("GeminiMessageBuilder", () => {
  describe("error handling", () => {
    it("falls back to a default user message when history is empty", () => {
      const builder = new GeminiMessageBuilder();
      const result = builder.buildMessages("System prompt", { messages: [] });

      expect(result.contents).toEqual([
        { role: "user", parts: [{ text: "Please proceed." }] },
      ]);
    });
  });

  describe("edge cases", () => {
    it("collects multiple system messages into a system instruction", () => {
      const builder = new GeminiMessageBuilder();
      const result = builder.buildMessages("System prompt", {
        messages: [
          { role: "system", content: "First rule" },
          { role: "system", content: { text: "Second rule" } },
          { role: "user", content: "Hello" },
        ],
      });

      expect(result.systemInstruction).toBe("First rule\nSecond rule");
      expect(result.contents[0]?.role).toBe("user");
      expect(result.contents[0]?.parts[0]?.text).toBe("Hello");
    });
  });

  describe("core behavior", () => {
    it("builds payloads with JSON mode when applicable", () => {
      const builder = new GeminiMessageBuilder();
      const payload = builder.buildPayload("System prompt", {
        userMessage: "Hi",
        jsonMode: true,
      });

      expect(payload.generationConfig?.responseMimeType).toBe(
        "application/json",
      );
      expect(payload.contents[0]?.parts[0]?.text).toBe("Hi");
    });

    it("removes unsupported additionalProperties from Gemini response schemas", () => {
      const builder = new GeminiMessageBuilder();
      const schema = {
        type: "object",
        additionalProperties: false,
        properties: {
          spans: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                text: { type: "string" },
              },
              required: ["text"],
            },
          },
          meta: {
            type: "object",
            additionalProperties: false,
            properties: {
              version: { type: "string" },
            },
            required: ["version"],
          },
        },
        required: ["spans", "meta"],
      };

      const payload = builder.buildPayload("System prompt", {
        userMessage: "Hi",
        responseSchema: schema,
      });

      expect(payload.generationConfig?.responseSchema).toEqual({
        type: "object",
        properties: {
          spans: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
              },
              required: ["text"],
            },
          },
          meta: {
            type: "object",
            properties: {
              version: { type: "string" },
            },
            required: ["version"],
          },
        },
        required: ["spans", "meta"],
      });
    });

    it("unwraps response schemas provided in OpenAI wrapper shape", () => {
      const builder = new GeminiMessageBuilder();
      const payload = builder.buildPayload("System prompt", {
        userMessage: "Hi",
        responseSchema: {
          name: "wrapped_schema",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              ok: { type: "boolean" },
            },
            required: ["ok"],
          },
        },
      });

      expect(payload.generationConfig?.responseSchema).toEqual({
        type: "object",
        properties: {
          ok: { type: "boolean" },
        },
        required: ["ok"],
      });
    });
  });
});
