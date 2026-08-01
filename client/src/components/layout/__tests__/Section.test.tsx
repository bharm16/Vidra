import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Section } from "../Section";

const getSection = (container: HTMLElement) => container.querySelector("div");

describe("Section", () => {
  describe("error handling", () => {
    it("prefers explicit spacing over size and mb props", () => {
      const { container } = render(
        <Section size="xl" mb="ps-1" spacing="ps-6" />,
      );

      const section = getSection(container);
      expect(section).not.toBeNull();
      expect(section).toHaveStyle({ marginBottom: "var(--space-4)" });
      expect(section).not.toHaveStyle({ marginBottom: "var(--space-1)" });
    });
  });

  describe("edge cases", () => {
    it("uses mb when provided without spacing", () => {
      const { container } = render(<Section mb="ps-2" />);

      const section = getSection(container);
      expect(section).not.toBeNull();
      expect(section).toHaveStyle({ marginBottom: "var(--space-2)" });
    });

    it("falls back to size-based spacing when no overrides provided", () => {
      const { container } = render(<Section size="sm" />);

      const section = getSection(container);
      expect(section).not.toBeNull();
      expect(section).toHaveStyle({ marginBottom: "var(--space-4)" });
    });
  });

  describe("core behavior", () => {
    it("renders children and forwards props", () => {
      render(
        <Section data-testid="section">
          <span>Content</span>
        </Section>,
      );

      const section = screen.getByTestId("section");
      expect(section).toHaveTextContent("Content");
    });
  });
});
