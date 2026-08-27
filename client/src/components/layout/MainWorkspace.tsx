import React from "react";
import PromptOptimizerWorkspace from "@/features/prompt-optimizer/PromptOptimizerContainer";
import { GenerationControlsProvider } from "@/features/prompt-optimizer/context/GenerationControlsContext";

/**
 * MainWorkspace - Unified renderer for Studio/Create tools
 */
export function MainWorkspace(): React.ReactElement {
  return (
    <GenerationControlsProvider>
      <PromptOptimizerWorkspace />
    </GenerationControlsProvider>
  );
}

MainWorkspace.displayName = "MainWorkspace";

export default MainWorkspace;
