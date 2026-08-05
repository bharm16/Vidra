import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasViewport } from "../CanvasViewport";

/**
 * Regression: the mount-time centering was computed for the viewport size at
 * load, and a later window/stage resize (devtools, rail collapse, monitor
 * move, a resized browser window) left the live node off-center — the live
 * editor opened "cut off" whenever the window changed after mount, because
 * the ephemeral camera never re-centered.
 *
 * Contract: auto-centering stays ARMED until the creator takes the camera.
 * While the camera sits exactly where auto-centering put it, stage size
 * changes re-center the live node; the first pan/zoom disarms this — a
 * resize must never fight a camera the user has touched.
 */
describe("regression: stage resizes re-center the untouched camera", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const rect = (r: Partial<DOMRect>): DOMRect =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
      ...r,
    }) as DOMRect;

  /** Stub ResizeObserver, capturing callbacks so the test can fire resizes. */
  function stubResizeObserver(): { fire: () => void } {
    const callbacks: ResizeObserverCallback[] = [];
    class ResizeObserverStub {
      private readonly callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        callbacks.push(callback);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {
        const index = callbacks.indexOf(this.callback);
        if (index !== -1) callbacks.splice(index, 1);
      }
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    return {
      fire: (): void => {
        for (const callback of [...callbacks]) {
          callback([], undefined as unknown as ResizeObserver);
        }
      },
    };
  }

  function mountWithRects(canvasWidth: { value: number }): {
    fire: () => void;
  } {
    const observer = stubResizeObserver();
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        if (this.getAttribute("data-testid") === "space-canvas") {
          return rect({
            left: 0,
            top: 0,
            width: canvasWidth.value,
            height: 600,
          });
        }
        if (this.getAttribute("data-canvas-focus") === "editor-pair") {
          return rect({ left: 900, top: 700, width: 200, height: 120 });
        }
        return rect({});
      },
    );
    render(
      <CanvasViewport liveNodeId="editor-pair">
        <div data-canvas-focus="editor-pair">live node</div>
      </CanvasViewport>,
    );
    return observer;
  }

  it("re-centers when the stage resizes and the camera is untouched", () => {
    const canvasWidth = { value: 800 };
    const observer = mountWithRects(canvasWidth);

    // Mount centering for an 800-wide stage: node center (1000, 760) to
    // viewport center (400, 300) → camera (−600, −460).
    expect(screen.getByTestId("space-viewport-content").style.transform).toBe(
      "translate(-600px, -460px) scale(1)",
    );

    // The stage grows to 1000 wide. jsdom rects are static, so the node
    // still measures at (900, 700): the recenter recomputes against the
    // committed camera — panBy((−600, −460), (500−1000, 300−760)).
    canvasWidth.value = 1000;
    act(() => observer.fire());
    expect(screen.getByTestId("space-viewport-content").style.transform).toBe(
      "translate(-1100px, -920px) scale(1)",
    );
  });

  it("never moves a camera the user has panned", () => {
    const canvasWidth = { value: 800 };
    const observer = mountWithRects(canvasWidth);

    // The creator takes the camera: wheel-pan by (30, 50).
    fireEvent.wheel(screen.getByTestId("space-canvas"), {
      deltaX: 30,
      deltaY: 50,
    });
    expect(screen.getByTestId("space-viewport-content").style.transform).toBe(
      "translate(-630px, -510px) scale(1)",
    );

    canvasWidth.value = 1000;
    act(() => observer.fire());
    expect(screen.getByTestId("space-viewport-content").style.transform).toBe(
      "translate(-630px, -510px) scale(1)",
    );
  });
});
