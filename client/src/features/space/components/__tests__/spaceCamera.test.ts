import { describe, expect, it } from "vitest";
import { computeCenteredScroll } from "../spaceCamera";

describe("computeCenteredScroll", () => {
  it("scrolls so the node center lands on the container center", () => {
    // Container viewport 800x600 at origin, currently unscrolled. Node rendered
    // at (900, 700) with size 200x120 — off to the lower-right, out of view.
    const next = computeCenteredScroll(
      { scrollLeft: 0, scrollTop: 0, left: 0, top: 0, width: 800, height: 600 },
      { left: 900, top: 700, width: 200, height: 120 },
    );

    // Node center (1000, 760) must move to container center (400, 300):
    // delta = (1000-400, 760-300) = (600, 460), added to current scroll (0,0).
    expect(next).toEqual({ scrollLeft: 600, scrollTop: 460 });
  });

  it("accounts for the container's own offset and current scroll", () => {
    // Container offset 100px from the page left, already scrolled 50px down.
    const next = computeCenteredScroll(
      {
        scrollLeft: 20,
        scrollTop: 50,
        left: 100,
        top: 40,
        width: 400,
        height: 400,
      },
      { left: 300, top: 240, width: 208, height: 128 },
    );

    // node center = (404, 304); container center = (300, 240);
    // delta = (104, 64); new scroll = (20+104, 50+64) = (124, 114).
    expect(next).toEqual({ scrollLeft: 124, scrollTop: 114 });
  });

  it("is a no-op when the node is already centered", () => {
    const next = computeCenteredScroll(
      {
        scrollLeft: 30,
        scrollTop: 30,
        left: 0,
        top: 0,
        width: 400,
        height: 300,
      },
      { left: 100, top: 90, width: 200, height: 120 },
    );

    // node center (200, 150) == container center (200, 150) → scroll unchanged.
    expect(next).toEqual({ scrollLeft: 30, scrollTop: 30 });
  });
});
