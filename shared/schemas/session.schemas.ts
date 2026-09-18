/**
 * Zod schemas for the session contract — the single declaration. The types in
 * `shared/types/session.ts` are `z.infer`'d from these, so there is no mirror
 * to keep in sync.
 *
 * The DTOs are closed objects: an unknown server-side addition still parses
 * (it is dropped rather than rejected), so the contract stays
 * forward-compatible, but the inferred types name exactly the fields a
 * consumer may read. `SessionGenerationRecordSchema` is the deliberate
 * exception — a generation record is an open bag by contract, so it stays
 * loose while still validating the fields the space depends on.
 */
import { z } from "zod";

export const SessionStatusSchema = z.enum(["active", "completed", "archived"]);

export const SessionPromptKeyframeSourceSchema = z.enum([
  "upload",
  "library",
  "generation",
  "asset",
]);

export const SessionPromptKeyframeSchema = z.object({
  id: z.string().optional(),
  url: z.string(),
  source: SessionPromptKeyframeSourceSchema.optional(),
  assetId: z.string().optional(),
  storagePath: z.string().optional(),
  viewUrlExpiresAt: z.string().optional(),
  // A generation-sourced frame keeps its lineage across restore: the picture
  // it came from (M5 2b — an animated clip names its source) and the words
  // that produced it.
  generationId: z.string().optional(),
  sourcePrompt: z.string().optional(),
});

export const SessionPromptVersionEditSchema = z.object({
  timestamp: z.string(),
  delta: z.number().optional(),
  source: z.enum(["manual", "suggestion", "unknown"]).optional(),
});

/**
 * The first frame generated for a words-version — the source image an I2V model
 * animates (CONTEXT.md → First frame).
 *
 * Persisted under `preview` until 2026-08-10, when that term was retired for
 * naming nothing. `SessionPromptVersionEntrySchema` still accepts the old
 * spelling so sessions written before the rename keep their frames; readers
 * coalesce the two and writers emit `firstFrame`, so a session migrates the
 * first time it is saved.
 */
export const SessionPromptVersionFirstFrameSchema = z.object({
  generatedAt: z.string(),
  imageUrl: z.string().nullable().optional(),
  aspectRatio: z.string().nullable().optional(),
  storagePath: z.string().nullable().optional(),
  assetId: z.string().nullable().optional(),
  viewUrlExpiresAt: z.string().nullable().optional(),
});

export const SessionPromptVersionVideoSchema = z.object({
  generatedAt: z.string(),
  videoUrl: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  generationParams: z.record(z.string(), z.unknown()).nullable().optional(),
  storagePath: z.string().nullable().optional(),
  assetId: z.string().nullable().optional(),
  viewUrlExpiresAt: z.string().nullable().optional(),
});

/**
 * Where a take entered the session from — ADR-0022 decision 1.
 *
 * Closed on purpose, and validated at the wire rather than deduced from which
 * other fields happen to be populated. An unrecognized origin must be a parse
 * error: rendered instead, it would be a plausible lie about the one question
 * admission exists to answer. A clip's origin is always `generated`.
 */
export const TAKE_ORIGINS = [
  "generated",
  "upload",
  "sketchpad",
  "studio",
] as const;
export const TakeOriginSchema = z.enum(TAKE_ORIGINS);

/**
 * What kind of thing contributed to a take — ADR-0022 decision 3.
 *
 * One entry per contributing input; a take may have several. `take` is the
 * only kind that can also be the display ancestor, because it is the only kind
 * that is itself a node in this session's space.
 */
export const TAKE_SOURCE_INPUT_KINDS = [
  "take",
  "upload",
  "sketch",
  "studio-image",
] as const;
export const TakeSourceInputKindSchema = z.enum(TAKE_SOURCE_INPUT_KINDS);

export const TakeSourceInputSchema = z.object({
  kind: TakeSourceInputKindSchema,
  /** Set iff `kind === "take"` — the contributing take's identity. */
  generationId: z.string().optional(),
  /** Durable handles to the contributing media, so the input outlives a URL. */
  assetId: z.string().optional(),
  storagePath: z.string().optional(),
});

/**
 * What actually produced the media — ADR-0022 decision 2.
 *
 * Distinct from the take's associated words (`prompt` / `promptVersionId`),
 * which are the direction restored into the input when the take is selected.
 * They frequently coincide and are never the same field: restoring "remove the
 * chair" into the input would be nonsense, and inventing a shot description for
 * an upload would be a fabrication. `unknown` is a recorded answer, not a gap.
 *
 * Extending the `known` variant (a live output's seed/strength/steps, say) is
 * an additive member here — the union is the place that grows, not a free-form
 * bag beside it.
 */
export const SketchProductionSettingsSchema = z.object({
  /**
   * The seed the image was actually made with. The relay reports the seed it
   * used; the requested one is recorded only when it does not (issue #87).
   */
  seed: z.number().int(),
  strength: z.number().min(0).max(1),
  steps: z.number().int().min(1),
});

export const TakeProductionProvenanceSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unknown") }),
  z.object({
    state: z.literal("known"),
    /** The prompt or edit instruction that produced this media. */
    instruction: z.string(),
    model: z.string().nullable().optional(),
    /**
     * ADR-0022 decision 5: the settings an accepted live output was made
     * with. Closed and additive, exactly as this union's note anticipated —
     * the drawing that went in is a `sketch` source input, because that is
     * where a durable media handle belongs.
     */
    sketch: SketchProductionSettingsSchema.optional(),
  }),
]);

/**
 * A generation record persisted under a version — a picture or a clip, and a
 * node in the space (ADR-0013). Historically an untyped bag, and the schema
 * treated it as one (`z.record(z.string(), z.unknown())`), so the two lineage
 * fields the space actually reads were validated nowhere: a record carrying
 * `ancestorGenerationId: 42` parsed clean and rendered as a root.
 *
 * The fields the lineage and the admission contract depend on are declared.
 * The object stays loose so the rest of the bag (tier, status, urls, …) still
 * rides along untouched — this is a schema addition, not a narrowing.
 */
export const SessionGenerationRecordSchema = z
  .object({
    /** Stable generation id (randomUUID / job id at persist time). */
    id: z.string().optional(),
    /**
     * The generation this one descends from (ADR-0013), and — ADR-0022
     * decision 3 — the take's DISPLAY ANCESTOR: the single relationship the
     * space draws, chosen from `sourceInputs` rather than guessed from sibling
     * order. `null`/absent = no take ancestor: the take hangs from its
     * words-version (that edge is structural — the record lives in that
     * version's `generations`). A clip names its source picture here, yielding
     * the picture→clip `move` edge; a refined picture names the picture it was
     * refined from, yielding the `refine` edge inside the picture column.
     */
    ancestorGenerationId: z.string().nullable().optional(),
    /**
     * Soft-removal flag (M5 leaf-only removal). Archived records persist for
     * history but are excluded from the rendered space.
     */
    archived: z.boolean().optional(),
    /** ADR-0022 decision 1. Absent on records written before the contract. */
    origin: TakeOriginSchema.optional(),
    /** ADR-0022 decision 2. */
    productionProvenance: TakeProductionProvenanceSchema.optional(),
    /**
     * ADR-0022 decision 3: every contributing input, in full. The display
     * ancestor above is one of these (or absent); the rest are recorded but
     * not drawn.
     */
    sourceInputs: z.array(TakeSourceInputSchema).optional(),
  })
  .passthrough();

export const SessionPromptVersionEntrySchema = z.object({
  versionId: z.string(),
  label: z.string().optional(),
  signature: z.string(),
  prompt: z.string(),
  timestamp: z.string(),
  highlights: z.record(z.string(), z.unknown()).optional(),
  editCount: z.number().optional(),
  edits: z.array(SessionPromptVersionEditSchema).optional(),
  firstFrame: SessionPromptVersionFirstFrameSchema.optional(),
  /** @deprecated Pre-2026-08-10 spelling of `firstFrame`. Read-only compatibility. */
  preview: SessionPromptVersionFirstFrameSchema.optional(),
  video: SessionPromptVersionVideoSchema.optional(),
  generations: z.array(SessionGenerationRecordSchema).optional(),
});

export const SessionPromptSchema = z.object({
  uuid: z.string().optional(),
  title: z.string().nullable().optional(),
  input: z.string(),
  output: z.string(),
  score: z.number().nullable().optional(),
  mode: z.string().optional(),
  targetModel: z.string().nullable().optional(),
  generationParams: z.record(z.string(), z.unknown()).nullable().optional(),
  keyframes: z.array(SessionPromptKeyframeSchema).nullable().optional(),
  brainstormContext: z.record(z.string(), z.unknown()).nullable().optional(),
  highlightCache: z.record(z.string(), z.unknown()).nullable().optional(),
  versions: z.array(SessionPromptVersionEntrySchema).optional(),
});

export const SessionGenerationModeSchema = z.enum(["continuity", "standard"]);
export const SessionShotStatusSchema = z.enum([
  "draft",
  "generating-keyframe",
  "generating-video",
  "completed",
  "failed",
]);
export const SessionContinuityModeSchema = z.enum([
  "frame-bridge",
  "style-match",
  "native",
  "none",
]);

export const SessionStyleReferenceSchema = z.object({
  id: z.string(),
  sourceVideoId: z.string().optional(),
  sourceFrameIndex: z.number().optional(),
  frameUrl: z.string(),
  frameTimestamp: z.number(),
  resolution: z.object({ width: z.number(), height: z.number() }),
  aspectRatio: z.string(),
  analysisMetadata: z
    .object({
      dominantColors: z.array(z.string()),
      lightingDescription: z.string(),
      moodDescription: z.string(),
      confidence: z.number(),
    })
    .optional(),
  extractedAt: z.string().optional(),
});

export const SessionFrameBridgeSchema = z.object({
  id: z.string(),
  sourceVideoId: z.string(),
  sourceShotId: z.string(),
  frameUrl: z.string(),
  framePosition: z.enum(["first", "last", "representative"]),
  frameTimestamp: z.number(),
  resolution: z.object({ width: z.number(), height: z.number() }),
  aspectRatio: z.string(),
  extractedAt: z.string(),
});

export const SessionSeedInfoSchema = z.object({
  seed: z.number(),
  provider: z.string(),
  modelId: z.string(),
  extractedAt: z.string(),
});

export const SessionContinuityShotSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  sequenceIndex: z.number(),
  userPrompt: z.string(),
  generationMode: SessionGenerationModeSchema.optional(),
  continuityMode: SessionContinuityModeSchema,
  styleStrength: z.number(),
  styleReferenceId: z.string().nullable(),
  styleReference: SessionStyleReferenceSchema.optional(),
  frameBridge: SessionFrameBridgeSchema.optional(),
  characterAssetId: z.string().optional(),
  faceStrength: z.number().optional(),
  camera: z
    .object({
      yaw: z.number().optional(),
      pitch: z.number().optional(),
      roll: z.number().optional(),
      dolly: z.number().optional(),
    })
    .optional(),
  modelId: z.string(),
  seedInfo: SessionSeedInfoSchema.optional(),
  inheritedSeed: z.number().optional(),
  videoAssetId: z.string().optional(),
  previewAssetId: z.string().optional(),
  generatedKeyframeUrl: z.string().optional(),
  styleTransferApplied: z.boolean().optional(),
  styleDegraded: z.boolean().optional(),
  styleDegradedReason: z.string().optional(),
  sceneProxyRenderUrl: z.string().optional(),
  continuityMechanismUsed: z.string().optional(),
  styleScore: z.number().optional(),
  identityScore: z.number().optional(),
  qualityScore: z.number().optional(),
  retryCount: z.number().optional(),
  status: SessionShotStatusSchema,
  error: z.string().optional(),
  createdAt: z.string(),
  generatedAt: z.string().optional(),
  versions: z.array(SessionPromptVersionEntrySchema).optional(),
});

export const SessionContinuitySettingsSchema = z.object({
  generationMode: SessionGenerationModeSchema,
  defaultContinuityMode: SessionContinuityModeSchema,
  defaultStyleStrength: z.number(),
  defaultModel: z.string(),
  autoExtractFrameBridge: z.boolean(),
  useCharacterConsistency: z.boolean(),
  useSceneProxy: z.boolean().optional(),
  autoRetryOnFailure: z.boolean().optional(),
  maxRetries: z.number().optional(),
  qualityThresholds: z
    .object({
      style: z.number(),
      identity: z.number(),
    })
    .optional(),
});

export const SessionSceneProxySchema = z.object({
  id: z.string(),
  proxyType: z.string(),
  referenceFrameUrl: z.string(),
  depthMapUrl: z.string().optional(),
  status: z.enum(["ready", "failed", "building"]),
  createdAt: z.string().optional(),
  error: z.string().optional(),
});

export const SessionContinuitySchema = z.object({
  shots: z.array(SessionContinuityShotSchema),
  primaryStyleReference: SessionStyleReferenceSchema.nullable().optional(),
  sceneProxy: SessionSceneProxySchema.nullable().optional(),
  settings: SessionContinuitySettingsSchema,
});

export const SessionDtoSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  status: SessionStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  prompt: SessionPromptSchema.optional(),
  continuity: SessionContinuitySchema.optional(),
});
