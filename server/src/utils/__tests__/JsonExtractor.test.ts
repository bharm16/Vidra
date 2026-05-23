import { describe, it, expect } from "vitest";
import {
  extractResponseText,
  cleanJSONResponse,
  extractAndParse,
} from "../JsonExtractor";
import type { AIResponse } from "@interfaces/IAIClient";

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

    it("returns empty string when content array is empty", () => {
      const response = makeResponse({ content: [] });

      expect(extractResponseText(response)).toBe("");
    });

    it("returns empty string when content item has no text", () => {
      const response = makeResponse({ content: [{}] });

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

    it("handles empty text property", () => {
      const response = makeResponse({ text: "" });

      // Empty string is falsy, so falls through to content check
      expect(extractResponseText(response)).toBe("");
    });
  });

  describe("core behavior", () => {
    it("extracts text from text property", () => {
      const response = makeResponse({ text: "Hello world" });

      expect(extractResponseText(response)).toBe("Hello world");
    });

    it("extracts text from content array", () => {
      const response = makeResponse({ content: [{ text: "Content text" }] });

      expect(extractResponseText(response)).toBe("Content text");
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

    it("throws when start bracket missing", () => {
      expect(() => cleanJSONResponse('"key": "value"}', false)).toThrow(
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
    it("removes lowercase json markdown code blocks", () => {
      const input = '```json\n{"key": "value"}\n```';
      const result = cleanJSONResponse(input, false);

      expect(result).toBe('{"key": "value"}');
    });

    it("removes uppercase JSON markdown code blocks", () => {
      const input = '```JSON\n{"key": "value"}\n```';
      const result = cleanJSONResponse(input, false);

      expect(result).toBe('{"key": "value"}');
    });

    it("removes plain markdown code blocks", () => {
      const input = '```\n{"key": "value"}\n```';
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

    it("handles array extraction", () => {
      const input = "Here is the array: [1, 2, 3]";
      const result = cleanJSONResponse(input, true);

      expect(result).toBe("[1, 2, 3]");
    });

    it("extracts JSON from middle of text", () => {
      const input =
        'Some preamble text {"key": "value"} and some trailing text';
      const result = cleanJSONResponse(input, false);

      expect(result).toBe('{"key": "value"}');
    });

    it("handles nested objects", () => {
      const input = '{"outer": {"inner": "value"}}';
      const result = cleanJSONResponse(input, false);

      expect(result).toBe('{"outer": {"inner": "value"}}');
    });

    it("handles nested arrays", () => {
      const input = "[[1, 2], [3, 4]]";
      const result = cleanJSONResponse(input, true);

      expect(result).toBe("[[1, 2], [3, 4]]");
    });

    it("handles objects containing arrays", () => {
      const input = '{"items": [1, 2, 3]}';
      const result = cleanJSONResponse(input, false);

      expect(result).toBe('{"items": [1, 2, 3]}');
    });

    it("handles arrays containing objects", () => {
      const input = '[{"a": 1}, {"b": 2}]';
      const result = cleanJSONResponse(input, true);

      expect(result).toBe('[{"a": 1}, {"b": 2}]');
    });
  });

  describe("core behavior", () => {
    it("returns clean object JSON from simple input", () => {
      const input = '{"key": "value"}';
      const result = cleanJSONResponse(input, false);

      expect(result).toBe('{"key": "value"}');
    });

    it("returns clean array JSON from simple input", () => {
      const input = "[1, 2, 3]";
      const result = cleanJSONResponse(input, true);

      expect(result).toBe("[1, 2, 3]");
    });

    it("trims whitespace", () => {
      const input = '   {"key": "value"}   ';
      const result = cleanJSONResponse(input, false);

      expect(result).toBe('{"key": "value"}');
    });
  });
});

describe("extractAndParse — Gemini-style malformed JSON repair (F1)", () => {
  it("repairs trailing comma before closing array bracket", () => {
    // Gemini-style: "Expected ',' or ']' after array element..."
    const input = '[{"a": 1}, {"b": 2},]';
    const result = extractAndParse<Array<Record<string, number>>>(input, true);
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("repairs trailing comma before closing object brace", () => {
    const input = '{"a": 1, "b": 2,}';
    const result = extractAndParse<Record<string, number>>(input, false);
    expect(result).toEqual({ a: 1, b: 2 });
  });

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

  it("does not break already-valid JSON when no repair is needed", () => {
    const input = '{"clean": true, "list": [1, 2]}';
    const result = extractAndParse<{ clean: boolean; list: number[] }>(
      input,
      false,
    );
    expect(result).toEqual({ clean: true, list: [1, 2] });
  });

  it("still throws when JSON is structurally broken beyond repair", () => {
    // Missing colon, no amount of comma/quote repair can fix this.
    const input = '{"key" "value"}';
    expect(() => extractAndParse(input, false)).toThrow();
  });
});

describe("extractAndParse", () => {
  describe("error handling", () => {
    it("throws for invalid JSON syntax", () => {
      expect(() => extractAndParse('{"unclosed": ', false)).toThrow();
    });

    it("throws when JSON not found in text", () => {
      expect(() => extractAndParse("no json at all", false)).toThrow(
        "Invalid JSON structure",
      );
    });
  });

  describe("core behavior", () => {
    it("parses clean object JSON", () => {
      const result = extractAndParse<{ key: string }>(
        '{"key": "value"}',
        false,
      );

      expect(result).toEqual({ key: "value" });
    });

    it("parses clean array JSON", () => {
      const result = extractAndParse<number[]>("[1, 2, 3]", true);

      expect(result).toEqual([1, 2, 3]);
    });

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
