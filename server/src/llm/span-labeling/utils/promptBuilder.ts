/**
 * Span Labeling Prompt Builder
 *
 * Provider-Specific Implementations:
 *
 * OpenAI/GPT-4o:
 * - Grammar-constrained decoding (strict: true)
 * - Schema descriptions ARE processed during generation
 * - Minimal prompt + rich schema descriptions
 * - ~400 tokens prompt + ~600 tokens schema
 *
 * Groq/Llama 3:
 * - Validation-only schema (not grammar-constrained)
 * - Llama 3 does NOT process descriptions during generation
 * - Full rules in system prompt (GAtt attention mechanism)
 * - Schema for enum/type validation only
 * - ~1000 tokens prompt + ~200 tokens schema
 * - NEW: Stop sequences and min_p for better structured output
 * - NEW: Conditional format instructions when json_schema mode active
 *   Pass useJsonSchema=true to save ~50-100 tokens per request
 */

import { IMMUTABLE_SOVEREIGN_PREAMBLE } from "@utils/SecurityPrompts";
import { logger } from "@infrastructure/Logger";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { PROMPT_VERSIONS } from "../promptVersions";

// OpenAI-specific imports
import {
  OPENAI_MINIMAL_PROMPT,
  OPENAI_FEW_SHOT_EXAMPLES,
  VALID_TAXONOMY_IDS,
} from "../schemas/OpenAISchema.js";
import {
  GEMINI_SIMPLE_SYSTEM_PROMPT,
  GEMINI_STREAMING_SYSTEM_PROMPT,
  GEMINI_NDJSON_OUTPUT_FORMAT,
} from "../schemas/GeminiSchema.js";

// Groq/Llama 3-specific imports
import {
  GROQ_FULL_SYSTEM_PROMPT,
  GROQ_FEW_SHOT_EXAMPLES,
  GROQ_SANDWICH_REMINDER,
  getGroqSystemPrompt,
} from "../schemas/GroqSchema.js";

/**
 * Provider type
 */
export type Provider = "openai" | "groq" | "gemini";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const I2V_TEMPLATE_PATH = join(
  __dirname,
  "../templates/i2v-span-labeling-prompt.md",
);

const I2V_SYSTEM_PROMPT = `
Label ONLY motion-related spans for image-to-video prompts.

You must ignore visual descriptions because the image already defines them.

Allowed categories (use these only):
- action.movement (subject motion)
- action.gesture (small gestures)
- action.state (static pose/state)
- camera.movement (pan, tilt, dolly, zoom, crane)
- camera.focus (rack focus, shallow/deep focus)
- subject.emotion (emotional change or expression)

Do NOT label:
- subject identity/appearance/wardrobe
- lighting, environment, color, style
- shot type or camera angle
- technical specs unrelated to motion

Return JSON only, matching the SpanLabelingResponse schema.
`.trim();

let cachedI2VPrompt: string | null = null;

function loadI2VPromptTemplate(): string {
  if (cachedI2VPrompt) {
    return cachedI2VPrompt;
  }

  try {
    const content = readFileSync(I2V_TEMPLATE_PATH, "utf-8").trim();
    cachedI2VPrompt = content.length > 0 ? content : I2V_SYSTEM_PROMPT;
  } catch (error) {
    logger.warn("I2V span labeling template missing; using inline prompt", {
      error: (error as Error).message,
    });
    cachedI2VPrompt = I2V_SYSTEM_PROMPT;
  }

  return cachedI2VPrompt;
}

/**
 * Build system prompt optimized for specific provider
 *
 * @param text - Input text (currently unused but kept for API compatibility)
 * @param useRouter - Whether to use router (currently unused)
 * @param provider - LLM provider ('openai' or 'groq')
 * @param useJsonSchema - Whether json_schema response format is active (Groq optimization)
 * @param templateVersion - Wire template identifier; an `i2v*` value selects the motion-only template
 * @param streaming - Whether the caller consumes an NDJSON stream rather than a single JSON body
 */
export function buildSystemPrompt(
  text: string = "",
  useRouter: boolean = false,
  provider: string = "groq",
  useJsonSchema: boolean = false,
  templateVersion?: string,
  streaming: boolean = false,
): string {
  const normalizedProvider = provider.toLowerCase();

  let basePrompt: string;
  let promptVersion: string;

  if (templateVersion && templateVersion.toLowerCase().startsWith("i2v")) {
    // I2V: motion-only categories, because the reference image already fixes
    // every static visual attribute.
    basePrompt = loadI2VPromptTemplate();
    promptVersion = PROMPT_VERSIONS.I2V_SPAN_LABELING;
    logger.debug("Building span labeling prompt", {
      promptVersion,
      provider: normalizedProvider,
      templateVersion,
      streaming,
    });
  } else if (normalizedProvider === "openai") {
    // OpenAI: Minimal prompt, rules in schema descriptions
    basePrompt = OPENAI_MINIMAL_PROMPT;
    promptVersion = PROMPT_VERSIONS.SPAN_LABELING;
    logger.debug("Building span labeling prompt", {
      promptVersion,
      provider: normalizedProvider,
    });
  } else if (normalizedProvider === "gemini") {
    // Gemini: streaming callers get the NDJSON-shaped template; buffered
    // callers get the lightweight prompt for fast span extraction.
    basePrompt = streaming
      ? GEMINI_STREAMING_SYSTEM_PROMPT
      : GEMINI_SIMPLE_SYSTEM_PROMPT;
    promptVersion = streaming
      ? PROMPT_VERSIONS.GEMINI_STREAMING
      : PROMPT_VERSIONS.GEMINI_SIMPLE;
    logger.debug("Building span labeling prompt", {
      promptVersion,
      provider: normalizedProvider,
      streaming,
    });
  } else {
    // Groq/Llama 3: Full prompt, rules in system message
    // When json_schema is active, remove redundant format instructions
    basePrompt = getGroqSystemPrompt(useJsonSchema);
    promptVersion = PROMPT_VERSIONS.SPAN_LABELING;
    logger.debug("Building span labeling prompt", {
      promptVersion,
      provider: normalizedProvider,
      useJsonSchema,
      optimized: useJsonSchema ? "format-instructions-removed" : "full-prompt",
    });
  }

  // Streaming callers parse line-delimited JSON. Templates that do not already
  // specify NDJSON (the I2V template asks for a single JSON body) get the
  // format appended, so one module decides the output shape.
  if (streaming && !basePrompt.includes(GEMINI_NDJSON_OUTPUT_FORMAT)) {
    basePrompt = `${basePrompt.trim()}\n\n${GEMINI_NDJSON_OUTPUT_FORMAT}`;
  }

  // Add security preamble
  return `${IMMUTABLE_SOVEREIGN_PREAMBLE}\n\n${basePrompt}`.trim();
}

/**
 * Get few-shot examples for provider
 */
export function getFewShotExamples(
  provider: string,
): Array<{ role: "user" | "assistant"; content: string }> {
  const normalizedProvider = provider.toLowerCase();

  if (normalizedProvider === "openai") {
    // OpenAI: Fewer examples needed (rules in schema)
    return OPENAI_FEW_SHOT_EXAMPLES;
  }

  // Groq: More examples needed
  return GROQ_FEW_SHOT_EXAMPLES;
}

// Re-exports for backward compatibility
export const BASE_SYSTEM_PROMPT = buildSystemPrompt("", false, "groq");
export { VALID_TAXONOMY_IDS };
