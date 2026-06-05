/**
 * Video Prompt Analysis Service - Barrel Exports
 * Provides backward compatibility and clean imports
 */

export { VideoPromptService } from "./VideoPromptService";
export type { VideoPromptServiceDeps } from "./VideoPromptService";

// Export detection services for advanced usage
export { VideoPromptDetectionService } from "./services/detection/VideoPromptDetectionService";
export { ModelDetectionService } from "./services/detection/ModelDetectionService";
export { SectionDetectionService } from "./services/detection/SectionDetectionService";

// Export analysis services for advanced usage
export { PhraseRoleAnalysisService } from "./services/analysis/PhraseRoleAnalysisService";
export { ConstraintGenerationService } from "./services/analysis/ConstraintGenerationService";

// Export guidance services for advanced usage
export { FallbackStrategyService } from "./services/guidance/FallbackStrategyService";
export { CategoryGuidanceService } from "./services/guidance/CategoryGuidanceService";

// Export Multimodal Asset Manager
export { MultimodalAssetManager } from "./services/MultimodalAssetManager";
export type {
  AssetType,
  ProviderType,
  AssetUploadRequest,
  StagedAsset,
  ProviderUploadResult,
  CameoValidationResult,
  AssetDescriptionResult,
} from "./services/MultimodalAssetManager";

// Export utilities
export { countWords, isSentence, normalizeText } from "./utils/textHelpers";
export { TechStripper, techStripper } from "./utils/TechStripper";
export type { TechStripperResult } from "./utils/TechStripper";
export { SafetySanitizer, safetySanitizer } from "./utils/SafetySanitizer";
export type {
  SafetySanitizerResult,
  SanitizationReplacement,
} from "./utils/SafetySanitizer";

// Export strategies, registry, and strategy types
export {
  StrategyRegistry,
  BaseStrategy,
  RunwayStrategy,
  LumaStrategy,
  KlingStrategy,
  SoraStrategy,
  VeoStrategy,
  WanStrategy,
} from "./strategies";
export type { StrategyFactory } from "./strategies";
export type {
  PromptOptimizationResult,
  OptimizationMetadata,
  PhaseResult,
  PromptContext,
  AssetReference,
  PromptOptimizationStrategy,
  NormalizeResult,
  TransformResult,
  AugmentResult,
} from "./strategies";

// Export types
export type * from "./types";
export type * from "./services/detection/ModelDetectionService";
export type * from "./services/detection/SectionDetectionService";
