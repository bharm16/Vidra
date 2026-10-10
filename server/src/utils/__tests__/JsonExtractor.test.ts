import type { AIResponse } from "@interfaces/IAIClient";
import { describe, expect, it } from "vitest";
import {
  cleanJSONResponse,
  extractAndParse,
  extractResponseText,
} from "../JsonExtractor";

describe("extractResponseText", () => {
  const makeResponse = (overrides: Partial<AIResponse>): AIResponse => ({
    text: "",
    metadata: {},
    ...overrides,
  });

  describe("error handling", () => {
    it("returns empty string when response has no text or content", () => {
      const response = makeResponse({});

      expect(extractResponseText(response)).toBe("");
    });
  });

  describe("edge cases", () => {
    it("prefers text property over content array", () => {
      const response = makeResponse({
        text: "direct text",
        content: [{ text: "array text" }],
      });

      expect(extractResponseText(response)).toBe("direct text");
    });

    it("uses first content item text when text property is missing", () => {
      const response = makeResponse({
        content: [{ text: "first" }, { text: "second" }],
      });

      expect(extractResponseText(response)).toBe("first");
    });
  });
});

describe("cleanJSONResponse", () => {
  describe("error handling", () => {
    it("throws when JSON object not found", () => {
      expect(() => cleanJSONResponse("no json here", false)).toThrow(
        "Invalid JSON structure",
      );
    });

    it("throws when JSON array not found", () => {
      expect(() => cleanJSONResponse("no json here", true)).toThrow(
        "Invalid JSON structure",
      );
    });

    it("throws when end bracket missing", () => {
      expect(() => cleanJSONResponse('{"key": "value"', false)).toThrow(
        "Invalid JSON structure",
      );
    });

    it("throws when brackets are in wrong order", () => {
      expect(() => cleanJSONResponse("} text {", false)).toThrow(
        "Invalid JSON structure",
      );
    });
  });

  describe("edge cases", () => {
    it("removes uppercase JSON markdown code blocks", () => {
      const input = '```JSON\n{"key": "value"}\n```';
      const result = cleanJSONResponse(input, false);

      expect(result).toBe('{"key": "value"}');
    });

    it("removes common preamble text", () => {
      const inputs = [
        'Here is the response:\n{"key": "value"}',
        'Here\'s the output:\n{"key": "value"}',
        'This is the result:\n{"key": "value"}',
        'The response:\n{"key": "value"}',
        'Output: {"key": "value"}',
        'Response: {"key": "value"}',
      ];

      for (const input of inputs) {
        const result = cleanJSONResponse(input, false);
        expect(JSON.parse(result)).toEqual({ key: "value" });
      }
    });

    it("extracts JSON from middle of text", () => {
      const input =
        'Some preamble text {"key": "value"} and some trailing text';
      const result = cleanJSONResponse(input, false);

      expect(result).toBe('{"key": "value"}');
    });

    it("handles nested arrays", () => {
      const input = "[[1, 2], [3, 4]]";
      const result = cleanJSONResponse(input, true);

      expect(result).toBe("[[1, 2], [3, 4]]");
    });
  });
});

describe("extractAndParse — Gemini-style malformed JSON repair (F1)", () => {
  it("repairs multiple trailing commas in nested structures", () => {
    const input = '{"items": [1, 2, 3,], "meta": {"x": 1,},}';
    const result = extractAndParse<{
      items: number[];
      meta: { x: number };
    }>(input, false);
    expect(result).toEqual({ items: [1, 2, 3], meta: { x: 1 } });
  });

  it("repairs smart double-quotes (curly quotes around keys/values)", () => {
    // U+201C and U+201D are smart double-quote characters.
    const input = "{“key”: “value”}";
    const result = extractAndParse<Record<string, string>>(input, false);
    expect(result).toEqual({ key: "value" });
  });

  it("repairs mixed trailing commas + smart quotes", () => {
    const input = "{“key”: “value”,}";
    const result = extractAndParse<Record<string, string>>(input, false);
    expect(result).toEqual({ key: "value" });
  });

  it("still throws when JSON is structurally broken beyond repair", () => {
    // Missing colon, no amount of comma/quote repair can fix this.
    const input = '{"key" "value"}';
    expect(() => extractAndParse(input, false)).toThrow();
  });
});

describe("extractAndParse", () => {
  describe("core behavior", () => {
    it("extracts and parses JSON with markdown wrapper", () => {
      const input = '```json\n{"name": "test", "count": 42}\n```';
      const result = extractAndParse<{ name: string; count: number }>(
        input,
        false,
      );

      expect(result).toEqual({ name: "test", count: 42 });
    });

    it("extracts and parses JSON with preamble", () => {
      const input = 'Here is the data:\n[{"id": 1}, {"id": 2}]';
      const result = extractAndParse<Array<{ id: number }>>(input, true);

      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("handles complex nested structures", () => {
      const input =
        '```json\n{"users": [{"name": "Alice", "roles": ["admin", "user"]}]}\n```';
      const result = extractAndParse<{
        users: Array<{ name: string; roles: string[] }>;
      }>(input, false);

      expect(result).toEqual({
        users: [{ name: "Alice", roles: ["admin", "user"] }],
      });
    });
  });
});
