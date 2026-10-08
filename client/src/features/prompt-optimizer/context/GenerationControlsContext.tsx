import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  DraftModel,
  GenerationOverrides,
} from "@features/generation-controls";
import { useKeyframeUrlRefresh } from "../hooks/useKeyframeUrlRefresh";

export interface GenerationControlsHandlers {
  onDraft: (model: DraftModel, overrides?: GenerationOverrides) => void;
  onRender: (model: string, overrides?: GenerationOverrides) => void;
  isGenerating: boolean;
  isSubmitting?: boolean | undefined;
  activeDraftModel: string | null;
}

interface GenerationControlsContextValue {
  controls: GenerationControlsHandlers | null;
  setControls: (controls: GenerationControlsHandlers | null) => void;
}

const GenerationControlsContext =
  createContext<GenerationControlsContextValue | null>(null);

export function GenerationControlsProvider({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  const [controls, setControls] = useState<GenerationControlsHandlers | null>(
    null,
  );
  useKeyframeUrlRefresh();

  const contextValue = useMemo<GenerationControlsContextValue>(
    () => ({
      controls,
      setControls,
    }),
    [controls],
  );

  return (
    <GenerationControlsContext.Provider value={contextValue}>
      {children}
    </GenerationControlsContext.Provider>
  );
}

export function useGenerationControlsContext(): GenerationControlsContextValue {
  const context = useContext(GenerationControlsContext);
  if (!context) {
    throw new Error(
      "useGenerationControlsContext must be used within GenerationControlsProvider",
    );
  }
  return context;
}
