import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CameraMotionPicker } from "../CameraMotionPicker";
import { CAMERA_PATHS } from "@shared/cameraMotion";
import type { CameraPath } from "@/features/convergence/types";

/**
 * ADR-0022 decision 7, "Illustrative in every case": the preview is labeled
 * illustrative whether the depth estimate succeeded or fell back, and the
 * label does not vary with confidence — a label that appears only on the
 * fallback teaches the creator that its absence is a promise.
 */

vi.mock("@/features/convergence/utils/cameraMotionRenderer", () => ({
  buildProxyUrl: (url: string) => url,
  renderCameraMotionFrames: vi.fn(async () => []),
}));

const paths = CAMERA_PATHS.slice(0, 4) as unknown as CameraPath[];

function renderPicker(overrides: {
  depthMapUrl: string | null;
  fallbackMode: boolean;
  onSelect?: (id: string) => void;
}): void {
  render(
    <CameraMotionPicker
      cameraPaths={paths}
      imageUrl="https://example.com/frame.png"
      depthMapUrl={overrides.depthMapUrl}
      fallbackMode={overrides.fallbackMode}
      onSelect={overrides.onSelect ?? vi.fn()}
    />,
  );
}

const DEPTH_BACKED = {
  depthMapUrl: "https://example.com/depth.png",
  fallbackMode: false,
} as const;
const FELL_BACK = { depthMapUrl: null, fallbackMode: true } as const;

describe("CameraMotionPicker illustrative label", () => {
  it("labels the preview illustrative when depth backs it", () => {
    renderPicker(DEPTH_BACKED);

    expect(screen.getByTestId("camera-motion-illustrative")).toHaveTextContent(
      "illustrative",
    );
  });

  it("labels the preview illustrative in the no-depth fallback too", () => {
    renderPicker(FELL_BACK);

    expect(screen.getByTestId("camera-motion-illustrative")).toHaveTextContent(
      "illustrative",
    );
  });

  it("says the same thing in both cases — the label never varies with confidence", () => {
    renderPicker(DEPTH_BACKED);
    renderPicker(FELL_BACK);

    const [backed, fellBack] = screen.getAllByTestId(
      "camera-motion-illustrative",
    );

    expect(backed?.textContent).toBeTruthy();
    expect(fellBack?.textContent).toBe(backed?.textContent);
  });

  it("still lets the creator choose when depth is unavailable", () => {
    const onSelect = vi.fn();
    renderPicker({ ...FELL_BACK, onSelect });

    const listbox = screen.getByRole("listbox", {
      name: "Camera motion options",
    });
    const options = within(listbox).getAllByRole("option");
    expect(options.length).toBe(paths.length);

    const first = options[0];
    if (!first) throw new Error("expected an option");
    fireEvent.click(first);

    expect(onSelect).toHaveBeenCalledWith(paths[0]?.id);
  });

  it("shows no credit cost — no credits anywhere in the product (ADR-0010)", () => {
    renderPicker(DEPTH_BACKED);

    expect(screen.queryByText("credit", { exact: false })).toBeNull();
  });
});
