import type { PromptVersionEntry } from "@features/prompt-optimizer";
import type { VideoTier } from "@features/generation-controls";
import type { TimelineItem } from "@features/prompt-optimizer/types/domain/timeline";
import type {
  Generation,
  GenerationParams,
} from "@features/prompt-optimizer/types/domain/generation";

export type {
  Generation,
  GenerationMediaType,
  GenerationParams,
  GenerationSettingsSnapshot,
  GenerationStatus,
  GenerationTier,
} from "@features/prompt-optimizer/types/domain/generation";

export interface GenerationsPanelStateSnapshot {
  generations: Generation[];
  activeGenerationId: string | null;
  isGenerating: boolean;
  selectedFrameUrl: string | null;
}

export interface GenerationsPanelRuntime {
  generations: Generation[];
  activeGenerationId: string | null;
  isGenerating: boolean;
  selectedFrameUrl: string | null;
  timeline: TimelineItem[];
  totalVisibleGenerations: number;
  canExtendGenerations: boolean;
  heroGeneration: Generation | null;
  handleRetry: (generation: Generation) => void;
  handleDelete: (generation: Generation) => void;
  handleDownload: (generation: Generation) => void;
  handleExtendGeneration: (generation: Generation) => void;
  handleCancel: (generation: Generation) => void;
  handleSelectFrame: (
    url: string,
    frameIndex: number,
    generationId: string,
  ) => void;
  handleClearSelectedFrame: () => void;
  setActiveGeneration: (generationId: string | null) => void;
}

export interface GenerationsPanelProps {
  prompt: string;
  promptVersionId: string;
  aspectRatio: string;
  duration?: number | undefined;
  fps?: number | undefined;
  generationParams?: Record<string, unknown> | undefined;
  initialGenerations?: Generation[] | undefined;
  onGenerationsChange?: (generations: Generation[]) => void;
  presentation?: "timeline" | "hero" | undefined;
  onStateSnapshot?:
    | ((snapshot: GenerationsPanelStateSnapshot) => void)
    | undefined;
  heroOverrideGenerationId?: string | null | undefined;
  runtime?: GenerationsPanelRuntime | undefined;
  className?: string;
  versions: PromptVersionEntry[];
  onCreateVersionIfNeeded: () => string;
}
