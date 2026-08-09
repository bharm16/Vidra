import { GEMINI_JSON_SCHEMA } from "../schemas/GeminiSchema";
import type { JSONSchema } from "@utils/provider/schemas/types";
import { GeminiSpanBehavior } from "./gemini/GeminiSpanBehavior";
import type { SpanProviderProfile } from "./types";

/**
 * Google Gemini Flash.
 *
 * The only provider that streams spans individually: it emits NDJSON, one
 * span per line, which `aiService.stream` cannot express (it yields text, not
 * parsed objects). That, plus recovery for the envelope noise Gemini adds
 * despite the NDJSON instruction, is why this profile carries behavior
 * functions and not just configuration.
 */
const behavior = new GeminiSpanBehavior();

export const geminiSpanProfile: SpanProviderProfile = {
  id: "gemini",
  promptProviderName: "gemini",
  jsonSchema: GEMINI_JSON_SCHEMA as unknown as JSONSchema,

  requestOptions: {
    // Gemini follows instructions well without bookending.
    enableBookending: false,
    // Zero-shot works well on Flash 2.5/2.0.
    useFewShot: false,
    // Gemini does not honor seed the way OpenAI does.
    useSeedFromConfig: false,
    enableLogprobs: false,
  },

  /** Flash returns multi-paragraph extractions; the default ceiling truncates them. */
  maxTokens: 16384,

  /** Gemini is prompted with the raw text, not the task/policy envelope. */
  rawTextPayload: true,

  /** Flash returns looser spans, so the word limit and confidence floor relax. */
  relaxValidation: true,

  parseResponseText: (text) => behavior.parseResponseText(text),
  normalizeParsedResponse: (value) => behavior.normalizeParsedResponse(value),
  streamSpans: (params) => behavior.streamSpans(params),
};
