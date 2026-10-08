import type { PromptEditorWiring } from "@features/workspace-shell/components/PromptEditorSurface";
import type { Generation, GenerationsPanelProps } from "@features/generations/types";

export interface PromptCanvasViewProps {
  editing: PromptEditorWiring;
  generationsPanelProps: GenerationsPanelProps;
  onReuseGeneration: (generation: Generation) => void;
  onToggleGenerationFavorite: (generationId: string, isFavorite: boolean) => void;
}
