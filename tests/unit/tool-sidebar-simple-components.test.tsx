import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { AppIcon } from "@/types";

import { ToolNavButton } from "@components/ToolSidebar/components/ToolNavButton";
import { TooltipProvider } from "@promptstudio/system/components/ui/tooltip";
import { ToolPanel } from "@components/ToolSidebar/components/ToolPanel";
import { StylesPanel } from "@components/ToolSidebar/components/panels/StylesPanel";

vi.mock("@utils/cn", () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
}));

const DummyIcon: AppIcon = (props) => (
  <svg data-testid="dummy-icon" {...props} />
);

describe("ToolSidebar simple components", () => {
  describe("error handling", () => {
    it("renders header variant with the label and icon", () => {
      render(
        <TooltipProvider>
          <ToolNavButton
            icon={DummyIcon}
            label="Sessions"
            isActive
            onClick={vi.fn()}
            variant="header"
          />
        </TooltipProvider>,
      );

      // The header variant is currently not visually distinct (the prop is
      // accepted but not branched on); just verify the button + icon render.
      const button = screen.getByRole("button", { name: "Sessions" });
      expect(button).toBeInTheDocument();
      expect(within(button).getByTestId("dummy-icon")).toBeInTheDocument();
    });

    it("keeps data-panel attribute when children are null", () => {
      const { container } = render(
        <ToolPanel activePanel="styles">{null}</ToolPanel>,
      );

      const panel = container.querySelector('[data-panel="styles"]');
      expect(panel).not.toBeNull();
    });

    it("updates data-panel when activePanel changes", () => {
      const { container, rerender } = render(
        <ToolPanel activePanel="sessions">Content</ToolPanel>,
      );

      expect(container.querySelector('[data-panel="sessions"]')).not.toBeNull();

      rerender(<ToolPanel activePanel="studio">Content</ToolPanel>);
      expect(container.querySelector('[data-panel="studio"]')).not.toBeNull();
    });
  });

  describe("edge cases", () => {
    it("renders inactive nav button styling and aria-pressed false", () => {
      render(
        <TooltipProvider>
          <ToolNavButton
            icon={DummyIcon}
            label="Create"
            isActive={false}
            onClick={vi.fn()}
          />
        </TooltipProvider>,
      );

      const button = screen.getByRole("button", { name: "Create" });
      expect(button).toHaveAttribute("aria-pressed", "false");
      // Phosphor icons receive size via prop, not Tailwind classes — just
      // verify the icon is mounted. Button class includes hover:text-foreground.
      expect(within(button).getByTestId("dummy-icon")).toBeInTheDocument();
      expect(button.getAttribute("class")).toContain("text-foreground");
    });

    it("renders the styles panel empty state", () => {
      render(<StylesPanel />);

      // Empty-state copy; full "Style presets" rail label was dropped in the
      // 52px icon rail redesign.
      expect(screen.getByText("Styles")).toBeInTheDocument();
    });
  });

  describe("core behavior", () => {
    it("renders active styling and triggers onClick", () => {
      const onClick = vi.fn();

      render(
        <TooltipProvider>
          <ToolNavButton
            icon={DummyIcon}
            label="Studio"
            isActive
            onClick={onClick}
          />
        </TooltipProvider>,
      );

      const button = screen.getByRole("button", { name: "Studio" });
      expect(button).toHaveAttribute("aria-pressed", "true");
      // Phosphor icons receive size via prop, not Tailwind classes.
      expect(within(button).getByTestId("dummy-icon")).toBeInTheDocument();
      expect(button.getAttribute("class")).toContain("text-foreground");

      button.click();
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });
});
