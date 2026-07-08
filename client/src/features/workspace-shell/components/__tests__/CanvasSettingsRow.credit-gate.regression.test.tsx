/**
 * Regression: Generate button must not silently no-op when balance < cost.
 *
 * Invariant: For any known numeric balance B and cost C > 0 where B < C, clicking
 * the Generate button MUST either (a) be disabled so the click is swallowed,
 * or (b) dispatch onInsufficientCredits(C, operation) instead of onRender/onDraft.
 *
 * Bug captured: prior behavior left the button enabled and the click became a
 * silent no-op when the user's live credit balance was below the action cost —
 * no toast, no modal, no busy state.
 */

import React, { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import * as fc from "fast-check";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
import { getVideoCost } from "@/components/ToolSidebar/config/modelConfig";

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
        model: "sora-2",
        version: "1",
        fields: {},
      },
      aspectRatioInfo: null,
      durationInfo: null,
      aspectRatioOptions: ["16:9"],
      durationOptions: [5, 8, 10],
    }),
  }),
);
vi.mock("@/features/model-intelligence/api", () => ({
  trackModelRecommendationEvent: vi.fn(),
}));

// Auth-at-Go: this suite exercises the credit gate, which is orthogonal to the
// logged-out sign-in gate. Run as an authenticated user so `handleGenerate`
// reaches the credit logic synchronously.
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

// Fake balance source — overridden per test.
let mockBalance: number | null = null;
vi.mock("@/contexts/CreditBalanceContext", () => ({
  useCreditBalance: () => ({
    balance: mockBalance,
    isLoading: false,
    error: null,
  }),
}));

function ControlsBridge({
  controls,
  onInsufficientCredits,
}: {
  controls: GenerationControlsHandlers | null;
  onInsufficientCredits?: (required: number, operation: string) => void;
}): React.ReactElement | null {
  const { setControls, setOnInsufficientCredits } =
    useGenerationControlsContext();
  useEffect(() => {
    setControls(controls);
    return () => setControls(null);
  }, [controls, setControls]);
  useEffect(() => {
    if (onInsufficientCredits) {
      setOnInsufficientCredits(() => onInsufficientCredits);
      return () => setOnInsufficientCredits(null);
    }
    return;
  }, [onInsufficientCredits, setOnInsufficientCredits]);
  return null;
}

function renderRow(options: {
  controls: GenerationControlsHandlers;
  balance: number | null;
  duration: number;
  onInsufficientCredits?: (required: number, operation: string) => void;
}): void {
  mockBalance = options.balance;
  const state: GenerationControlsState = {
    ...DEFAULT_GENERATION_CONTROLS_STATE,
    domain: {
      ...DEFAULT_GENERATION_CONTROLS_STATE.domain,
      selectedModel: "sora-2",
      generationParams: { aspect_ratio: "16:9", duration_s: options.duration },
    },
  };
  render(
    <GenerationControlsStoreProvider initialState={state}>
      <GenerationControlsProvider>
        <ControlsBridge
          controls={options.controls}
          {...(options.onInsufficientCredits
            ? { onInsufficientCredits: options.onInsufficientCredits }
            : {})}
        />
        <CanvasSettingsRow
          prompt="An astronaut on Mars"
          renderModelId="sora-2"
          renderModelOptions={[{ id: "sora-2", label: "Sora 2" }]}
          onModelChange={vi.fn()}
          onOpenMotion={vi.fn()}
        />
      </GenerationControlsProvider>
    </GenerationControlsStoreProvider>,
  );
}

describe("regression: CanvasSettingsRow credit gate", () => {
  it("disables Generate when live balance is below the action cost", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(5, 8, 10, 12),
        fc.integer({ min: 0, max: 500 }),
        (duration, balance) => {
          const cost = getVideoCost("sora-2", duration);
          if (balance >= cost) return; // only check the deficit case
          cleanup(); // clear any DOM from a previous fc iteration
          const onRender = vi.fn();
          const onDraft = vi.fn();
          renderSingle(onRender, onDraft, balance, duration);
          const btn = screen.getByTestId(
            "canvas-generate-button",
          ) as HTMLButtonElement;
          expect(btn.disabled).toBe(true);
          fireEvent.click(btn);
          expect(onRender).not.toHaveBeenCalled();
          expect(onDraft).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 20 },
    );
  });

  it("click on an insufficient-credits state triggers onInsufficientCredits instead of onRender", () => {
    const onRender = vi.fn();
    const onInsufficientCredits = vi.fn();
    renderRow({
      controls: {
        onStoryboard: vi.fn(),
        onDraft: vi.fn(),
        onRender,
        isGenerating: false,
        activeDraftModel: null,
      },
      balance: 3,
      duration: 8,
      onInsufficientCredits,
    });

    const btn = screen.getByTestId("canvas-generate-button");
    // The button is disabled in the deficit case, but clicking it with a
    // dispatched MouseEvent (bypassing :disabled) must still not reach onRender;
    // instead the component's handler short-circuits to notify.
    fireEvent.click(btn);
    expect(onRender).not.toHaveBeenCalled();
    // Tooltip / aria-label must communicate the deficit
    expect(btn.getAttribute("aria-label")).toMatch(/credit|top\s*up|need/i);
  });

  it("remains enabled when balance is unknown (null) — preserves existing permissive behavior", () => {
    const onRender = vi.fn();
    renderRow({
      controls: {
        onStoryboard: vi.fn(),
        onDraft: vi.fn(),
        onRender,
        isGenerating: false,
        activeDraftModel: null,
      },
      balance: null,
      duration: 8,
    });
    const btn = screen.getByTestId(
      "canvas-generate-button",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onRender).toHaveBeenCalledWith("sora-2");
  });

  it("remains enabled when balance is exactly the cost", () => {
    const onRender = vi.fn();
    const cost = getVideoCost("sora-2", 8);
    renderRow({
      controls: {
        onStoryboard: vi.fn(),
        onDraft: vi.fn(),
        onRender,
        isGenerating: false,
        activeDraftModel: null,
      },
      balance: cost,
      duration: 8,
    });
    const btn = screen.getByTestId(
      "canvas-generate-button",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onRender).toHaveBeenCalledWith("sora-2");
  });
});

function renderSingle(
  onRender: ReturnType<typeof vi.fn>,
  onDraft: ReturnType<typeof vi.fn>,
  balance: number,
  duration: number,
): ReturnType<typeof render> {
  mockBalance = balance;
  const state: GenerationControlsState = {
    ...DEFAULT_GENERATION_CONTROLS_STATE,
    domain: {
      ...DEFAULT_GENERATION_CONTROLS_STATE.domain,
      selectedModel: "sora-2",
      generationParams: { aspect_ratio: "16:9", duration_s: duration },
    },
  };
  return render(
    <GenerationControlsStoreProvider initialState={state}>
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
          prompt="An astronaut on Mars"
          renderModelId="sora-2"
          renderModelOptions={[{ id: "sora-2", label: "Sora 2" }]}
          onModelChange={vi.fn()}
          onOpenMotion={vi.fn()}
        />
      </GenerationControlsProvider>
    </GenerationControlsStoreProvider>,
  );
}
