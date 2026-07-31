/**
 * Session contract types.
 *
 * Every type here is inferred from the Zod schemas in
 * `shared/schemas/session.schemas.ts` — that module is the single
 * declaration, so a schema and its type cannot disagree. It previously could:
 * `SessionGenerationRecord` carried the ADR-0013 lineage fields while the
 * schema parsed generations as an unvalidated `Record<string, unknown>`.
 *
 * The continuity/convergence half (`SessionContinuity*`, `SessionStyleReference`,
 * `SessionFrameBridge`, `SessionSeedInfo`, `SessionSceneProxy`) belongs to the
 * stack frozen by ADR-0002. It is derived here unchanged; its shapes were not
 * touched.
 */
import type { z } from "zod";
import type {
  SessionContinuityModeSchema,
  SessionContinuitySchema,
  SessionContinuitySettingsSchema,
  SessionContinuityShotSchema,
  SessionDtoSchema,
  SessionFrameBridgeSchema,
  SessionGenerationModeSchema,
  SessionGenerationRecordSchema,
  SessionPromptKeyframeSchema,
  SessionPromptKeyframeSourceSchema,
  SessionPromptSchema,
  SessionPromptVersionEditSchema,
  SessionPromptVersionEntrySchema,
  SessionPromptVersionPreviewSchema,
  SessionPromptVersionVideoSchema,
  SessionSceneProxySchema,
  SessionSeedInfoSchema,
  SessionStatusSchema,
  SessionStyleReferenceSchema,
} from "../schemas/session.schemas.js";

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export type SessionPromptKeyframeSource = z.infer<
  typeof SessionPromptKeyframeSourceSchema
>;

export type SessionPromptKeyframe = z.infer<typeof SessionPromptKeyframeSchema>;

export type SessionPromptVersionEdit = z.infer<
  typeof SessionPromptVersionEditSchema
>;

export type SessionPromptVersionPreview = z.infer<
  typeof SessionPromptVersionPreviewSchema
>;

export type SessionPromptVersionVideo = z.infer<
  typeof SessionPromptVersionVideoSchema
>;

/**
 * A generation record persisted under a version — a picture or a clip, and a
 * node in the space (ADR-0013). The record stays open (index signature) so
 * existing writers/readers that treat it as a loose bag still type-check;
 * `id`, `ancestorGenerationId` and `archived` are the declared, validated
 * fields the space reads.
 */
export type SessionGenerationRecord = z.infer<
  typeof SessionGenerationRecordSchema
>;

export type SessionPromptVersionEntry = z.infer<
  typeof SessionPromptVersionEntrySchema
>;

export type SessionPrompt = z.infer<typeof SessionPromptSchema>;

export type SessionGenerationMode = z.infer<typeof SessionGenerationModeSchema>;

export type SessionContinuityMode = z.infer<typeof SessionContinuityModeSchema>;

export type SessionStyleReference = z.infer<typeof SessionStyleReferenceSchema>;

export type SessionFrameBridge = z.infer<typeof SessionFrameBridgeSchema>;

export type SessionSeedInfo = z.infer<typeof SessionSeedInfoSchema>;

export type SessionContinuityShot = z.infer<typeof SessionContinuityShotSchema>;

export type SessionContinuitySettings = z.infer<
  typeof SessionContinuitySettingsSchema
>;

export type SessionSceneProxy = z.infer<typeof SessionSceneProxySchema>;

export type SessionContinuity = z.infer<typeof SessionContinuitySchema>;

export type SessionDto = z.infer<typeof SessionDtoSchema>;
