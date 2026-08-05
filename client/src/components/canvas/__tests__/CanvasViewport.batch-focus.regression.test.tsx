import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CANVAS_FOCUS_ATTR, CanvasViewport } from "../CanvasViewport";

/**
 * Regression: the camera centers the *whole* focus target, not its first cell.
 *
 * The viewport used to find its target with
 * `querySelector('[data-live="true"]')` — first match wins — while the studio
 * marked every cell of the newest batch (StudioPlane). A four-image generate
 * therefore centered on the batch's top-left tile, leaving the group off-center
 * by half its own size on every turn.
 *
 * The invariant: elements sharing the live id are one target. Centering their
 * union makes the single-element case (the space, the live editor) fall out of
 * the many-element case, so "there must be exactly one" is not a rule any
 * consumer can break.
 */
describe("regression: the camera centers a batch as one target", () => {
  const rect = (r: Partial<DOMRect>): DOMRect =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0,
      toJSON: () => ({}),
      ...r,
    }) as DOMRect;

  it("centers the union of the marked cells, not the first one", () => {
    const { rerender } = render(
      <CanvasViewport liveNodeId={null}>
        {["a", "b", "c", "d"].map((id) => (
          <div key={id} {...{ [CANVAS_FOCUS_ATTR]: "turn-2" }}>
            {id}
          </div>
        ))}
        <div {...{ [CANVAS_FOCUS_ATTR]: "turn-1" }}>older</div>
      </CanvasViewport>,
    );

    vi.spyOn(
      screen.getByTestId("space-canvas"),
      "getBoundingClientRect",
    ).mockReturnValue(rect({ left: 0, top: 0, width: 800, height: 600 }));

    // A 2×2 batch: union spans (900,700) → (1340,960), so its center is
    // (1120, 830). The first cell's center is (1000, 760) — the old answer.
    const cells: Array<[string, number, number]> = [
      ["a", 900, 700],
      ["b", 1140, 700],
      ["c", 900, 840],
      ["d", 1140, 840],
    ];
    for (const [id, left, top] of cells) {
      vi.spyOn(screen.getByText(id), "getBoundingClientRect").mockReturnValue(
        rect({ left, top, width: 200, height: 120 }),
      );
    }
    // A previous batch is still on the plane and must not pull the camera.
    vi.spyOn(
      screen.getByText("older"),
      "getBoundingClientRect",
    ).mockReturnValue(rect({ left: 0, top: 0, width: 200, height: 120 }));

    rerender(
      <CanvasViewport liveNodeId="turn-2">
        {["a", "b", "c", "d"].map((id) => (
          <div key={id} {...{ [CANVAS_FOCUS_ATTR]: "turn-2" }}>
            {id}
          </div>
        ))}
        <div {...{ [CANVAS_FOCUS_ATTR]: "turn-1" }}>older</div>
      </CanvasViewport>,
    );

    // Batch center (1120, 830) lands on the viewport center (400, 300).
    expect(screen.getByTestId("space-viewport-content").style.transform).toBe(
      "translate(-720px, -530px) scale(1)",
    );
  });

  it("leaves the camera alone when no element carries the live id", () => {
    const { rerender } = render(
      <CanvasViewport liveNodeId={null}>
        <div {...{ [CANVAS_FOCUS_ATTR]: "turn-1" }}>only</div>
      </CanvasViewport>,
    );

    vi.spyOn(
      screen.getByTestId("space-canvas"),
      "getBoundingClientRect",
    ).mockReturnValue(rect({ left: 0, top: 0, width: 800, height: 600 }));
    vi.spyOn(screen.getByText("only"), "getBoundingClientRect").mockReturnValue(
      rect({ left: 900, top: 700, width: 200, height: 120 }),
    );

    rerender(
      <CanvasViewport liveNodeId="turn-missing">
        <div {...{ [CANVAS_FOCUS_ATTR]: "turn-1" }}>only</div>
      </CanvasViewport>,
    );

    // A live id nothing matches centers nothing — the mismatch is inert
    // rather than silently centering some other object.
    expect(screen.getByTestId("space-viewport-content").style.transform).toBe(
      "translate(0px, 0px) scale(1)",
    );
  });
});
