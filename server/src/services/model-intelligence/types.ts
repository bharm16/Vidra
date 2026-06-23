import type { CanonicalPromptModelId } from "@shared/videoModels";
import {
  COST_TIERS as SHARED_COST_TIERS,
  QUALITY_TIERS as SHARED_QUALITY_TIERS,
  SPEED_TIERS as SHARED_SPEED_TIERS,
} from "@shared/modelCatalog";

export type { ModelCapabilities } from "@shared/modelCatalog";

export const COMPLEXITY_LEVELS = [
  "none",
  "simple",
  "moderate",
  "complex",
] as const;
export type ComplexityLevel = (typeof COMPLEXITY_LEVELS)[number];

export const EMOTIONAL_INTENSITY = [
  "none",
  "subtle",
  "moderate",
  "intense",
] as const;
export type EmotionalIntensity = (typeof EMOTIONAL_INTENSITY)[number];

export const ENVIRONMENT_TYPES = [
  "interior",
  "exterior",
  "abstract",
  "mixed",
] as const;
export type EnvironmentType = (typeof ENVIRONMENT_TYPES)[number];

export const LIGHTING_REQUIREMENTS = [
  "natural",
  "stylized",
  "dramatic",
  "mixed",
] as const;
export type LightingRequirement = (typeof LIGHTING_REQUIREMENTS)[number];

export const CAMERA_COMPLEXITY = [
  "static",
  "simple",
  "moderate",
  "complex",
] as const;
export type CameraComplexity = (typeof CAMERA_COMPLEXITY)[number];

export const SUBJECT_COMPLEXITY = [
  "static",
  "simple",
  "moderate",
  "complex",
] as const;
export type SubjectComplexity = (typeof SUBJECT_COMPLEXITY)[number];

export const SPEED_TIERS = SHARED_SPEED_TIERS;
export type SpeedTier = (typeof SHARED_SPEED_TIERS)[number];

export const COST_TIERS = SHARED_COST_TIERS;
export type CostTier = (typeof SHARED_COST_TIERS)[number];

export const QUALITY_TIERS = SHARED_QUALITY_TIERS;
export type QualityTier = (typeof SHARED_QUALITY_TIERS)[number];

export interface PromptSpan {
  text: string;
  role?: string;
  category?: string;
  start?: number;
  end?: number;
  confidence?: number;
}

export interface PromptRequirements {
  physics: {
    hasComplexPhysics: boolean;
    hasParticleSystems: boolean;
    hasFluidDynamics: boolean;
    hasSoftBodyPhysics: boolean;
    physicsComplexity: ComplexityLevel;
  };
  character: {
    hasHumanCharacter: boolean;
    hasAnimalCharacter: boolean;
    hasMechanicalCharacter: boolean;
    requiresFacialPerformance: boolean;
    requiresBodyLanguage: boolean;
    requiresLipSync: boolean;
    emotionalIntensity: EmotionalIntensity;
  };
  environment: {
    complexity: "simple" | "moderate" | "complex";
    type: EnvironmentType;
    hasArchitecture: boolean;
    hasNature: boolean;
    hasUrbanElements: boolean;
  };
  lighting: {
    requirements: LightingRequirement;
    complexity: "simple" | "moderate" | "complex";
    hasPracticalLights: boolean;
    requiresAtmospherics: boolean;
  };
  style: {
    isPhotorealistic: boolean;
    isStylized: boolean;
    isAbstract: boolean;
    requiresCinematicLook: boolean;
    hasSpecificAesthetic: string | null;
  };
  motion: {
    cameraComplexity: CameraComplexity;
    subjectComplexity: SubjectComplexity;
    hasMorphing: boolean;
    hasTransitions: boolean;
  };
  detectedCategories: string[];
  confidenceScore: number;
}

export interface FactorScore {
  factor: string;
  label: string;
  weight: number;
  capability: number;
  contribution: number;
  explanation: string;
}

export interface ModelScore {
  modelId: CanonicalPromptModelId;
  overallScore: number;
  factorScores: FactorScore[];
  strengths: string[];
  weaknesses: string[];
  warnings: string[];
}

export interface ModelRecommendation {
  promptId: string;
  prompt: string;
  requirements: PromptRequirements;
  recommendations: ModelScore[];
  recommended: {
    modelId: CanonicalPromptModelId;
    confidence: "high" | "medium" | "low";
    reasoning: string;
  };
  alsoConsider?: {
    modelId: CanonicalPromptModelId;
    reasoning: string;
  };
  suggestComparison: boolean;
  comparisonModels?: [CanonicalPromptModelId, CanonicalPromptModelId];
  filteredOut?: Array<{ modelId: CanonicalPromptModelId; reason: string }>;
  computedAt: Date;
}
