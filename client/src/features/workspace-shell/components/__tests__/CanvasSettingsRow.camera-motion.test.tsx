import React, { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CanvasSettingsRow } from "../CanvasSettingsRow";
import {
  GenerationControlsProvider,
  useGenerationControlsContext,
  type GenerationControlsHandlers,
} from "@/features/prompt-optimizer/context/GenerationControlsContext";
import {
  GenerationControlsStoreProvider,
  DEFAULT_GENERATION_CONTROLS_STATE,
  type GenerationControlsState,
} from "@features/generation-controls";
import { CLIENT_FLAG_METADATA, FEATURES } from "@/config/features.config";

/**
 * ADR-0022 decision 7: "The picker's reachability from the armed first
 * frame's controls" — a summoned setting, not a fourth resident of the page
 * (ADR-0009/ADR-0010). With no first frame the picker is not offered.
 *
 * The thaw is explicitly NOT performed by widening a convergence flag: the
 * client's CONVERGENCE_UI keeps its description and its default off, and the
 * picker stops reading it.
 */

vi.mock("../../hooks/useCapabilitiesClamping", () => ({
  useCapabilitiesClamping: () => ({
    schema: null,
    aspectRatioOptions: ["16:9", "9:16"],
    durationOptions: [5, 10],
  }),
}));

vi.mock("@/features/model-intelligence/api", () => ({
  trackModelRecommendationEvent: vi.fn(),
}));

vi.mock("@hooks/useAuthUser", () => ({
  useAuthUser: () => ({ uid: "test-user", emailVerified: true }),
}));

const CONTROLS: GenerationControlsHandlers = {
  onStoryboard: vi.fn(),
  onDraft: vi.fn(),
  onRender: vi.fn(),
  isGenerating: false,
  activeDraftModel: null,
};

const START_FRAME = {
  id: "frame-1",
  url: "https://example.com/frame.png",
  source: "generation" as const,
  generationId: "gen-1",
};

function ControlsBridge(): React.ReactElement | null {
  const { setControls } = useGenerationControlsContext();
  useEffect(() => {
    setControls(CONTROLS);
    return () => setControls(null);
  }, [setControls]);
  return null;
}

const buildState = (
  overrides: Partial<GenerationControlsState["domain"]> = {},
): GenerationControlsState => ({
  ...DEFAULT_GENERATION_CONTROLS_STATE,
  domain: {
    ...DEFAULT_GENERATION_CONTROLS_STATE.domain,
    selectedModel: "sora-2",
    generationParams: { aspect_ratio: "16:9", duration_s: 5 },
    ...overrides,
  },
});

function renderRow(options: {
  state?: GenerationControlsState;
  onOpenCameraMotion?: (() => void) | undefined;
}): void {
  render(
    <GenerationControlsStoreProvider
      initialState={options.state ?? buildState()}
    >
      <GenerationControlsProvider>
        <ControlsBridge />
        <CanvasSettingsRow
          prompt="A city at night"
          renderModelId="sora-2"
          renderModelOptions={[{ id: "sora-2", label: "Sora 2" }]}
          onModelChange={vi.fn()}
          onOpenCameraMotion={options.onOpenCameraMotion}
        />
      </GenerationControlsProvider>
    </GenerationControlsStoreProvider>,
  );
}

describe("CanvasSettingsRow camera motion", () => {
  it("does not offer the picker with no first frame armed", () => {
    renderRow({ onOpenCameraMotion: vi.fn() });

    expect(screen.queryByTestId("canvas-camera-motion-button")).toBeNull();
  });

  it("offers the picker from the armed first frame's controls", () => {
    const onOpenCameraMotion = vi.fn();
    renderRow({
      state: buildState({ startFrame: START_FRAME }),
      onOpenCameraMotion,
    });

    fireEvent.click(screen.getByTestId("canvas-camera-motion-button"));

    expect(onOpenCameraMotion).toHaveBeenCalledTimes(1);
  });

  it("adds exactly one control to the docked row when a frame is armed", () => {
    // Guards the handoff's control population (aspect · duration · model ·
    // preview · Make it): the camera picker is summoned by the armed frame,
    // never a resident of the row.
    renderRow({
      state: buildState({ startFrame: START_FRAME }),
      onOpenCameraMotion: vi.fn(),
    });

    const row = screen.getByTestId("canvas-settings-row");
    expect(within(row).getAllByRole("button")).toHaveLength(6);
  });

  it("is reachable with the umbrella convergence flag at its frozen default", () => {
    // The thaw is a narrower gate, not a wider flag (ADR-0022 D7).
    expect(FEATURES.CONVERGENCE_UI).toBe(false);

    renderRow({
      state: buildState({ startFrame: START_FRAME }),
      onOpenCameraMotion: vi.fn(),
    });

    expect(screen.getByTestId("canvas-camera-motion-button")).toBeVisible();
  });

  it("leaves the umbrella convergence flag's description and default untouched", () => {
    expect(CLIENT_FLAG_METADATA.CONVERGENCE_UI).toEqual({
      envName: "VITE_FEATURE_CONVERGENCE_UI",
      default: false,
      description:
        "Camera-motion picker and depth-warp preview (/api/motion/depth). Frozen: convergence pipeline (ADR-0002).",
    });
  });
});
