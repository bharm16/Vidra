import type {
  GenerationMediaType,
  GenerationSettingsSnapshot,
} from "@features/generations/types";
import type { GenerationTier } from "@/features/prompt-optimizer/types/domain/generation";

/**
 * The tier a gallery entry was generated at — the same `draft | render` axis
 * the rest of the client speaks (`GenerationTier`, `VideoTier`). It carries no
 * lifecycle meaning: a draft is not superseded by a render, both are takes.
 *
 * Deliberately NOT a third vocabulary. This used to be
 * `"preview" | "draft" | "final"`, where `"preview"` meant *storyboard* — a
 * fourth meaning of a word the glossary had already spent twice. Storyboards
 * are identified by `mediaType === "image-sequence"`, which is where that
 * distinction actually lives.
 */
export type GalleryTier = GenerationTier;

export interface GalleryPromptSpan {
  start: number;
  end: number;
  category: string;
}

export interface GalleryGeneration {
  id: string;
  tier: GalleryTier;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  mediaType: GenerationMediaType;
  prompt: string;
  model: string;
  duration?: string | undefined;
  resolution?: string | undefined;
  aspectRatio?: string | undefined;
  createdAt: number;
  isFavorite: boolean;
  generationSettings: GenerationSettingsSnapshot | null;
  promptSpans?: GalleryPromptSpan[] | undefined;
  /** Asset ID for the primary media (image or video) — enables asset-based URL resolution. */
  mediaAssetId?: string | null | undefined;
  /** Asset ID for the thumbnail image — enables asset-based URL resolution. */
  thumbnailAssetId?: string | null | undefined;
}

export interface GalleryPanelProps {
  generations: GalleryGeneration[];
  activeGenerationId?: string | null | undefined;
  onSelectGeneration: (generationId: string) => void;
  onClose: () => void;
}
