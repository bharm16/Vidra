export type SessionStatus = "active" | "completed" | "archived";

export type SessionPromptKeyframeSource =
  | "upload"
  | "library"
  | "generation"
  | "asset";

export interface SessionPromptKeyframe {
  id?: string;
  url: string;
  source?: SessionPromptKeyframeSource;
  assetId?: string;
  storagePath?: string;
  viewUrlExpiresAt?: string;
}

export interface SessionPromptVersionEdit {
  timestamp: string;
  delta?: number;
  source?: "manual" | "suggestion" | "unknown";
}

export interface SessionPromptVersionPreview {
  generatedAt: string;
  imageUrl?: string | null;
  aspectRatio?: string | null;
  storagePath?: string | null;
  assetId?: string | null;
  viewUrlExpiresAt?: string | null;
}

export interface SessionPromptVersionVideo {
  generatedAt: string;
  videoUrl?: string | null;
  model?: string | null;
  generationParams?: Record<string, unknown> | null;
  storagePath?: string | null;
  assetId?: string | null;
  viewUrlExpiresAt?: string | null;
}

/**
 * A generation record persisted under a version — a picture or a clip, and a
 * node in the space (ADR-0013). Historically an untyped bag; M5 adds the two
 * lineage fields the space reads. The index signature keeps the change
 * additive: existing writers/readers that treat it as a loose record still
 * type-check.
 */
export interface SessionGenerationRecord {
  /** Stable generation id (randomUUID / job id at persist time). */
  id?: string;
  /**
   * The generation this one descends from (ADR-0013). `null`/absent = root:
   * a picture roots at its words-version (that edge is structural — the
   * picture lives in the version's `generations`). A clip names its source
   * picture's generation id here, yielding the picture→clip edge.
   */
  ancestorGenerationId?: string | null;
  /**
   * Soft-removal flag (M5 leaf-only removal). Archived records persist for
   * history but are excluded from the rendered space.
   */
  archived?: boolean;
  [key: string]: unknown;
}

export interface SessionPromptVersionEntry {
  versionId: string;
  label?: string;
  signature: string;
  prompt: string;
  timestamp: string;
  highlights?: Record<string, unknown>;
  editCount?: number;
  edits?: SessionPromptVersionEdit[];
  preview?: SessionPromptVersionPreview;
  video?: SessionPromptVersionVideo;
  generations?: SessionGenerationRecord[];
}

export interface SessionPrompt {
  uuid?: string;
  title?: string | null;
  input: string;
  output: string;
  score?: number | null;
  mode?: string;
  targetModel?: string | null;
  generationParams?: Record<string, unknown> | null;
  keyframes?: SessionPromptKeyframe[] | null;
  brainstormContext?: Record<string, unknown> | null;
  highlightCache?: Record<string, unknown> | null;
  versions?: SessionPromptVersionEntry[];
}

export type SessionGenerationMode = "continuity" | "standard";
export type SessionContinuityMode =
  | "frame-bridge"
  | "style-match"
  | "native"
  | "none";

export interface SessionStyleReference {
  id: string;
  sourceVideoId?: string | undefined;
  sourceFrameIndex?: number | undefined;
  frameUrl: string;
  frameTimestamp: number;
  resolution: { width: number; height: number };
  aspectRatio: string;
  analysisMetadata?:
    | {
        dominantColors: string[];
        lightingDescription: string;
        moodDescription: string;
        confidence: number;
      }
    | undefined;
  extractedAt?: string | undefined;
}

export interface SessionFrameBridge {
  id: string;
  sourceVideoId: string;
  sourceShotId: string;
  frameUrl: string;
  framePosition: "first" | "last" | "representative";
  frameTimestamp: number;
  resolution: { width: number; height: number };
  aspectRatio: string;
  extractedAt: string;
}

export interface SessionSeedInfo {
  seed: number;
  provider: string;
  modelId: string;
  extractedAt: string;
}

export interface SessionContinuityShot {
  id: string;
  sessionId: string;
  sequenceIndex: number;
  userPrompt: string;
  generationMode?: SessionGenerationMode | undefined;
  continuityMode: SessionContinuityMode;
  styleStrength: number;
  styleReferenceId: string | null;
  styleReference?: SessionStyleReference | undefined;
  frameBridge?: SessionFrameBridge | undefined;
  characterAssetId?: string | undefined;
  faceStrength?: number | undefined;
  camera?:
    | {
        yaw?: number | undefined;
        pitch?: number | undefined;
        roll?: number | undefined;
        dolly?: number | undefined;
      }
    | undefined;
  modelId: string;
  seedInfo?: SessionSeedInfo | undefined;
  inheritedSeed?: number | undefined;
  videoAssetId?: string | undefined;
  previewAssetId?: string | undefined;
  generatedKeyframeUrl?: string | undefined;
  styleTransferApplied?: boolean | undefined;
  styleDegraded?: boolean | undefined;
  styleDegradedReason?: string | undefined;
  sceneProxyRenderUrl?: string | undefined;
  continuityMechanismUsed?: string | undefined;
  styleScore?: number | undefined;
  identityScore?: number | undefined;
  qualityScore?: number | undefined;
  retryCount?: number | undefined;
  status:
    | "draft"
    | "generating-keyframe"
    | "generating-video"
    | "completed"
    | "failed";
  error?: string | undefined;
  createdAt: string;
  generatedAt?: string | undefined;
  versions?: SessionPromptVersionEntry[] | undefined;
}

export interface SessionContinuitySettings {
  generationMode: SessionGenerationMode;
  defaultContinuityMode: SessionContinuityMode;
  defaultStyleStrength: number;
  defaultModel: string;
  autoExtractFrameBridge: boolean;
  useCharacterConsistency: boolean;
  useSceneProxy?: boolean | undefined;
  autoRetryOnFailure?: boolean | undefined;
  maxRetries?: number | undefined;
  qualityThresholds?:
    | {
        style: number;
        identity: number;
      }
    | undefined;
}

export interface SessionSceneProxy {
  id: string;
  proxyType: string;
  referenceFrameUrl: string;
  depthMapUrl?: string | undefined;
  status: "ready" | "failed" | "building";
  createdAt?: string | undefined;
  error?: string | undefined;
}

export interface SessionContinuity {
  shots: SessionContinuityShot[];
  primaryStyleReference?: SessionStyleReference | null | undefined;
  sceneProxy?: SessionSceneProxy | null | undefined;
  settings: SessionContinuitySettings;
}

export interface SessionDto {
  id: string;
  userId: string;
  name?: string | undefined;
  description?: string | undefined;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  prompt?: SessionPrompt | undefined;
  continuity?: SessionContinuity | undefined;
}
