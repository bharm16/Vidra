/**
 * JSON Extractor
 *
 * Pure functions for extracting and cleaning JSON from LLM responses.
 * Handles mechanism (how to clean/parse) without policy (retry logic).
 */
import type { AIResponse } from "@interfaces/IAIClient";

/**
 * Extract text from AI service response
 * Handles both { text: string } and { content: [{ text: string }] } formats
 */
export function extractResponseText(response: AIResponse): string {
  if (response.text) {
    return response.text;
  }
  if (
    response.content &&
    Array.isArray(response.content) &&
    response.content.length > 0
  ) {
    return response.content[0]?.text || "";
  }
  return "";
}

/**
 * Clean JSON response by removing markdown and extra text
 */
export function cleanJSONResponse(text: string, isArray: boolean): string {
  // Add more aggressive cleaning before parsing
  let cleanedResponse = text
    .replace(/```json\n?/gi, "") // Case-insensitive markdown removal
    .replace(/```\n?/gi, "") // Case-insensitive markdown removal
    .trim();

  // Remove common preambles
  cleanedResponse = cleanedResponse.replace(
    /^(Here is|Here's|This is|The|Output:|Response:)\s*/i,
    "",
  );

  // If it starts with explanation text, find the array/object
  const startChar = isArray ? "[" : "{";
  if (!cleanedResponse.startsWith(startChar)) {
    const arrayStart = cleanedResponse.indexOf(startChar);
    if (arrayStart !== -1) {
      cleanedResponse = cleanedResponse.substring(arrayStart);
    }
  }

  // Find the actual JSON start and end
  const endChar = isArray ? "]" : "}";

  const startIndex = cleanedResponse.indexOf(startChar);
  const lastIndex = cleanedResponse.lastIndexOf(endChar);

  if (startIndex === -1 || lastIndex === -1 || lastIndex < startIndex) {
    throw new Error(
      `Invalid JSON structure: Expected ${startChar}...${endChar}`,
    );
  }

  // Extract only the JSON portion
  cleanedResponse = cleanedResponse.substring(startIndex, lastIndex + 1);

  return cleanedResponse;
}

/**
 * Repair common LLM-emitted JSON malformations. F1 fix (2026-05-22):
 * Gemini's responseSchema enforcement is validation-based (not grammar-
 * constrained), so the model occasionally emits trailing commas or smart
 * quotes that JSON.parse rejects. Called only when the first parse fails,
 * so well-formed JSON is unaffected.
 *
 * Repairs handled:
 *   - Smart double quotes (U+201C/U+201D) → straight `"`
 *   - Smart single quotes (U+2018/U+2019) → straight `'`
 *   - Trailing commas before `]` or `}` (the dominant Gemini failure mode)
 *
 * Caveat: trailing-comma removal uses a syntactic regex, not a string-
 * aware tokenizer. If a JSON string value literally contains `,]` or `,}`,
 * the repair would mangle it. In practice our schemas don't have such
 * values, and the re-parse step below catches any structural corruption.
 */
export function repairJSON(text: string): string {
  // Smart quotes → straight quotes.
  let repaired = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  // Trailing commas: `, ]` → `]` and `, }` → `}`.
  repaired = repaired.replace(/,(\s*[\]}])/g, "$1");
  return repaired;
}

/**
 * Extract and parse JSON from response text.
 *
 * When `schema` is provided, the parsed value is validated at runtime
 * (e.g. via Zod `.parse()`), replacing the unchecked `as T` cast with
 * a true type boundary.
 *
 * F1 (2026-05-22): if the first JSON.parse fails, apply repairJSON()
 * and try once more. This handles Gemini's trailing-comma / smart-quote
 * failure modes without a full LLM retry round-trip.
 */
export function extractAndParse<T>(
  responseText: string,
  isArray: boolean,
  schema?: { parse: (data: unknown) => T },
): T {
  const cleanedText = cleanJSONResponse(responseText, isArray);
  let raw: unknown;
  try {
    raw = JSON.parse(cleanedText);
  } catch (firstError) {
    // Repair pass: try once more with smart-quote and trailing-comma fixes.
    try {
      raw = JSON.parse(repairJSON(cleanedText));
    } catch {
      throw firstError;
    }
  }
  return schema ? schema.parse(raw) : (raw as T);
}
