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
import { VIDEO_DRAFT_MODEL } from "@/components/ToolSidebar/config/modelConfig";

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

const buildState = (
  overrides: Partial<GenerationControlsState["domain"]> = {},
): GenerationControlsState => ({
  ...DEFAULT_GENERATION_CONTROLS_STATE,
  domain: {
    ...DEFAULT_GENERATION_CONTROLS_STATE.domain,
    selectedModel: "sora-2",
    generationParams: {
      aspect_ratio: "16:9",
      duration_s: 5,
    },
    ...overrides,
  },
});

function renderRow(options: {
  controls: GenerationControlsHandlers | null;
  state?: GenerationControlsState | undefined;
  prompt?: string | undefined;
}): void {
  const {
    controls,
    state = buildState(),
    prompt = "A city at night",
  } = options;

  render(
    <GenerationControlsStoreProvider initialState={state}>
      <GenerationControlsProvider>
        <ControlsBridge controls={controls} />
        <CanvasSettingsRow
          prompt={prompt}
          renderModelId="sora-2"
          renderModelOptions={[{ id: "sora-2", label: "Sora 2" }]}
          onModelChange={vi.fn()}
          tuneOpen={false}
          selectedChipCount={0}
          onToggleTune={vi.fn()}
          onOpenMotion={vi.fn()}
        />
      </GenerationControlsProvider>
    </GenerationControlsStoreProvider>,
  );
}

describe("CanvasSettingsRow", () => {
  it("uses GenerationControlsContext controls for preview and render actions", () => {
    const onStoryboard = vi.fn();
    const onDraft = vi.fn();
    const onRender = vi.fn();

    renderRow({
      controls: {
        onStoryboard,
        onDraft,
        onRender,
        isGenerating: false,
        activeDraftModel: null,
      },
    });

    fireEvent.click(screen.getByTestId("canvas-preview-button"));
    fireEvent.click(screen.getByTestId("canvas-generate-button"));

    expect(onStoryboard).toHaveBeenCalledTimes(1);
    expect(onRender).toHaveBeenCalledWith("sora-2");
    expect(onDraft).not.toHaveBeenCalled();
  });

  it("uses draft action when Wan draft model is selected", () => {
    const onDraft = vi.fn();
    const onRender = vi.fn();

    renderRow({
      controls: {
        onStoryboard: vi.fn(),
        onDraft,
        onRender,
        isGenerating: false,
        activeDraftModel: null,
      },
      state: buildState({ selectedModel: VIDEO_DRAFT_MODEL.id }),
    });

    fireEvent.click(screen.getByTestId("canvas-generate-button"));

    expect(onDraft).toHaveBeenCalledWith(VIDEO_DRAFT_MODEL.id);
    expect(onRender).not.toHaveBeenCalled();
  });

  it("disables preview/generate buttons when controls are unavailable", () => {
    renderRow({ controls: null });

    expect(screen.getByTestId("canvas-preview-button")).toBeDisabled();
    expect(screen.getByTestId("canvas-generate-button")).toBeDisabled();
  });

  it("disables preview/generate buttons while generation is in progress", () => {
    renderRow({
      controls: {
        onStoryboard: vi.fn(),
        onDraft: vi.fn(),
        onRender: vi.fn(),
        isGenerating: true,
        activeDraftModel: VIDEO_DRAFT_MODEL.id,
      },
    });

    expect(screen.getByTestId("canvas-preview-button")).toBeDisabled();
    expect(screen.getByTestId("canvas-generate-button")).toBeDisabled();
  });

  it("shows end frame and references controls in prompt input row", () => {
    renderRow({
      controls: {
        onStoryboard: vi.fn(),
        onDraft: vi.fn(),
        onRender: vi.fn(),
        isGenerating: false,
        activeDraftModel: null,
      },
    });

    expect(screen.getByTestId("start-frame-popover")).toBeInTheDocument();
    expect(screen.getByTestId("end-frame-popover")).toBeInTheDocument();
    expect(screen.getByTestId("video-references-popover")).toBeInTheDocument();
  });

  it("renders the model chip with a muted 'Model ·' prefix before the model name", () => {
    renderRow({
      controls: {
        onStoryboard: vi.fn(),
        onDraft: vi.fn(),
        onRender: vi.fn(),
        isGenerating: false,
        activeDraftModel: null,
      },
    });

    const trigger = screen.getByRole("button", { name: "Video model" });
    // Prefix and model name are separate flex children (spaced via gap),
    // so assert each visible piece rather than a single concatenated string.
    expect(trigger).toHaveTextContent("Model ·");
    expect(trigger).toHaveTextContent("Sora 2");

    const prefix = screen.getByText("Model ·");
    expect(prefix).toHaveClass("text-tool-text-subdued");
  });

  it("shows extend chip and clears extend mode from prompt row", () => {
    renderRow({
      controls: {
        onStoryboard: vi.fn(),
        onDraft: vi.fn(),
        onRender: vi.fn(),
        isGenerating: false,
        activeDraftModel: null,
      },
      state: buildState({
        extendVideo: {
          url: "https://example.com/source.mp4",
          source: "generation",
          generationId: "gen-1",
        },
      }),
    });

    expect(screen.getByText("Extending")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear extend mode" }));
    expect(screen.queryByText("Extending")).not.toBeInTheDocument();
  });
});
