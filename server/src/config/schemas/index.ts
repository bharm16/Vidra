/**
 * Schema Barrel Export
 *
 * Central export point for all validation schemas.
 * Organized by domain: prompts and suggestions.
 */

// Prompt schemas
export {
  promptSchema,
  type PromptRequest,
  compileSchema,
  type CompileRequest,
} from "./promptSchemas.ts";

// Suggestion schemas
export {
  suggestionSchema,
  customSuggestionSchema,
  sceneChangeSchema,
  type SuggestionRequest,
  type CustomSuggestionRequest,
  type SceneChangeRequest,
} from "./suggestionSchemas.ts";
