import { GEMINI_JSON_SCHEMA } from "../schemas/GeminiSchema";
import type { JSONSchema } from "@utils/provider/schemas/types";
import type { SpanProviderProfile } from "./types";

/**
 * Fallback for any provider without a dedicated profile (today: Anthropic,
 * and anything the router reports that we don't recognise).
 *
 * The pairing below looks wrong and is deliberate. It reproduces, exactly,
 * what the old generic client did — see ADR-0020 "Preserved accidents":
 *
 *   `RobustLlmClient._getProviderName()` returned `"unknown"`. That string
 *   matched no client substring in `detectProvider`, so detection fell
 *   through to `ModelConfig["span_labeling"].client` (default `gemini`) and
 *   produced `strictJsonSchema: true` — hence the GEMINI schema. Meanwhile
 *   `buildSystemPrompt` took its `else` arm on the same `"unknown"` string —
 *   hence the GROQ prompt, at `useJsonSchema: true`.
 *
 * Almost certainly not what anyone intended. It is preserved so the
 * re-bless measures the refactor and nothing else; changing it is a separate,
 * separately-measured decision.
 */
export const genericSpanProfile: SpanProviderProfile = {
  id: "generic",
  // Selects buildSystemPrompt's else arm → getGroqSystemPrompt(true).
  promptProviderName: "unknown",
  jsonSchema: GEMINI_JSON_SCHEMA as unknown as JSONSchema,

  requestOptions: {
    enableBookending: false,
    useFewShot: false,
    useSeedFromConfig: true,
    enableLogprobs: false,
  },

  rawTextPayload: false,
  relaxValidation: false,
};
