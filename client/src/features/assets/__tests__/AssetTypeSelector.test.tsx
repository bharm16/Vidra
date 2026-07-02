import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssetTypeSelector } from "../components/AssetTypeSelector";
import type { AssetType } from "@shared/types/asset";

const renderSelector = (value: AssetType) =>
  render(<AssetTypeSelector value={value} onChange={vi.fn()} />);

describe("AssetTypeSelector", () => {
  describe("error handling", () => {
    it("renders all options as inactive when value is unknown", () => {
      render(
        <AssetTypeSelector value={"unknown" as AssetType} onChange={vi.fn()} />,
      );

      const buttons = screen.getAllByRole("button");
      buttons.forEach((button) => {
        expect(button).toHaveClass("border-border");
      });
    });
  });

  describe("edge cases", () => {
    it("renders a button for each asset type", () => {
      renderSelector("character");

      const labels = ["Character", "Style", "Location", "Object"];
      labels.forEach((label) => {
        expect(screen.getByText(label)).toBeInTheDocument();
      });
    });

    it("marks the active asset type with its color classes", () => {
      renderSelector("style");

      const active = screen.getByText("Style").closest("button");
      expect(active).not.toBeNull();
      expect(active).toHaveClass("text-foreground");
    });
  });

  describe("core behavior", () => {
    it("calls onChange when a type is selected", () => {
      const onChange = vi.fn();
      render(<AssetTypeSelector value="character" onChange={onChange} />);

      fireEvent.click(screen.getByText("Style"));

      expect(onChange).toHaveBeenCalledWith("style");
    });
  });
});
