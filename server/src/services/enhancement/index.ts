/**
 * Enhancement Service - Barrel Exports
 * Provides backward compatibility and clean imports
 */

export { EnhancementService } from "./EnhancementService.js";

// Export moved services
export { BrainstormContextBuilder } from "./services/BrainstormContextBuilder.js";
export { detectPlaceholder } from "./services/placeholderDetection.js";
export { CleanPromptBuilder } from "./services/CleanPromptBuilder.js";
export { SuggestionDiversityEnforcer } from "./services/SuggestionDeduplicator.js";
export { SuggestionValidationService } from "./services/SuggestionValidationService.js";

// Export configuration
export * from "./config/schemas.js";
