import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { logger } from "@infrastructure/Logger";
import type { AIModelService } from "@services/ai-model/AIModelService";
import type { AIResponse } from "@interfaces/IAIClient";
import {
  CAMERA_COMPLEXITY,
  EMOTIONAL_INTENSITY,
  ENVIRONMENT_TYPES,
  LIGHTING_REQUIREMENTS,
  SUBJECT_COMPLEXITY,
  type PromptRequirements,
  type PromptSpan,
} from "../types";
import {
  CHARACTER_KINDS,
  STYLE_MEDIUMS,
  deriveRequirementsFromRoles,
  mapObservationsToRequirements,
  type RequirementObservations,
} from "./requirementsMapper";

/**
 * Extracts model-recommendation requirements from a prompt via LLM perception
 * (the sanctioned non-regex path) and the pure policy mapper. Falls back to
 * role-only derivation when the LLM is unavailable so recommendations degrade
 * gracefully rather than failing.
 */
export interface RequirementsClassifier {
  classify(prompt: string, spans: PromptSpan[]): Promise<PromptRequirements>;
}

const SYSTEM_PROMPT = readFileSync(
  fileURLToPath(
    new URL("../templates/requirements-extraction.md", import.meta.url),
  ),
  "utf-8",
);

/**
 * Lenient schema for the LLM's observations: every field defaults to its
 * neutral value, so a partial response still maps cleanly. The typed assignment
 * in `classify` makes tsc enforce that this schema's output matches
 * RequirementObservations — they cannot drift.
 */
const RequirementObservationsSchema = z.object({
  hasWater: z.boolean().default(false),
  hasFire: z.boolean().default(false),
  hasParticulate: z.boolean().default(false),
  hasFlowingCloth: z.boolean().default(false),
  hasCollision: z.boolean().default(false),
  characterKinds: z.array(z.enum(CHARACTER_KINDS)).default([]),
  showsFace: z.boolean().default(false),
  showsBodyMotion: z.boolean().default(false),
  speaks: z.boolean().default(false),
  emotionalIntensity: z.enum(EMOTIONAL_INTENSITY).default("none"),
  environmentType: z.enum(ENVIRONMENT_TYPES).default("abstract"),
  hasArchitecture: z.boolean().default(false),
  hasNature: z.boolean().default(false),
  hasUrbanElements: z.boolean().default(false),
  lightingMood: z.enum(LIGHTING_REQUIREMENTS).default("natural"),
  hasPracticalLights: z.boolean().default(false),
  hasAtmospherics: z.boolean().default(false),
  styleMedium: z.enum(STYLE_MEDIUMS).default("unspecified"),
  isCinematic: z.boolean().default(false),
  specificAesthetic: z.string().nullable().default(null),
  cameraComplexity: z.enum(CAMERA_COMPLEXITY).default("static"),
  subjectMotionComplexity: z.enum(SUBJECT_COMPLEXITY).default("static"),
  hasMorphing: z.boolean().default(false),
  hasTransitions: z.boolean().default(false),
});

const responseText = (response: AIResponse): string =>
  (response.text || response.content?.[0]?.text || "").trim();

/** Strip a ```json fenced block without regex (structural, not semantic). */
const stripFence = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const firstNewline = trimmed.indexOf("\n");
  const body =
    firstNewline === -1 ? trimmed.slice(3) : trimmed.slice(firstNewline + 1);
  const closing = body.lastIndexOf("```");
  return (closing === -1 ? body : body.slice(0, closing)).trim();
};

const parseStructured = (response: AIResponse): unknown => {
  const validationParsed = response.metadata?.validation?.parsed;
  if (validationParsed !== undefined) return validationParsed;
  const raw = responseText(response);
  if (!raw) return null;
  try {
    return JSON.parse(stripFence(raw));
  } catch {
    return null;
  }
};

const buildUserBlock = (prompt: string, spans: PromptSpan[]): string => {
  const spanLines = spans
    .filter((span) => typeof span.text === "string" && span.text.length > 0)
    .map((span) => `- "${span.text}"${span.role ? ` (${span.role})` : ""}`)
    .join("\n");
  return `PROMPT:\n${prompt}\n\nLABELED SPANS:\n${spanLines || "(none)"}`;
};

export class AIServiceRequirementsClassifier implements RequirementsClassifier {
  private readonly log = logger.child({ service: "RequirementsClassifier" });

  constructor(private readonly aiService: AIModelService) {}

  async classify(
    prompt: string,
    spans: PromptSpan[],
  ): Promise<PromptRequirements> {
    try {
      const response = await this.aiService.execute("requirements_extraction", {
        systemPrompt: `${SYSTEM_PROMPT}\n\n${buildUserBlock(prompt, spans)}`,
        jsonMode: true,
        responseFormat: { type: "json_object" },
      });

      const parsed = parseStructured(response);
      if (parsed && typeof parsed === "object") {
        const observations: RequirementObservations =
          RequirementObservationsSchema.parse(parsed);
        return mapObservationsToRequirements(observations, spans);
      }

      this.log.warn(
        "Requirements classifier returned no parseable JSON; using role fallback",
      );
      return deriveRequirementsFromRoles(spans);
    } catch (error) {
      this.log.warn("Requirements classification failed; using role fallback", {
        error: error instanceof Error ? error.message : String(error),
      });
      return deriveRequirementsFromRoles(spans);
    }
  }
}
