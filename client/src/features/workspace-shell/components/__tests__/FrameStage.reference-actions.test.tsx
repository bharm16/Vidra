import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FrameStageView } from "../FrameStage";

describe("pending reference actions", () => {
  it("keeps same-picture save recovery available while the image URL is resolving", () => {
    const admit = vi.fn().mockResolvedValue(undefined);
    render(
      <FrameStageView
        startFrame={null}
        prompt="A lighthouse"
        data={{
          pendingReference: {
            busy: false,
            attempted: true,
            attachmentFailed: true,
            uploading: false,
          },
        }}
        actions={{ onAdmitPendingReference: admit }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry saving" }));
    expect(admit).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "Create frame" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer admission before an upload finishes", () => {
    const admit = vi.fn().mockResolvedValue(undefined);
    render(
      <FrameStageView
        startFrame={null}
        prompt="A lighthouse"
        data={{
          pendingReference: {
            busy: false,
            attempted: false,
            attachmentFailed: false,
            uploading: true,
          },
        }}
        actions={{ onAdmitPendingReference: admit }}
      />,
    );
    expect(screen.getByText("Uploading your reference…")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(admit).not.toHaveBeenCalled();
  });

  it("prevents duplicate admission while the existing picture is being saved", () => {
    const admit = vi.fn().mockResolvedValue(undefined);
    render(
      <FrameStageView
        startFrame={null}
        prompt="A lighthouse"
        data={{
          pendingReference: {
            busy: true,
            attempted: true,
            attachmentFailed: false,
            uploading: false,
          },
        }}
        actions={{ onAdmitPendingReference: admit }}
      />,
    );
    const save = screen.getByRole("button", { name: "Saving…" });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(admit).not.toHaveBeenCalled();
  });
});
