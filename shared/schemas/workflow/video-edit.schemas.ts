import { z } from "zod";
import { DraftIdSchema, EditIdSchema, OwnerIdSchema, ProjectIdSchema, RevisionSchema, SubmissionIdSchema, TimestampSchema, VersionIdSchema, WorkflowSchemaVersion } from "./identity.schemas";
import { MediaVersionSchema } from "./media.schemas";

export const VideoPresetSchema = z.enum(["landscape", "portrait", "square"]);
export const VideoCaptionPlacementSchema = z.enum(["top-left", "top-center", "top-right", "centre-left", "centre-center", "centre-right", "bottom-left", "bottom-center", "bottom-right"]);
const ElementIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const FrameSchema = z.number().int().min(0).max(1_000_000);
// Clip-relative offsets may become negative after a trim. Retain them for explicit repair.
const SourceAudioTimingSchema = z.strictObject({ startFrame: z.number().int().min(-1_000_000).max(1_000_000), endFrame: z.number().int().min(-1_000_000).max(1_000_000) });
export const VideoCropSchema = z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) });
export const VideoItemSchema = z.strictObject({
  id: ElementIdSchema, versionId: VersionIdSchema, kind: z.enum(["picture", "clip"]),
  inFrame: FrameSchema, outFrame: FrameSchema, displayFrames: FrameSchema,
  fit: z.enum(["fit", "fill", "crop"]), crop: VideoCropSchema.optional(),
  sourceAudio: z.strictObject({ muted: z.boolean(), gain: z.number().min(0).max(4), timing: SourceAudioTimingSchema.optional(), removed: z.boolean().optional() }),
});
export const VideoTextSchema = z.strictObject({
  id: ElementIdSchema, text: z.string().max(2000),
  anchor: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("composition") }), z.strictObject({ kind: z.literal("item"), itemId: ElementIdSchema })]),
  startFrame: z.number().int().min(-1_000_000).max(1_000_000), endFrame: z.number().int().min(-1_000_000).max(1_000_000),
  x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1),
  // Pixels in the exported video; fractional sizes preserve design precision.
  fontSize: z.number().finite().min(12).max(240), fontWeight: z.union([z.literal(400), z.literal(500), z.literal(600)]).default(500), color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  // Optional typography preserves legacy captured manifests; absence retains Inter and its existing metrics.
  fontFamily: z.enum(["Inter", "Figtree"]).optional(), letterSpacingEm: z.number().finite().min(-0.2).max(1).optional(), lineHeightEm: z.number().finite().min(0.5).max(4).optional(),
  background: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(), align: z.enum(["left", "center", "right"]),
  placement: VideoCaptionPlacementSchema.optional(),
});
export const VideoBackgroundAudioSchema = z.strictObject({ id: ElementIdSchema, versionId: VersionIdSchema, sourceInFrame: FrameSchema, startFrame: FrameSchema, endFrame: FrameSchema, gain: z.number().min(0).max(4) });
export const VideoCompositionSchema = z.strictObject({
  normalizationVersion: z.literal("vidra-cfr30/v1"), preset: VideoPresetSchema, fps: z.literal(30),
  items: z.array(VideoItemSchema).max(32), text: z.array(VideoTextSchema).max(100), backgroundAudio: VideoBackgroundAudioSchema.optional(),
});
// Older stored issues may name a source by version in elementId and omit versionId.
export const VideoValidationIssueSchema = z.strictObject({ elementId: z.string(), code: z.string(), message: z.string(), versionId: VersionIdSchema.optional(), unsupportedCodePoints: z.array(z.number().int().min(0).max(0x10ffff)).max(2000).optional() });
export const VideoCaptionValidationDetailsSchema = z.strictObject({
  kind: z.literal("video-caption-validation"), ownerId: OwnerIdSchema, projectId: ProjectIdSchema, editId: EditIdSchema, revision: RevisionSchema,
  issues: z.array(VideoValidationIssueSchema.extend({ elementId: ElementIdSchema, code: z.literal("text_render_policy"), message: z.string().min(1).max(2000) })).min(1).max(100),
});
export const EditCommandKindSchema = z.enum(["replace_composition", "insert", "remove", "move", "trim", "duration", "replace", "transform", "preset", "text", "remove_text", "source_audio", "background_audio", "copy_audio", "restore"]);
/** The saved command behind a revision. Revisions saved before this field existed have none. */
export const VideoEditChangeSchema = z.strictObject({ kind: EditCommandKindSchema, restoredFrom: RevisionSchema.optional() })
  .refine(change => (change.kind === "restore") === (change.restoredFrom !== undefined), "Only a restore names the revision it restored.");
export const VideoEditSchema = z.strictObject({
  schemaVersion: WorkflowSchemaVersion, id: EditIdSchema, ownerId: OwnerIdSchema, projectId: ProjectIdSchema,
  name: z.string().trim().min(1).max(300), revision: RevisionSchema, composition: VideoCompositionSchema,
  issues: z.array(VideoValidationIssueSchema), change: VideoEditChangeSchema.optional(), createdAt: TimestampSchema, updatedAt: TimestampSchema,
});
export const CreateVideoEditSchema = z.strictObject({ id: EditIdSchema, name: z.string().trim().min(1).max(300), composition: VideoCompositionSchema });
export const EditCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("replace_composition"), composition: VideoCompositionSchema }),
  z.strictObject({ kind: z.literal("insert"), item: VideoItemSchema, index: z.number().int().min(0).max(32) }),
  z.strictObject({ kind: z.literal("remove"), itemId: ElementIdSchema }),
  z.strictObject({ kind: z.literal("move"), itemId: ElementIdSchema, index: z.number().int().min(0).max(31) }),
  z.strictObject({ kind: z.literal("trim"), itemId: ElementIdSchema, inFrame: FrameSchema, outFrame: FrameSchema }),
  z.strictObject({ kind: z.literal("duration"), itemId: ElementIdSchema, displayFrames: FrameSchema }),
  z.strictObject({ kind: z.literal("replace"), itemId: ElementIdSchema, versionId: VersionIdSchema, mediaKind: z.enum(["picture", "clip"]), inFrame: FrameSchema, outFrame: FrameSchema, changeDuration: z.boolean() }),
  z.strictObject({ kind: z.literal("transform"), itemId: ElementIdSchema, fit: z.enum(["fit", "fill", "crop"]), crop: VideoCropSchema.optional() }),
  z.strictObject({ kind: z.literal("preset"), preset: VideoPresetSchema, fits: z.array(z.strictObject({ itemId: ElementIdSchema, fit: z.enum(["fit", "fill", "crop"]), crop: VideoCropSchema.optional() })).max(32) }),
  z.strictObject({ kind: z.literal("text"), text: VideoTextSchema }),
  z.strictObject({ kind: z.literal("remove_text"), textId: ElementIdSchema }),
  z.strictObject({ kind: z.literal("source_audio"), itemId: ElementIdSchema, muted: z.boolean(), gain: z.number().min(0).max(4), timing: SourceAudioTimingSchema.optional(), removed: z.boolean().optional() }),
  z.strictObject({ kind: z.literal("background_audio"), audio: VideoBackgroundAudioSchema.nullable() }),
  z.strictObject({ kind: z.literal("copy_audio"), itemId: ElementIdSchema, audioId: ElementIdSchema }),
  z.strictObject({ kind: z.literal("restore"), sourceRevision: RevisionSchema }),
]);
export const SaveVideoEditSchema = z.strictObject({ operationId: ElementIdSchema, expectedRevision: RevisionSchema, command: EditCommandSchema });
export const ExportIdSchema = z.string().regex(/^export_[A-Za-z0-9_-]+$/).max(160);
export const CreateVideoExportSchema = z.strictObject({ submissionId: SubmissionIdSchema, executionDraftId: DraftIdSchema, executionDraftRevision: RevisionSchema, revision: RevisionSchema, preset: VideoPresetSchema, retryOf: ExportIdSchema.optional() });
export const StoredVideoExportSchema = z.strictObject({ storagePath: z.string().min(1), generation: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive(), versionId: VersionIdSchema });
export const VideoExportSchema = z.strictObject({
  schemaVersion: WorkflowSchemaVersion, id: ExportIdSchema, ownerId: OwnerIdSchema, projectId: ProjectIdSchema, editId: EditIdSchema, revision: RevisionSchema,
  submissionId: SubmissionIdSchema, executionDraftId: DraftIdSchema, executionDraftRevision: RevisionSchema, retryOf: ExportIdSchema.optional(),
  composition: VideoCompositionSchema, compositionHash: z.string().regex(/^[a-f0-9]{64}$/), sources: z.array(MediaVersionSchema).max(33),
  renderer: z.string().min(1), attemptId: ElementIdSchema,
  state: z.enum(["queued", "rendering", "cancel_requested", "storing", "linking", "ready", "failed", "cancelled", "attention"]),
  progress: z.number().min(0).max(1), message: z.string().max(2000).optional(), stored: StoredVideoExportSchema.optional(),
  // A failure caused by a permanently unavailable source names it; older failures carry only a message.
  failedItemId: ElementIdSchema.optional(), failedVersionId: VersionIdSchema.optional(),
  createdAt: TimestampSchema, updatedAt: TimestampSchema,
});
export type VideoPreset = z.infer<typeof VideoPresetSchema>;
export type VideoCaptionPlacement = z.infer<typeof VideoCaptionPlacementSchema>;
export type VideoItem = z.infer<typeof VideoItemSchema>;
export type VideoText = z.infer<typeof VideoTextSchema>;
export type VideoComposition = z.infer<typeof VideoCompositionSchema>;
export type VideoValidationIssue = z.infer<typeof VideoValidationIssueSchema>;
export type VideoCaptionValidationDetails = z.infer<typeof VideoCaptionValidationDetailsSchema>;
export type VideoEdit = z.infer<typeof VideoEditSchema>;
export type VideoEditRevision = VideoEdit;
export type EditCommand = z.infer<typeof EditCommandSchema>;
export type VideoEditChange = z.infer<typeof VideoEditChangeSchema>;
export type VideoExport = z.infer<typeof VideoExportSchema>;
export type StoredVideoExport = z.infer<typeof StoredVideoExportSchema>;
