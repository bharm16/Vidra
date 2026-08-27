import { useState } from "react";

export function usePromptUiState(): {
  showResults: boolean;
  setShowResults: (show: boolean) => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  showShortcuts: boolean;
  setShowShortcuts: (show: boolean) => void;
  showImprover: boolean;
  setShowImprover: (show: boolean) => void;
  showBrainstorm: boolean;
  setShowBrainstorm: (show: boolean) => void;
  currentAIIndex: number;
  setCurrentAIIndex: (index: number) => void;
  outputSaveState: "idle" | "saving" | "saved" | "error";
  setOutputSaveState: (state: "idle" | "saving" | "saved" | "error") => void;
  outputLastSavedAt: number | null;
  setOutputLastSavedAt: (timestampMs: number | null) => void;
} {
  const [showResults, setShowResults] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showShortcuts, setShowShortcuts] = useState<boolean>(false);
  const [showImprover, setShowImprover] = useState<boolean>(false);
  const [showBrainstorm, setShowBrainstorm] = useState<boolean>(false);
  const [currentAIIndex, setCurrentAIIndex] = useState<number>(0);
  const [outputSaveState, setOutputSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [outputLastSavedAt, setOutputLastSavedAt] = useState<number | null>(
    null,
  );

  return {
    showResults,
    setShowResults,
    showSettings,
    setShowSettings,
    showShortcuts,
    setShowShortcuts,
    showImprover,
    setShowImprover,
    showBrainstorm,
    setShowBrainstorm,
    currentAIIndex,
    setCurrentAIIndex,
    outputSaveState,
    setOutputSaveState,
    outputLastSavedAt,
    setOutputLastSavedAt,
  };
}
