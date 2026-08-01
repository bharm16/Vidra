import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Grid } from "../Grid";

const getGrid = (container: HTMLElement) => container.querySelector("div");

describe("Grid", () => {
  describe("error handling", () => {
    it("renders gap token as inline style and omits utility class", () => {
      const { container } = render(<Grid gap="ps-2" />);

      const grid = getGrid(container);
      expect(grid).not.toBeNull();
      expect(grid).toHaveStyle({ gap: "var(--space-2)" });
      expect(grid).not.toHaveClass("gap-ps-2");
    });

    it("renders column gap token as inline style", () => {
      const { container } = render(<Grid columnGap="ps-card" />);

      const grid = getGrid(container);
      expect(grid).not.toBeNull();
      expect(grid).toHaveStyle({ columnGap: "var(--space-4)" });
    });
  });

  describe("edge cases", () => {
    it("builds responsive gap classes when tokens are not system values", () => {
      const { container } = render(<Grid gap={{ base: "2", md: "5" }} />);

      const grid = getGrid(container);
      expect(grid).not.toBeNull();
      expect(grid).toHaveClass("gap-2");
      expect(grid).toHaveClass("md:gap-5");
    });

    it("applies template styles for columns and rows", () => {
      const { container } = render(
        <Grid columns="repeat(3, 1fr)" rows="auto 1fr" />,
      );

      const grid = getGrid(container);
      expect(grid).not.toBeNull();
      expect(grid).toHaveStyle({
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "auto 1fr",
      });
    });
  });

  describe("core behavior", () => {
    it("always renders a grid container", () => {
      const { container } = render(<Grid />);

      const grid = getGrid(container);
      expect(grid).not.toBeNull();
      expect(grid).toHaveClass("grid");
    });
  });
});
