import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CameraMotionModal } from "../CameraMotionModal";
import { CAMERA_PATHS } from "@shared/cameraMotion";

/**
 * ADR-0022 D7: the camera choice becomes words, so a choice that would
 * overwrite camera words the creator wrote — or locked — has to say so. The
 * modal is where the creator is standing when it happens, so the conflict is
 * surfaced there, quoting the words in the way.
 */

vi.mock("@/features/convergence/api/motionApi", () => ({
  estimateDepth: vi.fn(async () => ({
    depthMapUrl: "https://example.com/depth.png",
    cameraPaths: CAMERA_PATHS,
    fallbackMode: false,
  })),
}));

vi.mock("@/hooks/useResolvedMediaUrl", () => ({
  useResolvedMediaUrl: () => ({ url: "https://example.com/frame.png" }),
}));

vi.mock("@/features/convergence/utils/cameraMotionRenderer", () => ({
  buildProxyUrl: (url: string) => url,
  renderCameraMotionFrames: vi.fn(async () => []),
}));

const BASE_PROPS = {
  isOpen: true,
  onClose: vi.fn(),
  imageUrl: "https://example.com/frame.png",
  onSelect: vi.fn(),
} as const;

describe("CameraMotionModal conflict affordance", () => {
  it("shows nothing extra when there is no conflict", () => {
    render(<CameraMotionModal {...BASE_PROPS} />);

    expect(screen.queryByTestId("camera-motion-conflict")).toBeNull();
  });

  it("quotes the creator's camera words and offers an explicit replace", () => {
    const onReplace = vi.fn();
    render(
      <CameraMotionModal
        {...BASE_PROPS}
        conflict={{
          kind: "existing-camera-span",
          text: "A slow dolly follows him.",
          onReplace,
        }}
      />,
    );

    const notice = screen.getByTestId("camera-motion-conflict");
    expect(notice).toHaveTextContent("A slow dolly follows him.");

    fireEvent.click(
      screen.getByRole("button", { name: "Replace those words" }),
    );
    expect(onReplace).toHaveBeenCalledTimes(1);
  });

  it("offers no overwrite at all for a locked span", () => {
    render(
      <CameraMotionModal
        {...BASE_PROPS}
        conflict={{
          kind: "locked",
          text: "A slow dolly follows him.",
        }}
      />,
    );

    const notice = screen.getByTestId("camera-motion-conflict");
    expect(notice).toHaveTextContent("A slow dolly follows him.");
    expect(notice).toHaveTextContent("Unlock it");
    expect(
      screen.queryByRole("button", { name: "Replace those words" }),
    ).toBeNull();
  });
});
