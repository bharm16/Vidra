import { z } from "zod";

import {
  SessionContinuityModeSchema,
  SessionGenerationModeSchema,
} from "#shared/schemas/session.schemas";

export const CreateShotSchema = z
  .object({
    prompt: z.string().min(1),
    continuityMode: SessionContinuityModeSchema.optional(),
    generationMode: SessionGenerationModeSchema.optional(),
    styleReferenceId: z.string().nullable().optional(),
    styleStrength: z.number().optional(),
    sourceVideoId: z.string().optional(),
    modelId: z.string().optional(),
    characterAssetId: z.string().optional(),
    faceStrength: z.number().optional(),
    versions: z.array(z.record(z.string(), z.unknown())).optional(),
    camera: z
      .object({
        yaw: z.number().optional(),
        pitch: z.number().optional(),
        roll: z.number().optional(),
        dolly: z.number().optional(),
      })
      .partial()
      .optional(),
  })
  .strip();

export const UpdateShotSchema = z
  .object({
    prompt: z.string().optional(),
    continuityMode: SessionContinuityModeSchema.optional(),
    generationMode: SessionGenerationModeSchema.optional(),
    styleReferenceId: z.string().nullable().optional(),
    styleStrength: z.number().optional(),
    modelId: z.string().optional(),
    characterAssetId: z.string().nullable().optional(),
    faceStrength: z.number().optional(),
    versions: z.array(z.record(z.string(), z.unknown())).optional(),
    camera: z
      .object({
        yaw: z.number().optional(),
        pitch: z.number().optional(),
        roll: z.number().optional(),
        dolly: z.number().optional(),
      })
      .partial()
      .optional(),
  })
  .strip();

export const UpdateStyleReferenceSchema = z
  .object({
    styleReferenceId: z.string().nullable(),
  })
  .strip();

export const UpdateSessionSettingsSchema = z
  .object({
    settings: z.record(z.string(), z.unknown()),
  })
  .strip();

export const UpdatePrimaryStyleReferenceSchema = z
  .object({
    sourceVideoId: z.string().optional(),
    sourceImageUrl: z.string().optional(),
  })
  .strip();

export const CreateSceneProxySchema = z
  .object({
    sourceShotId: z.string().optional(),
    sourceVideoId: z.string().optional(),
  })
  .strip();

export const SceneProxyCameraSchema = z
  .object({
    yaw: z.number().optional(),
    pitch: z.number().optional(),
    roll: z.number().optional(),
    dolly: z.number().optional(),
  })
  .partial();

export const PreviewSceneProxySchema = z
  .object({
    camera: SceneProxyCameraSchema.optional(),
  })
  .strip();
