import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Box } from "../Box";

const getBox = (container: HTMLElement) => container.querySelector("div");

describe("Box", () => {
  describe("error handling", () => {
    it("applies system spacing tokens as inline styles and omits utility class", () => {
      const { container } = render(<Box p="ps-3" />);

      const box = getBox(container);
      expect(box).not.toBeNull();
      expect(box).toHaveStyle({ padding: "var(--space-3)" });
      expect(box).not.toHaveClass("p-ps-3");
    });

    it("falls back to utility classes for unknown system spacing tokens", () => {
      const { container } = render(<Box p="ps-99" />);

      const box = getBox(container);
      expect(box).not.toBeNull();
      expect(box).toHaveClass("p-ps-99");
      expect(box).not.toHaveStyle({ padding: "var(--ps-space-99)" });
    });
  });

  describe("edge cases", () => {
    it("builds responsive classes for base and breakpoint values", () => {
      const { container } = render(<Box p={{ base: "4", sm: "6" }} />);

      const box = getBox(container);
      expect(box).not.toBeNull();
      expect(box).toHaveClass("p-4");
      expect(box).toHaveClass("sm:p-6");
    });

    it("merges manual styles with system spacing styles", () => {
      const { container } = render(
        <Box p="ps-2" style={{ backgroundColor: "rgb(10, 20, 30)" }} />,
      );

      const box = getBox(container);
      expect(box).not.toBeNull();
      expect(box).toHaveStyle({
        padding: "var(--space-2)",
        backgroundColor: "rgb(10, 20, 30)",
      });
    });
  });

  describe("core behavior", () => {
    it("applies display and positioning classes with sizing styles", () => {
      const { container } = render(
        <Box display="flex" position="absolute" width="200px" height="100%" />,
      );

      const box = getBox(container);
      expect(box).not.toBeNull();
      expect(box).toHaveClass("flex");
      expect(box).toHaveClass("absolute");
      expect(box).toHaveStyle({ width: "200px", height: "100%" });
    });
  });
});
