import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
      "translate(0px, 0px) scale(1)",
    );
  });

  it("pans with the wheel — the canvas is an open plane", () => {
    render(
      <SpaceViewport>
        <div>network</div>
      </SpaceViewport>,
    );
    fireEvent.wheel(screen.getByTestId("space-canvas"), {
      deltaX: 30,
      deltaY: 50,
    });
    expect(screen.getByTestId("space-viewport-content").style.transform).toBe(
      "translate(-30px, -50px) scale(1)",
    );
  });

  it("zooms toward the cursor on ctrl/cmd+wheel (trackpad pinch)", () => {
    render(
      <SpaceViewport>
        <div>network</div>
      </SpaceViewport>,
    );
    const canvas = screen.getByTestId("space-canvas");
    fireEvent.wheel(canvas, {
      deltaY: -100,
      ctrlKey: true,
      clientX: 100,
      clientY: 100,
    });

    const transform = screen.getByTestId("space-viewport-content").style
      .transform;
    const match = transform.match(
      /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/,
    );
    expect(match).not.toBeNull();
    const [x, y, scale] = [
      Number(match?.[1]),
      Number(match?.[2]),
      Number(match?.[3]),
    ];
    // Zooming in…
    expect(scale).toBeGreaterThan(1);
    // …anchored so the world point under the cursor stays put: from a fresh
    // camera, offset = cursor · (1 − scale).
    expect(x).toBeCloseTo(100 * (1 - scale), 4);
    expect(y).toBeCloseTo(100 * (1 - scale), 4);

    // And the opposite wheel direction zooms back out.
    fireEvent.wheel(canvas, {
      deltaY: 100,
      ctrlKey: true,
      clientX: 100,
      clientY: 100,
    });
    const back = screen
      .getByTestId("space-viewport-content")
      .style.transform.match(/scale\(([\d.]+)\)/);
    expect(Number(back?.[1])).toBeCloseTo(1, 4);
  });

  it("pans by dragging anywhere on the canvas", () => {
    render(
      <SpaceViewport>
        <div>network</div>
      </SpaceViewport>,
    );
    const canvas = screen.getByTestId("space-canvas");
    fireEvent.pointerDown(canvas, {
      clientX: 120,
      clientY: 80,
      button: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(canvas, { clientX: 160, clientY: 100, pointerId: 1 });
    expect(screen.getByTestId("space-viewport-content").style.transform).toBe(
      "translate(40px, 20px) scale(1)",
    );

    // Releasing ends the drag — further movement no longer pans.
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 400, clientY: 400, pointerId: 1 });
    expect(screen.getByTestId("space-viewport-content").style.transform).toBe(
      "translate(40px, 20px) scale(1)",
    );
  });

  it("suppresses the click after a drag but keeps clean clicks selecting", () => {
    const onSelect = vi.fn();
    render(
      <SpaceViewport>
        <button type="button" onClick={onSelect}>
          node
        </button>
      </SpaceViewport>,
    );
    const node = screen.getByRole("button", { name: "node" });

    // A clean click (no drag) still reaches the node — selection works.
    fireEvent.click(node);
    expect(onSelect).toHaveBeenCalledTimes(1);

    // A drag that starts on the node pans; the click browsers fire on release
    // must NOT select (browsing is read-only — no accidental take-restore).
    fireEvent.pointerDown(node, {
      clientX: 10,
      clientY: 10,
      button: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(node, { clientX: 42, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(node, { pointerId: 1 });
    fireEvent.click(node);
    expect(onSelect).toHaveBeenCalledTimes(1);

    // And the next clean click selects again — suppression is per-gesture.
    fireEvent.click(node);
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("reports empty-canvas clicks, but not node clicks or pan-drags", () => {
    const onBackgroundClick = vi.fn();
    render(
      <SpaceViewport onBackgroundClick={onBackgroundClick}>
        <button type="button">node</button>
      </SpaceViewport>,
    );
    const canvas = screen.getByTestId("space-canvas");

    // Clean click on empty canvas → background click (defocus).
    fireEvent.click(canvas);
    expect(onBackgroundClick).toHaveBeenCalledTimes(1);

    // Click on a node (a button) → NOT a background click.
    fireEvent.click(screen.getByRole("button", { name: "node" }));
    expect(onBackgroundClick).toHaveBeenCalledTimes(1);

    // A drag's trailing click → suppressed, NOT a background click.
    fireEvent.pointerDown(canvas, {
      clientX: 10,
      clientY: 10,
      button: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    fireEvent.click(canvas);
    expect(onBackgroundClick).toHaveBeenCalledTimes(1);
  });

  it("recenters the camera on the live node when it changes", () => {
    const rect = (r: Partial<DOMRect>): DOMRect =>
      ({
        x: 0,
        y: 0,
        right: 0,
        bottom: 0,
        toJSON: () => ({}),
        ...r,
      }) as DOMRect;

    const { rerender } = render(
      <SpaceViewport liveNodeId={null}>
        <div data-live="true">live node</div>
      </SpaceViewport>,
    );
    vi.spyOn(
      screen.getByTestId("space-canvas"),
      "getBoundingClientRect",
    ).mockReturnValue(rect({ left: 0, top: 0, width: 800, height: 600 }));
    vi.spyOn(
      screen.getByText("live node"),
      "getBoundingClientRect",
    ).mockReturnValue(rect({ left: 900, top: 700, width: 200, height: 120 }));

    rerender(
      <SpaceViewport liveNodeId="a">
        <div data-live="true">live node</div>
      </SpaceViewport>,
    );

    // Node center (1000, 760) must land on the viewport center (400, 300):
    // the camera slides by (−600, −460).
    expect(screen.getByTestId("space-viewport-content").style.transform).toBe(
      "translate(-600px, -460px) scale(1)",
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
    expect(level).toBeGreaterThanOrEqual(25);
  });
});
