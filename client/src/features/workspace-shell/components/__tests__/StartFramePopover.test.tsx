import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StartFramePopover } from "../StartFramePopover";
import type { KeyframeTile } from "@/components/ToolSidebar/types";

vi.mock("@/hooks/useResolvedMediaUrl", () => ({
  useResolvedMediaUrl: () => ({ url: null }),
}));

vi.mock("@/utils/storageUrl", () => ({
  hasGcsSignedUrlParams: () => false,
}));

vi.mock("@/config/features.config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/config/features.config")>();
  return {
    ...actual,
    FEATURES: { ...actual.FEATURES, CONVERGENCE_UI: true },
  };
});

const buildStartFrame = (): KeyframeTile => ({
  id: "frame-1",
  url: "https://example.com/frame.png",
  source: "upload",
});

describe("StartFramePopover", () => {
  it("uploads a start frame file through onStartFrameUpload", async () => {
    const onStartFrameUpload = vi.fn(async () => undefined);
    const { container } = render(
      <StartFramePopover
        startFrame={null}
        cameraMotion={null}
        onSetStartFrame={vi.fn()}
        onClearStartFrame={vi.fn()}
        onOpenMotion={vi.fn()}
        onStartFrameUpload={onStartFrameUpload}
      />,
    );

    fireEvent.click(screen.getByTestId("start-frame-trigger"));
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["demo"], "frame.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(onStartFrameUpload).toHaveBeenCalledWith(file);
  });

  it("shows clear and motion actions when start frame exists", () => {
    const onClearStartFrame = vi.fn();
    const onOpenMotion = vi.fn();

    render(
      <StartFramePopover
        startFrame={buildStartFrame()}
        cameraMotion={null}
        onSetStartFrame={vi.fn()}
        onClearStartFrame={onClearStartFrame}
        onOpenMotion={onOpenMotion}
      />,
    );

    fireEvent.click(screen.getByTestId("start-frame-trigger"));
    fireEvent.click(screen.getByTestId("start-frame-clear-button"));
    fireEvent.click(screen.getByTestId("start-frame-motion-button"));

    expect(onClearStartFrame).toHaveBeenCalledTimes(1);
    expect(onOpenMotion).toHaveBeenCalledTimes(1);
  });

  it("hides motion action when there is no start frame", () => {
    render(
      <StartFramePopover
        startFrame={null}
        cameraMotion={null}
        onSetStartFrame={vi.fn()}
        onClearStartFrame={vi.fn()}
        onOpenMotion={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("start-frame-trigger"));
    expect(
      screen.queryByTestId("start-frame-motion-button"),
    ).not.toBeInTheDocument();
  });
});
