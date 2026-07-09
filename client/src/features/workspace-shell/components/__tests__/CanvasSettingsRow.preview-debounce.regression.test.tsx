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
      schema: {
        provider: "generic",
        model: "google/veo-3",
        version: "1",
        fields: {
          last_frame: { type: "bool", default: true },
          reference_images: { type: "bool", default: true },
          extend_video: { type: "bool", default: true },
        },
      },
      aspectRatioInfo: null,
      durationInfo: null,
      aspectRatioOptions: ["16:9", "9:16"],
      durationOptions: [5, 10],
    }),
  }),
);

vi.mock("@/features/model-intelligence/api", () => ({
  trackModelRecommendationEvent: vi.fn(),
}));

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

const buildState = (): GenerationControlsState => ({
  ...DEFAULT_GENERATION_CONTROLS_STATE,
  domain: {
    ...DEFAULT_GENERATION_CONTROLS_STATE.domain,
    selectedModel: "sora-2",
    generationParams: {
      aspect_ratio: "16:9",
      duration_s: 5,
    },
  },
});

function renderRow(controls: GenerationControlsHandlers): void {
  render(
    <GenerationControlsStoreProvider initialState={buildState()}>
      <GenerationControlsProvider>
        <ControlsBridge controls={controls} />
        <CanvasSettingsRow
          prompt="A city at night"
          renderModelId="sora-2"
          renderModelOptions={[{ id: "sora-2", label: "Sora 2" }]}
          onModelChange={vi.fn()}
        />
      </GenerationControlsProvider>
    </GenerationControlsStoreProvider>,
  );
}

/**
 * Regression: rapid double-clicks on the Preview-storyboard button must not
 * fire `onStoryboard` more than once within the debounce window. This guards
 * against credit over-charge when the workspace-level prelude (optimize ->
 * session-create) is in flight: the upstream `isSubmittingRef` guard inside
 * `useGenerationActions` doesn't engage until that prelude completes, so the
 * UI must hold its own short-window debounce.
 *
 * Invariant: For any rapid Preview-button clicks issued back-to-back, the
 * onStoryboard handler fires AT MOST ONCE.
 */
describe("regression: Preview button click is debounced against rapid double-fire", () => {
  it("fires onStoryboard exactly once when the button is double-clicked synchronously", () => {
    const onStoryboard = vi.fn();
    renderRow({
      onStoryboard,
      onDraft: vi.fn(),
      onRender: vi.fn(),
      isGenerating: false,
      activeDraftModel: null,
    });

    const previewButton = screen.getByTestId("canvas-preview-button");
    fireEvent.click(previewButton);
    fireEvent.click(previewButton);
    fireEvent.click(previewButton);

    expect(onStoryboard).toHaveBeenCalledTimes(1);
  });
});
