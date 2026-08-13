import React from "react";

import { SelectedSpanProvider } from "../context/SelectedSpanContext";
import { usePromptCanvasOrchestration } from "./hooks/usePromptCanvasOrchestration";
import { PromptCanvasView } from "./components/PromptCanvasView";

// Main PromptCanvas Component: a render wrapper around the orchestration
// hook — all hook composition, effects, and handlers live in
// usePromptCanvasOrchestration, which reads the workspace contexts itself.
export function PromptCanvas(): React.ReactElement {
  const { selectedSpanValue, viewProps } = usePromptCanvasOrchestration();

  return (
    <SelectedSpanProvider value={selectedSpanValue}>
      <PromptCanvasView {...viewProps} />
    </SelectedSpanProvider>
  );
}
