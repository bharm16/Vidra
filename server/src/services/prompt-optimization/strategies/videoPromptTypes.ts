import { z } from "zod";
import type {
  VideoPromptStructuredResponse,
  VideoPromptSlots,
  VideoPromptTechnicalSpecs,
} from "@server/contracts/prompt-analysis/structuredPrompt";

export type {
  VideoPromptStructuredResponse,
  VideoPromptSlots,
  VideoPromptTechnicalSpecs,
} from "@server/contracts/prompt-analysis/structuredPrompt";

const VideoPromptTechnicalSpecsSchema = z
  .object({
    duration: z.string().optional(),
    aspect_ratio: z.string().optional(),
    frame_rate: z.string().optional(),
    audio: z.string().optional(),
    resolution: z.string().optional(),
    camera: z.string().optional(),
    lighting: z.string().optional(),
    style: z.string().optional(),
  })
  .partial();

const VideoPromptSlotsSchema = z
  .object({
    shot_framing: z.string().optional(),
    camera_angle: z.string().optional(),
    camera_move: z.string().nullable().optional(),
    camera_lens: z.string().nullable().optional(),
    subject: z.string().nullable().optional(),
    subject_details: z.array(z.string()).nullable().optional(),
    action: z.string().nullable().optional(),
    setting: z.string().nullable().optional(),
    time: z.string().nullable().optional(),
    lighting: z.string().nullable().optional(),
    style: z.string().nullable().optional(),
  })
  .partial();

export const VideoPromptStructuredResponseSchema =
  VideoPromptSlotsSchema.extend({
    _creative_strategy: z.string().optional(),
    technical_specs: VideoPromptTechnicalSpecsSchema.optional(),
    variations: z
      .array(
        z.object({
          label: z.string(),
          prompt: z.string(),
        }),
      )
      .optional(),
    shot_plan: z.record(z.string(), z.unknown()).nullable().optional(),
  }).passthrough();

export function parseVideoPromptStructuredResponse(
  raw: string,
): VideoPromptStructuredResponse {
  const cleaned = raw
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
  const parsed = JSON.parse(cleaned) as unknown;
  const validated = VideoPromptStructuredResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`Invalid video prompt JSON: ${validated.error.message}`);
  }
  return validated.data as VideoPromptStructuredResponse;
}

/**
 * Canonical shot-framing enum used by video prompt optimization. Duplicated in
 * `server/src/utils/provider/schemas/videoOptimization.ts` because the schema
 * file is under `@utils/provider/schemas` (cross-cutting) and importing back
 * into strategies would invert the dependency. If this list changes, update
 * both.
 */
export const KNOWN_SHOT_FRAMINGS = [
  "Extreme Close-Up",
  "Close-Up",
  "Medium Close-Up",
  "Medium Shot",
  "Medium Long Shot",
  "Cowboy Shot",
  "Full Shot",
  "Wide Shot",
  "Extreme Wide Shot",
  "Establishing Shot",
  "Master Shot",
  "Two-Shot",
  "Insert Shot",
  "Cutaway",
] as const;

export type ShotFraming = (typeof KNOWN_SHOT_FRAMINGS)[number];

export const DEFAULT_SHOT_FRAMING: ShotFraming = "Wide Shot";

// Longest-first so "Extreme Wide Shot" wins over "Wide Shot" when both
// appear in the same input. Precomputed at module load — sort order is
// static. Pattern bounds the match with non-alphanumeric context on both
// sides so "wide-ish" doesn't match "Wide Shot".
const FRAMING_MATCHERS: ReadonlyArray<{
  readonly framing: ShotFraming;
  readonly pattern: RegExp;
}> = [...KNOWN_SHOT_FRAMINGS]
  .sort((a, b) => b.length - a.length)
  .map((framing) => ({
    framing,
    pattern: new RegExp(
      `(?:^|\\s|[.,;:!?()-])${framing.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      )}(?=$|[\\s.,;:!?()-])`,
      "i",
    ),
  }));

/**
 * Defensively normalizes an LLM-provided shot_framing value to a known enum
 * label. Fallback paths (Groq non-strict, StructuredOutputEnforcer loose
 * schema) do not enforce the enum server-side, so the model can echo
 * multi-sentence prose into this slot. Prefers the longest enum match found
 * anywhere in the input; falls back to the default framing when nothing
 * matches.
 */
export function normalizeShotFraming(
  raw: string | null | undefined,
): ShotFraming {
  if (typeof raw !== "string") return DEFAULT_SHOT_FRAMING;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return DEFAULT_SHOT_FRAMING;

  for (const { framing, pattern } of FRAMING_MATCHERS) {
    if (pattern.test(trimmed)) {
      return framing;
    }
  }
  return DEFAULT_SHOT_FRAMING;
}
