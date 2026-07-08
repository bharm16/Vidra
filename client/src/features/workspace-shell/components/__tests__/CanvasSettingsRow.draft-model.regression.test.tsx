import React, { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CanvasSettingsRow } from "../CanvasSettingsRow";
import {
  GenerationControlsProvider,
  useGenerationControlsContext,
  type GenerationControlsHandlers,
} from "@/features/prompt-optimizer/context/GenerationControlsContext";
import { GenerationControlsStoreProvider } from "@features/generation-controls";
import type { GenerationControlsState } from "@features/generation-controls";
import { DEFAULT_GENERATION_CONTROLS_STATE } from "@features/generation-controls";

vi.mock("../StartFramePopover", () => ({
  StartFramePopover: () => <div data-testid="start-frame-popover" />,
}));

vi.mock("../EndFramePopover", () => ({
  EndFramePopover: () => <div data-testid="end-frame-popover" />,
}));

vi.mock("../VideoReferencesPopover", () => ({
  VideoReferencesPopover: () => <div data-testid="video-references-popover" />,
}));

vi.mock(
  "@/components/ToolSidebar/components/panels/GenerationControlsPanel/hooks/useCapabilitiesClamping",
  () => ({
    useCapabilitiesClamping: () => ({
      schema: null,
      aspectRatioInfo: null,
      durationInfo: null,
      aspectRatioOptions: ["16:9"],
      durationOptions: [5],
    }),
  }),
);

vi.mock("@/features/model-intelligence/api", () => ({
  trackModelRecommendationEvent: vi.fn(),
}));

// Auth-at-Go: this suite verifies draft-model routing, not the logged-out gate.
// Run as an authenticated user so `handleGenerate` calls the action directly.
vi.mock("@hooks/useAuthUser", () => ({
  useAuthUser: () => ({ uid: "test-user", emailVerified: true }),
}));

vi.mock("@/config/features.config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/config/features.config")>();
  return {
    ...actual,
    FEATURES: { ...actual.FEATURES, BILLING_UI: true },
  };
});

function ControlsBridge({
  controls,
}: {
  controls: GenerationControlsHandlers | null;
}): React.ReactElement | null {
  const { setControls } = useGenerationControlsContext();

  useEffect(() => {
    setControls(controls);
    return () => setControls(null);
  }, [controls, setControls]);

  return null;
}

const buildState = (selectedModel: string): GenerationControlsState => ({
  ...DEFAULT_GENERATION_CONTROLS_STATE,
  domain: {
    ...DEFAULT_GENERATION_CONTROLS_STATE.domain,
    selectedModel,
    videoTier: "draft",
    generationParams: {
      aspect_ratio: "16:9",
      duration_s: 5,
    },
  },
});

describe("regression: draft model selections stay on the draft action path", () => {
  it("uses the selected draft model for the button label and action even when renderModelId disagrees", () => {
    const onDraft = vi.fn();
    const onRender = vi.fn();

    render(
      <GenerationControlsStoreProvider initialState={buildState("wan-2.2")}>
        <GenerationControlsProvider>
          <ControlsBridge
            controls={{
              onStoryboard: vi.fn(),
              onDraft,
              onRender,
              isGenerating: false,
              activeDraftModel: null,
            }}
          />
          <CanvasSettingsRow
            prompt="A cinematic shot of a train crossing a snowy bridge."
            renderModelId="wan-2.5"
            renderModelOptions={[{ id: "wan-2.5", label: "Wan 2.5" }]}
            onModelChange={vi.fn()}
            onOpenMotion={vi.fn()}
          />
        </GenerationControlsProvider>
      </GenerationControlsStoreProvider>,
    );

    // Wan 2.2: ceil(3.5 credits/sec × 5s duration) = 18 credits
    const generateButton = screen.getByRole("button", {
      name: "Draft 18 credits",
    });
    fireEvent.click(generateButton);

    expect(onDraft).toHaveBeenCalledWith("wan-2.2");
    expect(onRender).not.toHaveBeenCalled();
  });
});
