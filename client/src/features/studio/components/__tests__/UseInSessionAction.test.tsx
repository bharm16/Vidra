import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { TakeAttachment } from "@shared/schemas/attachment.schemas";
import { UseInSessionAction } from "../UseInSessionAction";
import type { UseInSessionOutcome } from "@features/studio/api/studioApi";

/**
 * ADR-0022 decision 4, issue #89. The surface has one job beyond pressing the
 * button: a gone origin session is a QUESTION, and the creator answers it.
 * Nothing here may start a session on its own.
 *
 * Issue #135 pins the attachment half: only `attached` reads as added. A
 * `failed` attachment is made-but-not-saved with a retry that re-sends the
 * SAME take; `pending` reads as saving; a response with no attachment fact is
 * an unknown, never a success.
 */

function renderAction(
  onUse: (options?: {
    onMissingOriginSession?: "new-session";
    confirmedWords?: string;
  }) => Promise<UseInSessionOutcome>,
  selectedImageId: string | null = "img-1",
  onRetryAttachment?: (
    imageId: string | null,
    attachment: TakeAttachment,
  ) => Promise<{ ok: boolean; message?: string }>,
) {
  return render(
    <MemoryRouter>
      <UseInSessionAction
        selectedImageId={selectedImageId}
        onUse={onUse}
        {...(onRetryAttachment ? { onRetryAttachment } : {})}
      />
    </MemoryRouter>,
  );
}

const attached: TakeAttachment = {
  state: "attached",
  generationId: "take-2",
  sessionId: "session-1",
  promptVersionId: "v1",
};

const returned: UseInSessionOutcome = {
  state: "returned",
  result: {
    sessionId: "session-1",
    promptVersionId: "v1",
    generationId: "take-2",
    imageUrl: "https://storage.example.com/returned",
    ancestorGenerationId: "take-1",
    createdSession: false,
    attachment: attached,
  },
};

describe("UseInSessionAction", () => {
  it("has no subject until an image is selected", () => {
    renderAction(vi.fn(), null);
    expect(
      screen.getByRole("button", { name: "Use this in the session" }),
    ).toBeDisabled();
  });

  it("offers the session once the picture is in it", async () => {
    const onUse = vi.fn().mockResolvedValue(returned);
    renderAction(onUse);

    await userEvent.click(
      screen.getByRole("button", { name: "Use this in the session" }),
    );

    await waitFor(() =>
      expect(screen.getByText("Added to the session.")).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: "Open it" })).toHaveAttribute(
      "href",
      "/session/session-1",
    );
    // The press carries no destination — the project's origin decides it.
    expect(onUse).toHaveBeenCalledWith(undefined);
  });

  it("shows made-but-not-saved with a retry when the attachment failed, and the retry re-sends the SAME take (issue #135)", async () => {
    const failedAttachment: TakeAttachment = {
      state: "failed",
      generationId: "take-2",
      sessionId: "session-1",
      promptVersionId: "v1",
      reason: "session write failed",
      record: { id: "take-2", mediaType: "image", origin: "studio" },
    };
    const onUse = vi.fn().mockResolvedValue({
      state: "returned",
      result: {
        ...returned.result,
        generationId: "take-2",
        attachment: failedAttachment,
      },
    } satisfies UseInSessionOutcome);
    const onRetryAttachment = vi
      .fn()
      .mockResolvedValue({ ok: true as const });
    renderAction(onUse, "img-1", onRetryAttachment);

    await userEvent.click(
      screen.getByRole("button", { name: "Use this in the session" }),
    );

    // The picture is real but the session does not have it — never shown as
    // added.
    await waitFor(() =>
      expect(screen.getByText(/Made, but not saved/)).toBeInTheDocument(),
    );
    expect(screen.queryByText("Added to the session.")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Save it" }));

    // The retry is the same-take contract: the attachment the server handed
    // back — record and identity included — is what travels.
    expect(onRetryAttachment).toHaveBeenCalledWith(
      "img-1",
      failedAttachment,
    );

    // Attached truthfully at last.
    await waitFor(() =>
      expect(screen.getByText("Added to the session.")).toBeInTheDocument(),
    );
  });

  it("keeps the truthful band when the retry fails, and shows the reason", async () => {
    const failedAttachment: TakeAttachment = {
      state: "failed",
      generationId: "take-2",
      sessionId: "session-1",
      promptVersionId: "v1",
      reason: "session write failed",
      record: { id: "take-2", mediaType: "image", origin: "studio" },
    };
    const onUse = vi.fn().mockResolvedValue({
      state: "returned",
      result: {
        ...returned.result,
        attachment: failedAttachment,
      },
    } satisfies UseInSessionOutcome);
    const onRetryAttachment = vi
      .fn()
      .mockResolvedValue({
        ok: false as const,
        message: "the session is gone",
      });
    renderAction(onUse, "img-1", onRetryAttachment);

    await userEvent.click(
      screen.getByRole("button", { name: "Use this in the session" }),
    );
    await waitFor(() =>
      expect(screen.getByText(/Made, but not saved/)).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: "Save it" }));

    expect(await screen.findByText("the session is gone")).toBeInTheDocument();
    expect(screen.queryByText("Added to the session.")).toBeNull();
  });

  it("does not read a pending attachment as added", async () => {
    const onUse = vi.fn().mockResolvedValue({
      state: "returned",
      result: {
        ...returned.result,
        attachment: {
          state: "pending",
          generationId: "take-2",
          sessionId: "session-1",
          promptVersionId: "v1",
          record: { id: "take-2" },
        },
      },
    } satisfies UseInSessionOutcome);
    renderAction(onUse);

    await userEvent.click(
      screen.getByRole("button", { name: "Use this in the session" }),
    );

    expect(await screen.findByText("Saving to the session…")).toBeInTheDocument();
    expect(screen.queryByText("Added to the session.")).toBeNull();
  });

  it("treats a returned response with no attachment fact as unknown, not added", async () => {
    const onUse = vi.fn().mockResolvedValue({
      state: "returned",
      result: { ...returned.result, attachment: undefined },
    } satisfies UseInSessionOutcome);
    renderAction(onUse);

    await userEvent.click(
      screen.getByRole("button", { name: "Use this in the session" }),
    );

    expect(
      await screen.findByText(/Couldn’t confirm whether it saved/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Added to the session.")).toBeNull();
  });

  it("asks before starting a new session when the origin session is gone", async () => {
    const onUse = vi
      .fn()
      .mockResolvedValueOnce({
        state: "origin-session-missing",
        sessionId: "session-1",
        message: "The session this project came from is gone.",
      } satisfies UseInSessionOutcome)
      .mockResolvedValueOnce({
        ...returned,
        result: { ...returned.result, createdSession: true },
      });
    renderAction(onUse);

    await userEvent.click(
      screen.getByRole("button", { name: "Use this in the session" }),
    );

    // The refusal is a question, not an error, and nothing has been created.
    const choice = await screen.findByRole("button", {
      name: "Start a new session",
    });
    expect(onUse).toHaveBeenCalledTimes(1);

    await userEvent.click(choice);

    await waitFor(() =>
      expect(onUse).toHaveBeenLastCalledWith({
        onMissingOriginSession: "new-session",
      }),
    );
  });

  it("asks for confirmed words, prefilled with the suggestion, and confirms with the creator's edited words (issue #131)", async () => {
    const onUse = vi
      .fn()
      .mockResolvedValueOnce({
        state: "needs-confirmed-words",
        suggestion: "a paper crane on a windowsill",
        message: "Name the session this picture starts.",
      } satisfies UseInSessionOutcome)
      .mockResolvedValueOnce({
        ...returned,
        result: { ...returned.result, createdSession: true },
      });
    renderAction(onUse);

    await userEvent.click(
      screen.getByRole("button", { name: "Use this in the session" }),
    );

    // The suggestion prefills an editable field — a description, not a silent mint.
    const field = await screen.findByRole("textbox");
    expect(field).toHaveValue("a paper crane on a windowsill");
    expect(onUse).toHaveBeenCalledTimes(1);

    // The creator edits it and confirms.
    await userEvent.clear(field);
    await userEvent.type(field, "a paper crane on a marble sill");
    await userEvent.click(
      screen.getByRole("button", { name: "Start the session" }),
    );

    await waitFor(() =>
      expect(onUse).toHaveBeenLastCalledWith({
        confirmedWords: "a paper crane on a marble sill",
      }),
    );
  });

  it("offers no prefill when the server sends no suggestion, and requires typed words before confirming", async () => {
    const onUse = vi.fn().mockResolvedValue({
      state: "needs-confirmed-words",
      message: "Name the session this picture starts.",
    } satisfies UseInSessionOutcome);
    renderAction(onUse);

    await userEvent.click(
      screen.getByRole("button", { name: "Use this in the session" }),
    );

    // No suggestion → an empty field, and confirming is blocked until words exist.
    const field = await screen.findByRole("textbox");
    expect(field).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Start the session" }),
    ).toBeDisabled();
    // Only the first press ran; nothing was confirmed on the creator's behalf.
    expect(onUse).toHaveBeenCalledTimes(1);
  });

  it("carries the new-session choice into the words confirmation, so the picture lands in one session (issue #131)", async () => {
    const onUse = vi
      .fn()
      .mockResolvedValueOnce({
        state: "origin-session-missing",
        sessionId: "session-1",
        message: "The session this project came from is gone.",
      } satisfies UseInSessionOutcome)
      .mockResolvedValueOnce({
        state: "needs-confirmed-words",
        message: "Name the session this picture starts.",
      } satisfies UseInSessionOutcome)
      .mockResolvedValueOnce({
        ...returned,
        result: { ...returned.result, createdSession: true },
      });
    renderAction(onUse);

    await userEvent.click(
      screen.getByRole("button", { name: "Use this in the session" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Start a new session" }),
    );

    const field = await screen.findByRole("textbox");
    await userEvent.type(field, "a warmly lit study");
    await userEvent.click(
      screen.getByRole("button", { name: "Start the session" }),
    );

    // The confirmation carries BOTH the words and the new-session choice.
    await waitFor(() =>
      expect(onUse).toHaveBeenLastCalledWith({
        confirmedWords: "a warmly lit study",
        onMissingOriginSession: "new-session",
      }),
    );
  });
});
