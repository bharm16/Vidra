import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { PromptModals } from "@features/prompt-optimizer/components/PromptModals";
import {
  usePromptServices,
  usePromptUIStateContext,
} from "@features/prompt-optimizer/context/PromptStateContext";
import { useSettings } from "@components/Settings";
import type {
  PromptServicesState,
  PromptUIState,
} from "@features/prompt-optimizer/context/types";
import type { AppSettings } from "@components/Settings";

vi.mock("@features/prompt-optimizer/context/PromptStateContext", () => ({
  usePromptServices: vi.fn(),
  usePromptUIStateContext: vi.fn(),
}));

vi.mock("@components/Settings", () => ({
  __esModule: true,
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (
    <div>
      <span>Settings Open: {isOpen ? "yes" : "no"}</span>
      <button type="button" onClick={onClose}>
        Close Settings
      </button>
    </div>
  ),
  useSettings: vi.fn(),
}));

vi.mock("@components/KeyboardShortcuts", () => ({
  __esModule: true,
  default: ({ isOpen }: { isOpen: boolean }) => (
    <div>Shortcuts Open: {isOpen ? "yes" : "no"}</div>
  ),
}));

vi.mock("@/PromptImprovementForm", () => ({
  __esModule: true,
  default: ({ initialPrompt }: { initialPrompt: string }) => (
    <div>Improver: {initialPrompt}</div>
  ),
}));

const mockUsePromptUIStateContext = vi.mocked(usePromptUIStateContext);
const mockUsePromptServices = vi.mocked(usePromptServices);
const mockUseSettings = vi.mocked(useSettings);

const baseSettings: AppSettings = {
  fontSize: "medium",
  autoSave: true,
  exportFormat: "text",
};

const createPromptUiState = (
  overrides: Partial<PromptUIState> = {},
): PromptUIState => ({
  showResults: false,
  setShowResults: vi.fn(),
  showSettings: false,
  setShowSettings: vi.fn(),
  showShortcuts: false,
  setShowShortcuts: vi.fn(),
  showImprover: false,
  setShowImprover: vi.fn(),
  showBrainstorm: false,
  setShowBrainstorm: vi.fn(),
  currentAIIndex: 0,
  setCurrentAIIndex: vi.fn(),
  outputSaveState: "idle",
  setOutputSaveState: vi.fn(),
  outputLastSavedAt: null,
  setOutputLastSavedAt: vi.fn(),
  ...overrides,
});

const createPromptServicesState = (
  inputPrompt: string,
): PromptServicesState => ({
  promptOptimizer: {
    inputPrompt,
    setInputPrompt: vi.fn(),
    isProcessing: false,
    optimizedPrompt: "",
    setOptimizedPrompt: vi.fn(),
    displayedPrompt: "",
    setDisplayedPrompt: vi.fn(),
    genericOptimizedPrompt: null,
    setGenericOptimizedPrompt: vi.fn(),
    previewPrompt: null,
    setPreviewPrompt: vi.fn(),
    previewAspectRatio: null,
    setPreviewAspectRatio: vi.fn(),
    qualityScore: null,
    skipAnimation: false,
    setSkipAnimation: vi.fn(),
    improvementContext: null,
    setImprovementContext: vi.fn(),
    optimizationResultVersion: 0,
    lockedSpans: [],
    optimize: vi.fn(async () => null),
    compile: vi.fn(async () => null),
    resetPrompt: vi.fn(),
    setLockedSpans: vi.fn(),
    addLockedSpan: vi.fn(),
    removeLockedSpan: vi.fn(),
    clearLockedSpans: vi.fn(),
  },
  promptHistory: {
    history: [],
    filteredHistory: [],
    isLoadingHistory: false,
    searchQuery: "",
    setSearchQuery: vi.fn(),
    saveToHistory: vi.fn(async () => null),
    createDraft: vi.fn(() => ({ uuid: "draft-uuid", id: "draft-id" })),
    updateEntryLocal: vi.fn(),
    clearHistory: vi.fn(async () => {}),
    deleteFromHistory: vi.fn(async () => {}),
    loadHistoryFromFirestore: vi.fn(async () => {}),
    updateEntryHighlight: vi.fn(),
    updateEntryOutput: vi.fn(),
    updateEntryPersisted: vi.fn(),
    updateEntryVersions: vi.fn(),
  },
});

describe("PromptModals", () => {
  describe("error handling", () => {
    it("renders settings closed when showSettings is false", () => {
      mockUsePromptUIStateContext.mockReturnValue(
        createPromptUiState({
          showSettings: false,
          showShortcuts: false,
          showImprover: false,
        }),
      );

      mockUsePromptServices.mockReturnValue(createPromptServicesState("hello"));

      mockUseSettings.mockReturnValue({
        settings: baseSettings,
        updateSetting: vi.fn(),
        resetSettings: vi.fn(),
      });

      render(<PromptModals />);

      expect(screen.getByText("Settings Open: no")).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("renders keyboard shortcuts when enabled", () => {
      mockUsePromptUIStateContext.mockReturnValue(
        createPromptUiState({
          showSettings: false,
          showShortcuts: true,
          showImprover: false,
        }),
      );

      mockUsePromptServices.mockReturnValue(createPromptServicesState("hello"));

      mockUseSettings.mockReturnValue({
        settings: baseSettings,
        updateSetting: vi.fn(),
        resetSettings: vi.fn(),
      });

      render(<PromptModals />);

      expect(screen.getByText("Shortcuts Open: yes")).toBeInTheDocument();
    });
  });

  describe("core behavior", () => {
    it("renders improvement form with the current prompt", async () => {
      const setShowSettings = vi.fn();

      mockUsePromptUIStateContext.mockReturnValue(
        createPromptUiState({
          showSettings: true,
          setShowSettings,
          showShortcuts: false,
          showImprover: true,
        }),
      );

      mockUsePromptServices.mockReturnValue(
        createPromptServicesState("hello world"),
      );

      mockUseSettings.mockReturnValue({
        settings: baseSettings,
        updateSetting: vi.fn(),
        resetSettings: vi.fn(),
      });

      render(<PromptModals />);

      expect(screen.getByText("Improver: hello world")).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole("button", { name: "Close Settings", hidden: true }),
      );
      expect(setShowSettings).toHaveBeenCalledWith(false);
    });
  });
});
