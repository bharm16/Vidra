import type {
  CameraComplexity,
  ComplexityLevel,
  EmotionalIntensity,
  EnvironmentType,
  LightingRequirement,
  PromptRequirements,
  PromptSpan,
  SubjectComplexity,
} from "../types";

/**
 * RequirementObservations — the objective, prompt-grounded perceptions a
 * classifier extracts (LLM or otherwise). Perception is the hard, language-aware
 * part; keeping it separate from policy lets the policy below stay a pure,
 * deterministically-testable function while perception quality is measured by a
 * live eval.
 */
export const CHARACTER_KINDS = ["human", "animal", "mechanical"] as const;
export type CharacterKind = (typeof CHARACTER_KINDS)[number];

export const STYLE_MEDIUMS = [
  "photoreal",
  "stylized",
  "abstract",
  "unspecified",
] as const;
export type StyleMedium = (typeof STYLE_MEDIUMS)[number];

export interface RequirementObservations {
  hasWater: boolean;
  hasFire: boolean;
  hasParticulate: boolean;
  hasFlowingCloth: boolean;
  hasCollision: boolean;
  characterKinds: CharacterKind[];
  showsFace: boolean;
  showsBodyMotion: boolean;
  speaks: boolean;
  emotionalIntensity: EmotionalIntensity;
  environmentType: EnvironmentType;
  hasArchitecture: boolean;
  hasNature: boolean;
  hasUrbanElements: boolean;
  lightingMood: LightingRequirement;
  hasPracticalLights: boolean;
  hasAtmospherics: boolean;
  styleMedium: StyleMedium;
  isCinematic: boolean;
  specificAesthetic: string | null;
  cameraComplexity: CameraComplexity;
  subjectMotionComplexity: SubjectComplexity;
  hasMorphing: boolean;
  hasTransitions: boolean;
}

/** All-negative perceptions — the safe default and fallback base. */
export function neutralObservations(): RequirementObservations {
  return {
    hasWater: false,
    hasFire: false,
    hasParticulate: false,
    hasFlowingCloth: false,
    hasCollision: false,
    characterKinds: [],
    showsFace: false,
    showsBodyMotion: false,
    speaks: false,
    emotionalIntensity: "none",
    environmentType: "abstract",
    hasArchitecture: false,
    hasNature: false,
    hasUrbanElements: false,
    lightingMood: "natural",
    hasPracticalLights: false,
    hasAtmospherics: false,
    styleMedium: "unspecified",
    isCinematic: false,
    specificAesthetic: null,
    cameraComplexity: "static",
    subjectMotionComplexity: "static",
    hasMorphing: false,
    hasTransitions: false,
  };
}

const resolveSpanRole = (span: PromptSpan): string | null => {
  if (typeof span.role === "string" && span.role.trim().length > 0) {
    return span.role.trim();
  }
  const maybeCategory = span.category;
  return typeof maybeCategory === "string" && maybeCategory.trim().length > 0
    ? maybeCategory.trim()
    : null;
};

const countComplexity = (count: number): "simple" | "moderate" | "complex" =>
  count <= 1 ? "simple" : count <= 3 ? "moderate" : "complex";

const scoreToComplexity = (score: number, max: number): ComplexityLevel => {
  const ratio = score / max;
  if (ratio === 0) return "none";
  if (ratio <= 0.25) return "simple";
  if (ratio <= 0.5) return "moderate";
  return "complex";
};

/**
 * Span-based confidence — preserved verbatim from the prior implementation so
 * the recommendation honesty-cap (confidenceScore < 0.4) keeps the same
 * behaviour. Confidence reflects how much labelled signal exists, not
 * perception, so it stays span-derived rather than LLM-derived.
 */
const calculateConfidence = (spans: PromptSpan[]): number => {
  if (spans.length === 0) return 0.3;
  const spanConfidence = Math.min(spans.length / 10, 1);
  const avgSpanConfidence =
    spans.reduce((sum, span) => sum + (span.confidence ?? 0.5), 0) /
    spans.length;
  return spanConfidence * 0.4 + avgSpanConfidence * 0.6;
};

/**
 * Pure policy: turn perceptions + labelled spans into the requirement flags
 * ModelScoringService consumes. Semantic flags come from observations; counts,
 * detectedCategories, and confidence stay span-derived (deterministic).
 */
export function mapObservationsToRequirements(
  obs: RequirementObservations,
  spans: PromptSpan[],
): PromptRequirements {
  const roles = spans
    .map(resolveSpanRole)
    .filter((role): role is string => typeof role === "string");
  const envCount = roles.filter((role) =>
    role.startsWith("environment."),
  ).length;
  const lightingCount = roles.filter((role) =>
    role.startsWith("lighting."),
  ).length;

  const physicsEffects = [
    obs.hasWater,
    obs.hasFire,
    obs.hasParticulate,
    obs.hasFlowingCloth,
    obs.hasCollision,
  ].filter(Boolean).length;

  const hasHuman = obs.characterKinds.includes("human");

  return {
    physics: {
      hasComplexPhysics: obs.hasWater || obs.hasFire || physicsEffects >= 2,
      hasParticleSystems: obs.hasParticulate,
      hasFluidDynamics: obs.hasWater,
      hasSoftBodyPhysics: obs.hasFlowingCloth,
      physicsComplexity: scoreToComplexity(physicsEffects, 5),
    },
    character: {
      hasHumanCharacter: hasHuman,
      hasAnimalCharacter: obs.characterKinds.includes("animal"),
      hasMechanicalCharacter: obs.characterKinds.includes("mechanical"),
      requiresFacialPerformance: hasHuman && obs.showsFace,
      requiresBodyLanguage: hasHuman && obs.showsBodyMotion,
      requiresLipSync: obs.speaks,
      emotionalIntensity: obs.emotionalIntensity,
    },
    environment: {
      complexity: countComplexity(envCount),
      type: obs.environmentType,
      hasArchitecture: obs.hasArchitecture,
      hasNature: obs.hasNature,
      hasUrbanElements: obs.hasUrbanElements,
    },
    lighting: {
      requirements: obs.lightingMood,
      complexity: countComplexity(lightingCount),
      hasPracticalLights: obs.hasPracticalLights,
      requiresAtmospherics: obs.hasAtmospherics,
    },
    style: {
      isPhotorealistic: obs.styleMedium === "photoreal",
      isStylized: obs.styleMedium === "stylized",
      isAbstract: obs.styleMedium === "abstract",
      requiresCinematicLook: obs.isCinematic,
      hasSpecificAesthetic: obs.specificAesthetic,
    },
    motion: {
      cameraComplexity: obs.cameraComplexity,
      subjectComplexity: obs.subjectMotionComplexity,
      hasMorphing: obs.hasMorphing,
      // A morph is a transformation over time, so it always implies a
      // transition (preserves the prior implementation's coupling).
      hasTransitions: obs.hasMorphing || obs.hasTransitions,
    },
    detectedCategories: roles,
    confidenceScore: calculateConfidence(spans),
  };
}

/**
 * Degraded fallback for when the perception classifier is unavailable. Derives
 * observations from taxonomy ROLES only (no text wordlists, no regex) — it
 * cannot see water/fire/style, so those stay neutral; it infers what the role
 * vocabulary genuinely supports and defers the rest.
 */
export function deriveRequirementsFromRoles(
  spans: PromptSpan[],
): PromptRequirements {
  const roles = spans
    .map(resolveSpanRole)
    .filter((role): role is string => typeof role === "string");
  const has = (prefix: string): boolean =>
    roles.some((role) => role === prefix || role.startsWith(`${prefix}.`));
  const actionCount = roles.filter((role) => role.startsWith("action.")).length;
  const hasWeather = has("environment.weather");
  const hasEmotion = roles.includes("subject.emotion");

  const observations: RequirementObservations = {
    ...neutralObservations(),
    hasParticulate: hasWeather,
    hasAtmospherics: hasWeather,
    characterKinds: has("subject") ? ["human"] : [],
    showsFace: hasEmotion,
    showsBodyMotion: actionCount > 0,
    emotionalIntensity: hasEmotion ? "moderate" : "none",
    cameraComplexity: has("camera") ? "moderate" : "static",
    subjectMotionComplexity:
      actionCount === 0
        ? "static"
        : actionCount <= 1
          ? "simple"
          : actionCount <= 2
            ? "moderate"
            : "complex",
  };

  return mapObservationsToRequirements(observations, spans);
}
