import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VidraMark, VIDRA_MARK_SRC } from "../VidraMark";

describe("VidraMark", () => {
  it("renders the single canonical brand asset", () => {
    const { container } = render(<VidraMark />);

    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(VIDRA_MARK_SRC);
  });

  it("stays decorative — the surrounding link carries the brand name", () => {
    // Every call site wraps the mark in a labeled link or sets it beside the
    // wordtype, so an alt text here would double-announce the brand.
    const { container } = render(<VidraMark />);

    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("takes its size and radius from the caller's classes", () => {
    // Each surface keeps its own tile silhouette (26/28/30/32px), so sizing
    // stays at the call site rather than becoming a prop matrix.
    const { container } = render(
      <VidraMark className="h-[26px] w-[26px] rounded-lg" />,
    );

    const img = container.querySelector("img");
    expect(img?.className).toContain("h-[26px]");
    expect(img?.className).toContain("rounded-lg");
  });
});
