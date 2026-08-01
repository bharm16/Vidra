import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Container } from "../Container";

const getContainer = (container: HTMLElement) => container.querySelector("div");

describe("Container", () => {
  describe("error handling", () => {
    it("prefers explicit maxWidth over size presets", () => {
      const { container } = render(<Container size="sm" maxWidth="720px" />);

      const box = getContainer(container);
      expect(box).not.toBeNull();
      expect(box).toHaveStyle({ maxWidth: "720px" });
    });
  });

  describe("edge cases", () => {
    it("defaults to the xl preset when size is omitted", () => {
      const { container } = render(<Container />);

      const box = getContainer(container);
      expect(box).not.toBeNull();
      expect(box).toHaveStyle({ maxWidth: "var(--container-max)" });
    });

    it("merges custom className with base container classes", () => {
      const { container } = render(<Container className="extra" />);

      const box = getContainer(container);
      expect(box).not.toBeNull();
      expect(box).toHaveClass("container");
      expect(box).toHaveClass("mx-auto");
      expect(box).toHaveClass("extra");
    });
  });

  describe("core behavior", () => {
    it("renders children and forwards DOM props", () => {
      render(
        <Container data-testid="content">
          <span>Inner</span>
        </Container>,
      );

      const element = screen.getByTestId("content");
      expect(element).toHaveTextContent("Inner");
    });
  });
});
