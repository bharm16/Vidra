import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CanvasSettingsRow } from "../CanvasSettingsRow";
import { GenerationControlsProvider } from "@/features/prompt-optimizer/context/GenerationControlsContext";
import { GenerationControlsStoreProvider } from "@features/generation-controls";
import type { GenerationControlsState } from "@features/generation-controls";
import { DEFAULT_GENERATION_CONTROLS_STATE } from "@features/generation-controls";

/**
 * The aspect-ratio and duration menus ride the system DropdownMenu
 * (Radix): opaque elevated popover on the named z-index scale, selection
 * updates the generation store, Escape / outside pointerdown dismiss.
 * (Replaces the hand-rolled MiniDropdown that floated translucent text
 * over the prompt.)
 */

// Radix menus measure themselves via ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
window.ResizeObserver =
  window.ResizeObserver ?? (ResizeObserverStub as typeof ResizeObserver);
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? vi.fn();

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
      aspectRatioOptions: ["16:9", "9:16", "1:1"],
      durationOptions: [5, 10],
    }),
  }),
);

vi.mock("@/features/model-intelligence/api", () => ({
  trackModelRecommendationEvent: vi.fn(),
}));

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

function renderRow(): void {
  render(
    <GenerationControlsStoreProvider initialState={buildState()}>
      <GenerationControlsProvider>
        <CanvasSettingsRow
          prompt="A city at night"
          renderModelId="sora-2"
          renderModelOptions={[{ id: "sora-2", label: "Sora 2" }]}
          onModelChange={vi.fn()}
          onOpenMotion={vi.fn()}
        />
      </GenerationControlsProvider>
    </GenerationControlsStoreProvider>,
  );
}

describe("CanvasSettingsRow aspect/duration menus (system DropdownMenu)", () => {
  it("opens the aspect menu on an opaque elevated surface using the z-index scale", async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByRole("button", { name: "16:9" }));

    const menu = await screen.findByRole("menu");
    expect(menu.className).toContain("z-dropdown");
    expect(menu.className).toContain("bg-popover");
    expect(
      screen.getByRole("menuitemradio", { name: "9:16" }),
    ).toBeInTheDocument();
  });

  it("selecting an aspect ratio updates the chip and closes the menu", async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByRole("button", { name: "16:9" }));
    await user.click(
      await screen.findByRole("menuitemradio", { name: "9:16" }),
    );

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "9:16" })).toBeInTheDocument();
  });

  it("selecting a duration updates the chip through the numeric store round-trip", async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByRole("button", { name: "5s" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "10s" }));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "10s" })).toBeInTheDocument();
  });

  it("dismisses with Escape and with a pointerdown outside (Radix defaults)", async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByRole("button", { name: "16:9" }));
    await screen.findByRole("menu");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(screen.getByRole("button", { name: "16:9" }));
    await screen.findByRole("menu");
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("supports keyboard navigation between options", async () => {
    const user = userEvent.setup();
    renderRow();

    const trigger = screen.getByRole("button", { name: "16:9" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");

    await user.keyboard("{ArrowDown}");
    const active = document.activeElement as HTMLElement;
    expect(active.getAttribute("role")).toBe("menuitemradio");
  });
});
