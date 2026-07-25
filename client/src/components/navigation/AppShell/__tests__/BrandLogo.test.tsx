import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BrandLogo } from "../shared/BrandLogo";
import { VIDRA_MARK_SRC } from "@components/brand";

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("BrandLogo", () => {
  describe("error handling", () => {
    it("renders the brand mark alone for collapsed sidebar variant", () => {
      renderWithRouter(<BrandLogo variant="sidebar-collapsed" />);

      const link = screen.getByRole("link", { name: "Vidra home" });
      expect(link.querySelector(`img[src="${VIDRA_MARK_SRC}"]`)).not.toBeNull();
      expect(link).not.toHaveTextContent("Vidra");
    });
  });

  describe("edge cases", () => {
    it("merges custom className with variant styles", () => {
      renderWithRouter(<BrandLogo variant="topnav" className="extra" />);

      const link = screen.getByRole("link", { name: "Vidra home" });
      expect(link).toHaveClass("extra");
    });

    it("keeps home link target for all variants", () => {
      renderWithRouter(<BrandLogo variant="sidebar" />);

      const link = screen.getByRole("link", { name: "Vidra home" });
      expect(link).toHaveAttribute("href", "/");
    });
  });

  describe("core behavior", () => {
    it("renders full brand name for top nav variant", () => {
      renderWithRouter(<BrandLogo variant="topnav" />);

      const link = screen.getByRole("link", { name: "Vidra home" });
      expect(link).toHaveTextContent("Vidra");
    });
  });
});
