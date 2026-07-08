import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Grain } from "../Grain";

describe("Grain", () => {
  it("renders a full-bleed grain overlay by default", () => {
    const { container } = render(<Grain />);
    expect(container.querySelector(".ps-grain")).not.toBeNull();
  });

  it("renders nothing when grain is toggled off", () => {
    // The handoff exposes grain as a boolean theme knob; off means the
    // filmic overlay is absent entirely, not merely transparent.
    const { container } = render(<Grain enabled={false} />);
    expect(container.querySelector(".ps-grain")).toBeNull();
  });
});
