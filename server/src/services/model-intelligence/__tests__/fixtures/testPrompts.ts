import type {
  PromptRequirements,
  PromptSpan,
} from "@services/model-intelligence/types";

export const SAMPLE_PROMPT =
  "A robot walks through heavy rain in a neon city, dramatic cinematic lighting.";

export const SAMPLE_SPANS: PromptSpan[] = [
  { text: "robot", role: "subject.identity" },
  { text: "heavy rain", role: "environment.weather.rain" },
  { text: "neon city", role: "environment.urban" },
  { text: "dramatic cinematic lighting", role: "lighting.cinematic" },
];

export const BASE_REQUIREMENTS: PromptRequirements = {
  physics: {
    hasComplexPhysics: false,
    hasParticleSystems: false,
    hasFluidDynamics: false,
    hasSoftBodyPhysics: false,
    physicsComplexity: "none",
  },
  character: {
    hasHumanCharacter: false,
    hasAnimalCharacter: false,
    hasMechanicalCharacter: false,
    requiresFacialPerformance: false,
    requiresBodyLanguage: false,
    requiresLipSync: false,
    emotionalIntensity: "none",
  },
  environment: {
    complexity: "simple",
    type: "abstract",
    hasArchitecture: false,
    hasNature: false,
    hasUrbanElements: false,
  },
  lighting: {
    requirements: "natural",
    complexity: "simple",
    hasPracticalLights: false,
    requiresAtmospherics: false,
  },
  style: {
    isPhotorealistic: false,
    isStylized: false,
    isAbstract: false,
    requiresCinematicLook: false,
    hasSpecificAesthetic: null,
  },
  motion: {
    cameraComplexity: "static",
    subjectComplexity: "static",
    hasMorphing: false,
    hasTransitions: false,
  },
  detectedCategories: [],
  confidenceScore: 0.5,
};
