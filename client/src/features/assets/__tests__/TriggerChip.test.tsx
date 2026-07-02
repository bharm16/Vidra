import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TriggerChip, TriggerChipInline } from "../components/TriggerChip";

describe("TriggerChip", () => {
  describe("error handling", () => {
    it("prevents chip click when removing", () => {
      const onClick = vi.fn();
      const onRemove = vi.fn();

      render(
        <TriggerChip
          asset={{ type: "character", trigger: "@Ada" }}
          onClick={onClick}
          onRemove={onRemove}
          showRemove
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "x" }));

      expect(onRemove).toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("applies small size classes when requested", () => {
      const { container } = render(
        <TriggerChip asset={{ type: "style", trigger: "@Neo" }} size="small" />,
      );

      const chip = container.querySelector("span");
      expect(chip).not.toBeNull();
      expect(chip).toHaveClass("text-xs");
      expect(chip).toHaveClass("px-1.5");
    });

    it("renders inline chip with type-specific classes", () => {
      const { container } = render(
        <TriggerChipInline trigger="@Neo" type="style" />,
      );

      const inline = container.querySelector("span");
      expect(inline).not.toBeNull();
      expect(inline).toHaveClass("bg-surface-3");
      expect(inline).toHaveClass("text-foreground");
    });
  });

  describe("core behavior", () => {
    it("fires onClick when chip is clicked", () => {
      const onClick = vi.fn();

      render(
        <TriggerChip
          asset={{ type: "location", trigger: "@Tokyo" }}
          onClick={onClick}
        />,
      );

      fireEvent.click(screen.getByText("@Tokyo"));

      expect(onClick).toHaveBeenCalled();
    });
  });
});
