import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { act, renderHook } from "@testing-library/react";
import type { RenderHookResult } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { acceptLiveOutput } from "../api/acceptLiveOutput";
import { retryPictureAttachment } from "@/features/generations/api/takeAttachment";
import { useAcceptLiveOutput } from "../hooks/useAcceptLiveOutput";
import type { LiveOutput } from "../hooks/generationReducer";
import type { SketchAcceptResult } from "@shared/schemas/sketch.schemas";

/**
 * Issue #134 — the live editor reports the attachment outcome instead of
 * assuming it. A response whose attachment fact is not `attached` is a
 * picture that was MADE but not SAVED: shown as made-but-not-saved, never a
 * navigation into a session whose space does not hold the take, with a retry
 * that re-attaches the SAME take through the shared record door. A settled
 * (`attached`) response behaves exactly as before. Attempts follow #129: a
 * newer press supersedes an unresolved one, and a late response for a
 * superseded attempt is dropped.
 *
 * Seam: the feature's `api/` module and the shared attachment api — the
 * client's wire boundaries.
 */

vi.mock("../api/acceptLiveOutput", () => ({
  acceptLiveOutput: vi.fn(),
}));

vi.mock("@/features/generations/api/takeAttachment", () => ({
  retryPictureAttachment: vi.fn(),
}));

const acceptLiveOutputMock = vi.mocked(acceptLiveOutput);
const retryPictureAttachmentMock = vi.mocked(retryPictureAttachment);

function output(overrides: Partial<LiveOutput> & { requestId: string }): LiveOutput {
  return {
    imageUrl: `data:image/webp;base64,output-${overrides.requestId}`,
    at: 0,
    sketchDataUri: "data:image/jpeg;base64,drawing",
    inputs: { prompt: "a brass desk lamp", strength: 0.62, steps: 4, seed: 1 },
    ...overrides,
  };
}

function resultWith(
  attachment: SketchAcceptResult["attachment"],
): SketchAcceptResult {
  return {
    sessionId: attachment.sessionId,
    promptVersionId: attachment.promptVersionId,
    generationId: attachment.generationId,
    imageUrl: "https://storage.example.com/asset-1",
    createdSession: true,
    attachment,
  };
}

const failedTake: SketchAcceptResult["attachment"] = {
  state: "failed",
  generationId: "take-9",
  sessionId: "session-made",
  promptVersionId: "v-root",
  reason: "session write failed",
  record: {
    id: "take-9",
    mediaType: "image",
    status: "completed",
    prompt: "a brass desk lamp",
  },
};

/** Records where the router actually is, so tests can see a navigation. */
let currentPathname = "/";
function LocationProbe(): null {
  const location = useLocation();
  currentPathname = location.pathname;
  return null;
}

function renderAcceptance(): RenderHookResult<
  ReturnType<typeof useAcceptLiveOutput>,
  unknown
> {
  return renderHook(() => useAcceptLiveOutput(), {
    wrapper: ({ children }: { children: ReactNode }): ReactNode => (
      <MemoryRouter initialEntries={["/live"]}>
        <LocationProbe />
        {children}
      </MemoryRouter>
    ),
  });
}

describe("Use this reports the attachment outcome (issue #134)", () => {
  beforeEach(() => {
    acceptLiveOutputMock.mockReset();
    retryPictureAttachmentMock.mockReset();
    currentPathname = "/live";
  });

  it("shows an accepted-but-unattached take as made-but-not-saved instead of navigating into the session", async () => {
    acceptLiveOutputMock.mockResolvedValue(resultWith(failedTake));

    const { result } = renderAcceptance();

    act(() => {
      result.current.accept(output({ requestId: "1" }));
    });
    await act(async () => {});

    // The truthful state, carrying exactly the attachment a retry re-sends.
    expect(result.current.status).toEqual({
      state: "unattached",
      attachment: failedTake,
    });
    // The creator is NOT landed in a session whose space lacks the take.
    expect(currentPathname).toBe("/live");
  });

  it("treats a pending attachment the same way: not accepted until the outcome is known", async () => {
    acceptLiveOutputMock.mockResolvedValue(
      resultWith({ ...failedTake, state: "pending", reason: undefined }),
    );

    const { result } = renderAcceptance();

    act(() => {
      result.current.accept(output({ requestId: "1" }));
    });
    await act(async () => {});

    expect(result.current.status.state).toBe("unattached");
    expect(currentPathname).toBe("/live");
  });

  it("the retry re-attaches the SAME take — the very attachment the response carried — and then lands in its session", async () => {
    acceptLiveOutputMock.mockResolvedValue(resultWith(failedTake));
    retryPictureAttachmentMock.mockResolvedValue(undefined);

    const { result } = renderAcceptance();

    act(() => {
      result.current.accept(output({ requestId: "1" }));
    });
    await act(async () => {});

    act(() => {
      result.current.retryAttachment();
    });
    expect(result.current.status.state).toBe("saving");

    await act(async () => {});

    // The same take — identity, destination and record identical, no
    // re-accept and no new media.
    expect(retryPictureAttachmentMock).toHaveBeenCalledTimes(1);
    expect(retryPictureAttachmentMock).toHaveBeenCalledWith(failedTake);

    // The landing "Use this" promised, now that the take is really there.
    expect(currentPathname).toBe("/session/session-made");
    expect(result.current.status.state).toBe("idle");
  });

  it("a retry that fails keeps the debt retryable and says why — it is never flipped to saved", async () => {
    acceptLiveOutputMock.mockResolvedValue(resultWith(failedTake));
    retryPictureAttachmentMock
      .mockRejectedValueOnce(new Error("Session not found: session-made"))
      .mockResolvedValueOnce(undefined);

    const { result } = renderAcceptance();

    act(() => {
      result.current.accept(output({ requestId: "1" }));
    });
    await act(async () => {});
    act(() => {
      result.current.retryAttachment();
    });
    await act(async () => {});

    expect(result.current.status).toEqual({
      state: "unattached",
      attachment: failedTake,
      message: "Session not found: session-made",
    });
    expect(currentPathname).toBe("/live");

    // The retry stays usable: a second attempt settles the debt.
    act(() => {
      result.current.retryAttachment();
    });
    await act(async () => {});

    expect(retryPictureAttachmentMock).toHaveBeenCalledTimes(2);
    expect(retryPictureAttachmentMock.mock.calls[1]?.[0]).toBe(failedTake);
    expect(currentPathname).toBe("/session/session-made");
  });

  it("a newer press supersedes a made-but-not-saved state and mints its own attempt", async () => {
    acceptLiveOutputMock
      .mockResolvedValueOnce(resultWith(failedTake))
      .mockResolvedValueOnce(
        resultWith({
          state: "attached",
          generationId: "take-2",
          sessionId: "session-second",
          promptVersionId: "v-root",
        }),
      );

    const { result } = renderAcceptance();

    act(() => {
      result.current.accept(output({ requestId: "1" }));
    });
    await act(async () => {});
    expect(result.current.status.state).toBe("unattached");

    // The creator presses Use this on a DIFFERENT picture: the older debt's
    // state is superseded, not silently kept alongside.
    act(() => {
      result.current.accept(output({ requestId: "2" }));
    });
    expect(result.current.status.state).toBe("accepting");
    await act(async () => {});

    const keys = acceptLiveOutputMock.mock.calls.map(
      (call) => call[0].idempotencyKey,
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    expect(currentPathname).toBe("/session/session-second");
    expect(result.current.status.state).toBe("idle");
  });

  it("drops a superseded attempt's late made-but-not-saved response instead of surfacing it", async () => {
    const settles: Array<(value: SketchAcceptResult) => void> = [];
    acceptLiveOutputMock
      .mockImplementationOnce(
        () =>
          new Promise<SketchAcceptResult>((resolve) => {
            settles.push(resolve);
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<SketchAcceptResult>((resolve) => {
            settles.push(resolve);
          }),
      );

    const { result } = renderAcceptance();

    act(() => {
      result.current.accept(output({ requestId: "1" }));
    });
    act(() => {
      result.current.accept(output({ requestId: "2" }));
    });

    // The FIRST attempt's response arrives late and unattached: its press has
    // been superseded, so its debt is not surfaced over the newer press.
    await act(async () => {
      settles[0]?.(resultWith(failedTake));
    });
    expect(result.current.status.state).toBe("accepting");

    await act(async () => {
      settles[1]?.(
        resultWith({
          state: "attached",
          generationId: "take-2",
          sessionId: "session-second",
          promptVersionId: "v-root",
        }),
      );
    });
    expect(currentPathname).toBe("/session/session-second");
  });

  it("a settled (attached) response behaves exactly as before: idle, then into the session", async () => {
    acceptLiveOutputMock.mockResolvedValue(
      resultWith({
        state: "attached",
        generationId: "take-1",
        sessionId: "session-ok",
        promptVersionId: "v-root",
      }),
    );

    const { result } = renderAcceptance();

    act(() => {
      result.current.accept(output({ requestId: "1" }));
    });
    await act(async () => {});

    expect(result.current.status.state).toBe("idle");
    expect(currentPathname).toBe("/session/session-ok");
    expect(retryPictureAttachmentMock).not.toHaveBeenCalled();
  });
});
