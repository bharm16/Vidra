import React, { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

vi.mock("../../hooks/useCapabilitiesClamping", () => ({
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
}));

vi.mock("@/features/model-intelligence/api", () => ({
  trackModelRecommendationEvent: vi.fn(),
}));

// Auth-at-Go: these tests verify the generate wiring (draft vs render), not the
// logged-out gate. Run as an authenticated user so `handleGenerate` calls the
// action synchronously. The logged-out gate is covered by runWhenAuthenticated
// and AuthGateController unit tests.
vi.mock("@hooks/useAuthUser", () => ({
  useAuthUser: () => ({ uid: "test-user", emailVerified: true }),
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

  it("renders the handoff's exact control set — no frame/reference popovers", () => {
    renderRow({
      controls: {
        onStoryboard: vi.fn(),
        onDraft: vi.fn(),
        onRender: vi.fn(),
        isGenerating: false,
        activeDraftModel: null,
      },
    });

    // The composer handoff's docked row is exactly: aspect · duration ·
    // model · preview, then Make it. Asserted as the row's whole control
    // population, so any control added back — a start/end-frame or reference
    // popover under any name — fails this, which a queryByTestId on a mocked
    // module could not.
    const row = screen.getByTestId("canvas-settings-row");
    const controls = within(row).getAllByRole("button");

    expect(controls).toHaveLength(5);
    expect(within(row).getByRole("button", { name: "16:9" })).toBeVisible();
    expect(within(row).getByRole("button", { name: "5s" })).toBeVisible();
    expect(
      within(row).getByRole("button", { name: "Video model" }),
    ).toBeVisible();
    expect(controls).toContain(screen.getByTestId("canvas-preview-button"));
    expect(controls).toContain(screen.getByTestId("canvas-generate-button"));
  });

  it("renders the model control icon-only, reachable as 'Video model' (composer handoff)", () => {
    renderRow({
      controls: {
        onStoryboard: vi.fn(),
        onDraft: vi.fn(),
        onRender: vi.fn(),
        isGenerating: false,
        activeDraftModel: null,
      },
    });

    // The docked row is a compact icon toolbar: the model trigger shows the
    // sparkle glyph only — no visible label — and stays reachable by its
    // accessible name.
    const trigger = screen.getByRole("button", { name: "Video model" });
    expect(trigger).not.toHaveTextContent("Model ·");
    expect(trigger).not.toHaveTextContent("Sora 2");
    expect(trigger.querySelector("svg")).not.toBeNull();
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
