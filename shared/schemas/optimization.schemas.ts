/**
 * Zod schemas for prompt-optimization API contracts.
 *
 * Canonical source — both client and server import from here.
 * `.passthrough()` allows forward-compatible additions without breaking
 * existing consumers.
 */
import { z } from "zod";
import { ApiSuccessResponseSchema } from "./api.schemas.js";

// ---------------------------------------------------------------------------
// Shared enums / atoms
// ---------------------------------------------------------------------------

export const CompilationStatusSchema = z.enum([
  "compiled",
  "generic-fallback",
  "compile-skipped",
]);

export const CompileSourceKindSchema = z.enum([
  "artifact",
  "artifactKey",
  "prompt",
]);

// ---------------------------------------------------------------------------
// Locked span (request contract for POST /api/optimize)
// ---------------------------------------------------------------------------

/**
 * A span the user locked against rewriting. Wire contract is lenient (`id`
 * optional, fields nullable); the client UI guarantees ids on the spans it
 * constructs, which satisfies this contract structurally.
 */
export const LockedSpanSchema = z.object({
  id: z.string().max(512).optional(),
  text: z.string().min(1).max(2000),
  leftCtx: z.string().max(2000).optional().nullable(),
  rightCtx: z.string().max(2000).optional().nullable(),
  category: z.string().max(256).optional().nullable(),
  source: z.string().max(256).optional().nullable(),
  confidence: z.number().optional().nullable(),
});

export type LockedSpan = z.infer<typeof LockedSpanSchema>;

// ---------------------------------------------------------------------------
// Intent lock state (attached to compilation metadata)
// ---------------------------------------------------------------------------

export const CompilationIntentLockStateSchema = z
  .object({
    passed: z.boolean(),
    repaired: z.boolean(),
    skippedRepair: z.boolean(),
    warning: z.string().optional(),
    required: z.object({
      subject: z.string().nullable(),
      action: z.string().nullable(),
    }),
  })
  .passthrough();

export type CompilationIntentLockState = z.infer<
  typeof CompilationIntentLockStateSchema
>;

// ---------------------------------------------------------------------------
// Compilation state
// ---------------------------------------------------------------------------

export const CompilationStateSchema = z
  .object({
    status: CompilationStatusSchema,
    usedFallback: z.boolean(),
    reason: z.string().optional(),
    sourceKind: CompileSourceKindSchema,
    structuredArtifactReused: z.boolean(),
    analyzerBypassed: z.boolean(),
    compiledFor: z.string().nullable(),
    intentLock: CompilationIntentLockStateSchema.optional(),
  })
  .passthrough();

export type CompilationState = z.infer<typeof CompilationStateSchema>;

// ---------------------------------------------------------------------------
// Optimize response (wire format from POST /api/optimize)
// ---------------------------------------------------------------------------

/**
 * The `data` payload of a successful optimize response.
 *
 * `previewPrompt`, `aspectRatio` and `genericPrompt` are typed fields because
 * clients read them. They used to be loose keys inside `metadata`, which meant
 * two client hooks each hand-wrote `typeof x === "string"` guards to read them.
 * Quality verdicts are NOT here: the intent verdict already travels inside
 * `compilation.intentLock`, and lint verdicts go to telemetry, whose consumer is
 * the Measurement Program rather than the UI.
 */
export const OptimizeDataSchema = z
  .object({
    prompt: z.string(),
    optimizedPrompt: z.string().optional(),
    /**
     * The renderer's short preview composition of the slots, produced before any
     * model-specific compile. Distinct from `genericPrompt`, which is the full
     * rendering the compile step consumes.
     */
    previewPrompt: z.string().optional(),
    aspectRatio: z.string().optional(),
    /** The full prompt before any model-specific compile; equals `prompt` when none ran. */
    genericPrompt: z.string().optional(),
    artifactKey: z.string().optional(),
    compilation: CompilationStateSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type OptimizeData = z.infer<typeof OptimizeDataSchema>;

/** Canonical success envelope for POST /api/optimize (errors surface as
 *  thrown ApiErrors on the client — see shared/types/api.ts). */
export const OptimizeResponseSchema =
  ApiSuccessResponseSchema(OptimizeDataSchema);

export type OptimizeResponse = z.infer<typeof OptimizeResponseSchema>;

// ---------------------------------------------------------------------------
// Compile response (wire format from POST /api/optimize-compile)
// ---------------------------------------------------------------------------

/** The `data` payload of a successful compile response. */
export const CompileDataSchema = z
  .object({
    compiledPrompt: z.string(),
    artifactKey: z.string().optional(),
    compilation: CompilationStateSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    targetModel: z.string().optional(),
  })
  .passthrough();

export type CompileData = z.infer<typeof CompileDataSchema>;

/** Canonical success envelope for POST /api/optimize-compile. */
export const CompileResponseSchema =
  ApiSuccessResponseSchema(CompileDataSchema);

export type CompileResponse = z.infer<typeof CompileResponseSchema>;
