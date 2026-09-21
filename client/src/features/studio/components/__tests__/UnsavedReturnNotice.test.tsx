import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { StudioUnresolvedReturn } from "../../api/schemas";
import { UnsavedReturnNotice } from "../UnsavedReturnNotice";

/**
 * Recovery after refresh (ADR-0022 decision 6, issue #135): a return the
 * server still owes is surfaced from its receipt, with the one action that
 * repairs it — the same-take retry. A successful retry removes the entry
 * (the server no longer owes the take); a failure keeps it, with the reason.
 */

const owed: StudioUnresolvedReturn = {
  imageId: "img-1",
  attachment: {
    state: "failed",
    generationId: "take-1",
    sessionId: "session-1",
    promptVersionId: "v1",
    reason: "session write failed",
    record: { id: "take-1", mediaType: "image", origin: "studio" },
  },
};

describe("UnsavedReturnNotice", () => {
  it("renders nothing when the server owes nothing", () => {
    const { container } = render(
      <UnsavedReturnNotice returns={[]} onRetry={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("surfaces the unresolved return and retries the SAME take", async () => {
    const onRetry = vi.fn().mockResolvedValue({ ok: true });
    render(<UnsavedReturnNotice returns={[owed]} onRetry={onRetry} />);

    expect(screen.getByText(/didn’t save/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save it" }));

    expect(onRetry).toHaveBeenCalledWith("img-1", owed.attachment);
  });

  it("keeps the notice and shows the reason when the retry fails", async () => {
    const onRetry = vi.fn().mockResolvedValue({
      ok: false,
      message: "the session is gone",
    });
    render(<UnsavedReturnNotice returns={[owed]} onRetry={onRetry} />);

    await userEvent.click(screen.getByRole("button", { name: "Save it" }));

    expect(await screen.findByText("the session is gone")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save it" })).toBeInTheDocument();
  });

  it("shows no failure when the retry attaches it", async () => {
    const onRetry = vi.fn(async () => ({ ok: true as const }));
    render(<UnsavedReturnNotice returns={[owed]} onRetry={onRetry} />);

    await userEvent.click(screen.getByRole("button", { name: "Save it" }));

    // The entry itself is removed by the parent from the retry's outcome
    // (pinned at the hook level, where the reducer clear runs); what this
    // pins is that a successful retry surfaces no error.
    await waitFor(() =>
      expect(screen.queryByText("the session is gone")).toBeNull(),
    );
  });
});
