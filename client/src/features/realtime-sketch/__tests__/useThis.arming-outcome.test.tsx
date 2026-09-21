import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { act, renderHook } from "@testing-library/react";
import type { RenderHookResult } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { acceptLiveOutput } from "../api/acceptLiveOutput";
import {
  retryFirstFrameArming,
  retryPictureAttachment,
} from "@/features/generations/api/takeAttachment";
import { useAcceptLiveOutput } from "../hooks/useAcceptLiveOutput";
import type { LiveOutput } from "../hooks/generationReducer";
import type { SketchAcceptResult } from "@shared/schemas/sketch.schemas";
import type { FirstFrameArming } from "@shared/schemas/firstFrame.schemas";

/**
 * Issue #136 — the live editor reports the ARMING outcome instead of assuming
 * it. The attachment and the arming are separately observable: a take that is
 * saved but whose first-frame arm failed is shown truthfully as such, with a
 * retry that arms the SAME take through the server's arm door — no re-accept,
 * no re-admission, no second take. Only `attached` + `armed` (or a settled
 * `not-owed`) lands the creator in the session.
 *
 * Seam: the feature's `api/` module and the shared attachment/arming apis —
 * the client's wire boundaries.
 */

vi.mock("../api/acceptLiveOutput", () => ({
  acceptLiveOutput: vi.fn(),
}));

vi.mock("@/features/generations/api/takeAttachment", () => ({
  retryPictureAttachment: vi.fn(),
  retryFirstFrameArming: vi.fn(),
}));

const acceptLiveOutputMock = vi.mocked(acceptLiveOutput);
const retryFirstFrameArmingMock = vi.mocked(retryFirstFrameArming);
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
  arming: FirstFrameArming,
): SketchAcceptResult {
  return {
    sessionId: attachment.sessionId,
    promptVersionId: attachment.promptVersionId,
    generationId: attachment.generationId,
    imageUrl: "https://storage.example.com/asset-1",
    createdSession: true,
    attachment,
    arming,
  };
}

const attachedButUnarmed: SketchAcceptResult["attachment"] = {
  state: "attached",
  generationId: "take-9",
  sessionId: "session-made",
  promptVersionId: "v-root",
};

const failedArming: FirstFrameArming = {
  state: "failed",
  generationId: "take-9",
  reason: "keyframe write failed",
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

describe("Use this reports the arming outcome (issue #136)", () => {
  beforeEach(() => {
    acceptLiveOutputMock.mockReset();
    retryPictureAttachmentMock.mockReset();
    retryFirstFrameArmingMock.mockReset();
    currentPathname = "/live";
  });

  it("shows a saved-but-unarmed acceptance as saved-but-not-set instead of landing the creator in a frameless session", async () => {
    acceptLiveOutputMock.mockResolvedValue(
      resultWith(attachedButUnarmed, failedArming),
    );

    const { result } = renderAcceptance();

    act(() => {
      result.current.accept(output({ requestId: "1" }));
    });
    await act(async () => {});

    // The take IS in its session — but the first frame is not armed, and the
    // creator is told that instead of being navigated as if it were.
    expect(result.current.status).toEqual({
      state: "unarmed",
      sessionId: "session-made",
      generationId: "take-9",
    });
    expect(currentPathname).toBe("/live");
  });

  it("the arming retry arms the SAME take by identity through the arm door, then lands in the session", async () => {
    acceptLiveOutputMock.mockResolvedValue(
      resultWith(attachedButUnarmed, failedArming),
    );
    retryFirstFrameArmingMock.mockResolvedValue({
      state: "armed",
      generationId: "take-9",
    });

    const { result } = renderAcceptance();

    act(() => {
      result.current.accept(output({ requestId: "1" }));
    });
    await act(async () => {});

    act(() => {
      result.current.retryArming();
    });
    expect(result.current.status.state).toBe("arming");

    await act(async () => {});

    // The arm door is addressed by identity alone: session + take. Nothing
    // about the picture travels — the server arms the record the session
    // already holds, so no re-accept and no second take is even expressible.
    expect(retryFirstFrameArmingMock).toHaveBeenCalledTimes(1);
    expect(retryFirstFrameArmingMock).toHaveBeenCalledWith(
      "session-made",
      "take-9",
    );
    expect(retryPictureAttachmentMock).not.toHaveBeenCalled();

    // The landing "Use this" promised, now that the frame is really armed.
    expect(currentPathname).toBe("/session/session-made");
    expect(result.current.status.state).toBe("idle");
  });

  it("an arming retry that fails keeps the debt retryable and says why", async () => {
    acceptLiveOutputMock.mockResolvedValue(
      resultWith(attachedButUnarmed, failedArming),
    );
    retryFirstFrameArmingMock
      .mockRejectedValueOnce(new Error("Couldn’t arm the first frame"))
      .mockResolvedValueOnce({ state: "armed", generationId: "take-9" });

    const { result } = renderAcceptance();

    act(() => {
      result.current.accept(output({ requestId: "1" }));
    });
    await act(async () => {});
    act(() => {
      result.current.retryArming();
    });
    await act(async () => {});

    expect(result.current.status).toEqual({
      state: "unarmed",
      sessionId: "session-made",
      generationId: "take-9",
      message: "Couldn’t arm the first frame",
    });
    expect(currentPathname).toBe("/live");

    // The retry stays usable: a second attempt settles the debt.
    act(() => {
      result.current.retryArming();
    });
    await act(async () => {});

    expect(retryFirstFrameArmingMock).toHaveBeenCalledTimes(2);
    expect(currentPathname).toBe("/session/session-made");
  });

  it("an arming reported as not owed (a named destination) lands the same way an armed one does", async () => {
    acceptLiveOutputMock.mockResolvedValue(
      resultWith(attachedButUnarmed, {
        state: "not-owed",
        generationId: "take-9",
      }),
    );

    const { result } = renderAcceptance();

    act(() => {
      result.current.accept(output({ requestId: "1" }));
    });
    await act(async () => {});

    expect(result.current.status.state).toBe("idle");
    expect(currentPathname).toBe("/session/session-made");
    expect(retryFirstFrameArmingMock).not.toHaveBeenCalled();
  });

  it("follows a successful attachment retry with the owed arm, so the reopened session is armed (issue #136)", async () => {
    // The acceptance failed BOTH writes: the take never reached its session,
    // so the arming was refused too ("not saved in this session yet").
    acceptLiveOutputMock.mockResolvedValue(
      resultWith(
        {
          state: "failed",
          generationId: "take-9",
          sessionId: "session-made",
          promptVersionId: "v-root",
          reason: "session write failed",
          record: {
            id: "take-9",
            mediaType: "image",
            status: "completed",
          },
        },
        {
          state: "failed",
          generationId: "take-9",
          reason: "that picture is not saved in this session yet",
        },
      ),
    );
    retryPictureAttachmentMock.mockResolvedValue(undefined);
    retryFirstFrameArmingMock.mockResolvedValue({
      state: "armed",
      generationId: "take-9",
    });

    const { result } = renderAcceptance();

    act(() => {
      result.current.accept(output({ requestId: "1" }));
    });
    await act(async () => {});
    expect(result.current.status.state).toBe("unattached");

    // Saving the take unblocks the arm; the hook follows the save with it.
    act(() => {
      result.current.retryAttachment();
    });
    await act(async () => {});

    expect(retryFirstFrameArmingMock).toHaveBeenCalledWith(
      "session-made",
      "take-9",
    );
    expect(currentPathname).toBe("/session/session-made");
  });
});
