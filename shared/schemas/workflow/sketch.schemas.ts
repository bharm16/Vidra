import { z } from "zod";
import { SketchProductionInputsSchema } from "../sketch.schemas";
import { OwnerIdSchema, ProjectIdSchema, TimestampSchema, VersionIdSchema } from "./identity.schemas";
import { OwnedObjectSchema } from "./media.schemas";

export const SketchCaptureIdSchema = z.string().regex(/^capture_[A-Za-z0-9_-]+$/).max(120);
export const SketchPictureDataUriSchema = z.string().max(12_000_000).regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/);
const CapturedSketchInputsSchema = SketchProductionInputsSchema.extend({ prompt: z.string().min(1).max(32000) }).strict();
/** One immutable press, including the frame's producing inputs, never today's draft. */
export const ProjectSketchCaptureCommandSchema = z.strictObject({
  captureId: SketchCaptureIdSchema,
  displayedFrameId: z.string().min(1).max(160),
  displayedAt: TimestampSchema,
  outputDataUri: SketchPictureDataUriSchema,
  drawingDataUri: SketchPictureDataUriSchema,
  inputs: CapturedSketchInputsSchema,
});
export type ProjectSketchCaptureCommand = z.infer<typeof ProjectSketchCaptureCommandSchema>;

export const ProjectSketchCaptureRecordSchema = z.strictObject({
  captureId: SketchCaptureIdSchema, ownerId: OwnerIdSchema, projectId: ProjectIdSchema,
  versionId: VersionIdSchema, displayedFrameId: z.string().min(1).max(160), displayedAt: TimestampSchema,
  inputs: CapturedSketchInputsSchema, intentHash: z.string().regex(/^[a-f0-9]{64}$/),
  outputSha256: z.string().regex(/^[a-f0-9]{64}$/), drawingSha256: z.string().regex(/^[a-f0-9]{64}$/),
  drawingObject: OwnedObjectSchema.optional(), createdAt: TimestampSchema,
  state: z.enum(["saving", "saved"]),
});
export type ProjectSketchCaptureRecord = z.infer<typeof ProjectSketchCaptureRecordSchema>;

/** Pixel coordinates belong to an exact immutable source and geometry. */
export const ProjectAreaMaskSchema = z.strictObject({
  versionId: VersionIdSchema, width: z.number().int().positive().max(16384), height: z.number().int().positive().max(16384),
  transform: z.literal("identity"), dataUri: SketchPictureDataUriSchema,
});
export type ProjectAreaMask = z.infer<typeof ProjectAreaMaskSchema>;
