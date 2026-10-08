import React, { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CanvasWorkspace } from "@features/workspace-shell";
import type { PromptCanvasViewProps } from "./PromptCanvasView.types";

/** The sole workspace layout. Marks keep their inline explanation and fix. */
export function PromptCanvasView({
  editing,
  generationsPanelProps,
  onReuseGeneration,
  onToggleGenerationFavorite,
}: PromptCanvasViewProps): React.ReactElement {
  const navigate = useNavigate();
  const openStudioProject = useCallback(
    (projectId: string) => navigate(`/studio/${projectId}`),
    [navigate],
  );
  return (
    <>
      <CanvasWorkspace
        generationsPanelProps={generationsPanelProps}
        onReuseGeneration={onReuseGeneration}
        onToggleGenerationFavorite={onToggleGenerationFavorite}
        onOpenStudioProject={openStudioProject}
        onOpenSketch={() => navigate("/live-editor")}
        editing={editing}
      />
    </>
  );
}
