import { z } from "zod";
import { CAMERA_MOTION_CATEGORIES } from "@/features/convergence/types";
import {
  loadActiveTab,
  loadCameraMotion,
  loadImageSubTab,
  loadKeyframes,
  loadSubjectMotion,
} from "./generationControlsStorage";
import {
  loadGenerationParams,
  loadSelectedModel,
  loadVideoTier,
} from "@features/prompt-optimizer/context/promptStateStorage";
import {
  DEFAULT_GENERATION_CONTROLS_STATE,
  type GenerationControlsState,
} from "./generationControlsStoreTypes";

const STORAGE_KEY = "prompt-optimizer:generationControlsStore";

const CapabilityValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const CapabilityValuesSchema = z.record(z.string(), CapabilityValueSchema);

const ActiveTabSchema = z.enum(["video", "image"]);
const ImageSubTabSchema = z.enum(["references", "styles"]);
const VideoTierSchema = z.enum(["draft", "render"]);

const Position3DSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const Rotation3DSchema = z.object({
  pitch: z.number(),
  yaw: z.number(),
  roll: z.number(),
});

const CameraTransformSchema = z.object({
  position: Position3DSchema,
  rotation: Rotation3DSchema,
});

const CameraPathSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    category: z.enum(CAMERA_MOTION_CATEGORIES),
    start: CameraTransformSchema,
    end: CameraTransformSchema,
    duration: z.number(),
  })
  .passthrough();

const KeyframeTileSchema = z.object({
  id: z.string(),
  url: z.string(),
  source: z.enum(["upload", "library", "generation", "asset"]),
  assetId: z.string().optional(),
  sourcePrompt: z.string().optional(),
  storagePath: z.string().optional(),
  viewUrlExpiresAt: z.string().optional(),
  // Lineage for generation-sourced frames — z.object strips unknown keys,
  // so omitting this here silently severed a rehydrated frame's source.
  generationId: z.string().optional(),
});

const KeyframesArraySchema = z.array(KeyframeTileSchema).max(3);

const VideoReferenceImageSchema = z.object({
  id: z.string(),
  url: z.string(),
  referenceType: z.enum(["asset", "style"]),
  source: z.enum(["upload", "library", "asset"]),
  storagePath: z.string().optional(),
  assetId: z.string().optional(),
  viewUrlExpiresAt: z.string().optional(),
});

const ExtendVideoSourceSchema = z.object({
  url: z.string(),
  source: z.enum(["generation", "upload"]),
  generationId: z.string().optional(),
  storagePath: z.string().optional(),
  assetId: z.string().optional(),
});

const GenerationControlsStoreSchema = z.object({
  domain: z.object({
    selectedModel: z.string(),
    generationParams: CapabilityValuesSchema,
    videoTier: VideoTierSchema,
    keyframes: KeyframesArraySchema,
    startFrame: KeyframeTileSchema.nullable().optional().default(null),
    endFrame: KeyframeTileSchema.nullable().optional().default(null),
    videoReferenceImages: z
      .array(VideoReferenceImageSchema)
      .optional()
      .default([]),
    extendVideo: ExtendVideoSourceSchema.nullable().optional().default(null),
    cameraMotion: CameraPathSchema.nullable(),
    subjectMotion: z.string(),
  }),
  ui: z.object({
    activeTab: ActiveTabSchema,
    imageSubTab: ImageSubTabSchema,
  }),
});

const safeParseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const buildLegacyState = (): GenerationControlsState => ({
  domain: (() => {
    const keyframes = loadKeyframes();
    return {
      selectedModel: loadSelectedModel(),
      generationParams: loadGenerationParams(),
      videoTier: loadVideoTier(),
      keyframes,
      startFrame: keyframes[0] ?? null,
      endFrame: null,
      videoReferenceImages: [],
      extendVideo: null,
      cameraMotion: loadCameraMotion(),
      subjectMotion: loadSubjectMotion(),
    };
  })(),
  ui: {
    activeTab: loadActiveTab(),
    imageSubTab: loadImageSubTab(),
  },
});

const migrateStartFrame = (
  state: GenerationControlsState,
): GenerationControlsState => {
  if (state.domain.startFrame) return state;
  if (!state.domain.keyframes[0]) return state;
  return {
    ...state,
    domain: {
      ...state.domain,
      startFrame: state.domain.keyframes[0],
    },
  };
};

export const loadGenerationControlsStoreState = (): GenerationControlsState => {
  if (typeof window === "undefined") {
    return DEFAULT_GENERATION_CONTROLS_STATE;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = GenerationControlsStoreSchema.safeParse(
        safeParseJson(raw),
      );
      if (parsed.success) {
        return migrateStartFrame(parsed.data as GenerationControlsState);
      }
    }
  } catch {
    // ignore
  }

  return migrateStartFrame(buildLegacyState());
};

export const persistGenerationControlsStoreState = (
  state: GenerationControlsState,
): void => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }

  // Legacy keys are no longer written; keep load-only migration for one release.
};
