import React from "react";

import type { PromptCanvasProps } from "./types";
import { SelectedSpanProvider } from "../context/SelectedSpanContext";
import { usePromptCanvasOrchestration } from "./hooks/usePromptCanvasOrchestration";
import { PromptCanvasView } from "./components/PromptCanvasView";

// Main PromptCanvas Component: a render wrapper around the orchestration
// hook — all hook composition, effects, and handlers live in
// usePromptCanvasOrchestration.
export function PromptCanvas(props: PromptCanvasProps): React.ReactElement {
  const { selectedSpanValue, viewProps } = usePromptCanvasOrchestration(props);

  return (
    <SelectedSpanProvider value={selectedSpanValue}>
      <PromptCanvasView {...viewProps} />
    </SelectedSpanProvider>
  );
}
