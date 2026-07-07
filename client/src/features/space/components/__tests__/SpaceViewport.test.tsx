import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpaceViewport } from "../SpaceViewport";

/**
 * The space's camera/zoom is ephemeral — nothing spatial is stored (ADR-0012).
 * The viewport scales the network in place; zoom resets on reload.
 */
describe("SpaceViewport", () => {
  it("starts at 100% and scales the content", () => {
    render(
      <SpaceViewport>
        <div data-testid="content">network</div>
      </SpaceViewport>,
    );
    expect(screen.getByTestId("space-zoom-level")).toHaveTextContent("100%");
    expect(screen.getByTestId("space-viewport-content").style.transform).toBe(
      "scale(1)",
    );
  });

  it("zooms in and out within bounds", () => {
    render(
      <SpaceViewport>
        <div>network</div>
      </SpaceViewport>,
    );
    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));
    expect(screen.getByTestId("space-zoom-level")).toHaveTextContent("110%");

    fireEvent.click(screen.getByRole("button", { name: /zoom out/i }));
    fireEvent.click(screen.getByRole("button", { name: /zoom out/i }));
    expect(screen.getByTestId("space-zoom-level")).toHaveTextContent("90%");
  });

  it("does not zoom out below the floor", () => {
    render(
      <SpaceViewport>
        <div>network</div>
      </SpaceViewport>,
    );
    for (let i = 0; i < 20; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: /zoom out/i }));
    }
    const level = Number(
      screen.getByTestId("space-zoom-level").textContent?.replace("%", ""),
    );
    expect(level).toBeGreaterThanOrEqual(50);
  });
});
