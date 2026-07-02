import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Asset } from "@shared/types/asset";
import { Layers } from "@promptstudio/system/components/ui";
import { PanelHeader } from "../PanelHeader";
import { CharactersPanel } from "../CharactersPanel";
import { StylesPanel } from "../StylesPanel";

vi.mock(
  "@features/prompt-optimizer/components/AssetsSidebar/AssetThumbnail",
  () => ({
    AssetThumbnail: ({ asset }: { asset: Asset }) => (
      <div data-testid={`asset-${asset.id}`} />
    ),
  }),
);

describe("PanelHeader", () => {
  it("renders the icon, sentence-case title, and a single New action", () => {
    const onNew = vi.fn();
    render(<PanelHeader icon={Layers} title="Sessions" onNew={onNew} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Sessions" }),
    ).toBeInTheDocument();

    const newButton = screen.getByRole("button", { name: /New/ });
    newButton.click();
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it("wires a tooltip onto the New action when a tooltip is provided", () => {
    render(
      <PanelHeader
        icon={Layers}
        title="Sessions"
        onNew={vi.fn()}
        newTooltip="New prompt (Cmd+N)"
      />,
    );

    // Radix stamps tooltip triggers with data-state; its presence proves the
    // hover tooltip is wired without racing open/close timers in jsdom.
    expect(screen.getByRole("button", { name: /New/ })).toHaveAttribute(
      "data-state",
    );
  });
});

describe("panel header coherence", () => {
  it.each([
    ["Characters", (): void => void render(<CharactersPanel />)],
    ["Styles", (): void => void render(<StylesPanel />)],
  ])(
    "%s panel renders the shared header pattern (title + New, no back arrow)",
    (title, renderPanel) => {
      renderPanel();

      const heading = screen.getByRole("heading", { level: 2, name: title });
      expect(heading).toBeInTheDocument();

      const header = heading.closest("div")?.parentElement as HTMLElement;
      expect(
        within(header).getByRole("button", { name: /New/ }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    },
  );
});
