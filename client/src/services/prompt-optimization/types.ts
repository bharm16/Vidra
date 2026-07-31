import type { LockedSpan } from "@/features/prompt-optimizer/types";
import type { CapabilityValues } from "@shared/capabilities";

// Re-export shared contract types so existing consumer imports keep working.
export type {
  CompilationIntentLockState,
  CompilationState,
  OptimizeResponse,
  CompileResponse,
} from "@shared/schemas/optimization.schemas";

// Import the schemas for runtime validation at the fetch boundary.
export {
  OptimizeResponseSchema,
  CompileResponseSchema,
} from "@shared/schemas/optimization.schemas";

// ---------------------------------------------------------------------------
// Client-only request types (not shared — these are input shapes the client
// constructs before sending to the server).
// ---------------------------------------------------------------------------

export interface OptimizeOptions {
  prompt: string;
  mode: string;
  targetModel?: string;
  context?: unknown | null;
  brainstormContext?: unknown | null;
  generationParams?: CapabilityValues;
  skipCache?: boolean;
  lockedSpans?: LockedSpan[];
  startImage?: string;
  sourcePrompt?: string;
  signal?: AbortSignal;
}

/**
 * Wire-format response from POST /api/optimize.
 *
 * Derived from the schema that parses it, so the two cannot drift.
 */
export type OptimizeResult =
  import("@shared/schemas/optimization.schemas").OptimizeData;

export interface CompileOptions {
  prompt?: string;
  artifactKey?: string;
  targetModel: string;
  context?: unknown | null;
  signal?: AbortSignal;
}

/**
 * Wire-format response from POST /api/optimize-compile.
 *
 * Derived from the schema that parses it, so the two cannot drift.
 */
export type CompileResult =
  import("@shared/schemas/optimization.schemas").CompileData;
