import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Vignette } from "../Vignette";

describe("Vignette", () => {
  it("renders the default (lighter) vignette overlay", () => {
    const { container } = render(<Vignette />);
    const el = container.querySelector(".ps-vignette");
    expect(el).not.toBeNull();
    expect(el?.classList.contains("ps-vignette--anchor")).toBe(false);
  });

  it("renders the heavier anchor vignette when intensity is 'anchor'", () => {
    // The empty state carries a deeper double-layer vignette than the
    // workspace; the intensity knob must select it, not the default.
    const { container } = render(<Vignette intensity="anchor" />);
    expect(container.querySelector(".ps-vignette--anchor")).not.toBeNull();
  });
});
