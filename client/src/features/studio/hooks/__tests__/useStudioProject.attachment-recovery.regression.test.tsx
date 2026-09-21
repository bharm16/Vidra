import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioProject } from "@features/studio/api/schemas";
import type { StudioUnresolvedReturn } from "@features/studio/api/schemas";
import { useStudioProject } from "../useStudioProject";

/**
 * Recovery after refresh (ADR-0022 decision 6, issue #135): the workspace
 * learns from the server's receipts — never from client-held state — that a
 * return is still owed its session row, and offers the same-take retry. The
 * result belongs to the project it was read for (#129's scoping rule): a
 * stale recovery read must not land in the next project's state.
 */

vi.mock("@features/studio/api/studioApi", () => ({
  createStudioProject: vi.fn(),
  deleteStudioProject: vi.fn(),
  fetchUnresolvedStudioReturns: vi.fn(),
  getStudioModels: vi.fn(),
  getStudioProject: vi.fn(),
  getStudioTurn: vi.fn(),
  listStudioProjects: vi.fn(),
  listStudioTurns: vi.fn(),
  registerStudioAttachment: vi.fn(),
  returnStudioImageToSession: vi.fn(),
  runStudioTurn: vi.fn(),
  updateStudioProject: vi.fn(),
  uploadStudioAttachment: vi.fn(),
}));

vi.mock("@/features/generations/api/takeAttachment", () => ({
  retryPictureAttachment: vi.fn(),
}));

import {
  fetchUnresolvedStudioReturns,
  getStudioModels,
  getStudioProject,
  listStudioTurns,
} from "@features/studio/api/studioApi";
import { retryPictureAttachment } from "@/features/generations/api/takeAttachment";

const fetchUnresolved = vi.mocked(fetchUnresolvedStudioReturns);

const projectA: StudioProject = {
  id: "p-a",
  title: "Fox Logo",
  createdAtMs: 2,
  updatedAtMs: 2,
};

const failedReturn: StudioUnresolvedReturn = {
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

describe("regression #135: recovery after refresh finds the unresolved return", () => {
  beforeEach(() => {
    vi.mocked(getStudioModels).mockResolvedValue([]);
    vi.mocked(listStudioTurns).mockResolvedValue([]);
    vi.mocked(getStudioProject).mockResolvedValue(projectA);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reads the server's receipts on open and surfaces the unresolved return", async () => {
    fetchUnresolved.mockResolvedValue([failedReturn]);

    const { result } = renderHook(
      (projectId: string) => useStudioProject(projectId),
      { initialProps: "p-a" },
    );

    await waitFor(() =>
      expect(result.current.state.unresolvedReturns).toEqual([failedReturn]),
    );
    expect(fetchUnresolved).toHaveBeenCalledWith("p-a");
  });

  it("retries the SAME take and clears the entry when it attaches", async () => {
    fetchUnresolved.mockResolvedValue([failedReturn]);
    vi.mocked(retryPictureAttachment).mockResolvedValue(undefined);

    const { result } = renderHook(
      (projectId: string) => useStudioProject(projectId),
      { initialProps: "p-a" },
    );
    await waitFor(() =>
      expect(result.current.state.unresolvedReturns).toHaveLength(1),
    );

    // The retry carries the attachment the server handed back — record and
    // identity included — so it can only ever re-attach this one take.
    let outcome!: { ok: boolean };
    await act(async () => {
      outcome = await result.current.retryReturnAttachment(
        "img-1",
        failedReturn.attachment,
      );
    });

    expect(retryPictureAttachment).toHaveBeenCalledTimes(1);
    expect(retryPictureAttachment).toHaveBeenCalledWith(
      failedReturn.attachment,
    );
    expect(outcome.ok).toBe(true);
    expect(result.current.state.unresolvedReturns).toEqual([]);
  });

  it("keeps the entry when the retry fails, without touching the error band", async () => {
    fetchUnresolved.mockResolvedValue([failedReturn]);
    vi.mocked(retryPictureAttachment).mockRejectedValue(
      new Error("the session is gone"),
    );

    const { result } = renderHook(
      (projectId: string) => useStudioProject(projectId),
      { initialProps: "p-a" },
    );
    await waitFor(() =>
      expect(result.current.state.unresolvedReturns).toHaveLength(1),
    );

    let outcome!: { ok: boolean; message?: string };
    await act(async () => {
      outcome = await result.current.retryReturnAttachment(
        "img-1",
        failedReturn.attachment,
      );
    });

    expect(outcome).toEqual({ ok: false, message: "the session is gone" });
    expect(result.current.state.unresolvedReturns).toHaveLength(1);
    expect(result.current.state.error).toBeNull();
  });

  it("does not surface a recovery read that fails — the workspace still opens", async () => {
    fetchUnresolved.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(
      (projectId: string) => useStudioProject(projectId),
      { initialProps: "p-a" },
    );

    await waitFor(() => expect(result.current.state.loading).toBe(false));
    expect(result.current.state.project?.id).toBe("p-a");
    expect(result.current.state.unresolvedReturns).toEqual([]);
    expect(result.current.state.error).toBeNull();
  });

  it("never applies a stale recovery read to the project opened after it", async () => {
    // The read for p-a is still in flight when the creator opens p-b.
    let settleA!: (returns: StudioUnresolvedReturn[]) => void;
    fetchUnresolved
      .mockImplementationOnce(
        () =>
          new Promise<StudioUnresolvedReturn[]>((resolve) => {
            settleA = resolve;
          }),
      )
      .mockResolvedValue([]);

    const { result, rerender } = renderHook(
      (projectId: string) => useStudioProject(projectId),
      { initialProps: "p-a" },
    );
    // Let p-a's open settle so its recovery read is the one in flight.
    await act(async () => {});
    const projectB: StudioProject = {
      id: "p-b",
      title: "Wordmark",
      createdAtMs: 1,
      updatedAtMs: 1,
    };
    vi.mocked(getStudioProject).mockResolvedValue(projectB);
    rerender("p-b");
    await act(async () => {
      settleA([failedReturn]);
    });

    expect(result.current.state.project?.id).toBe("p-b");
    expect(result.current.state.unresolvedReturns).toEqual([]);
  });
});

describe("regression #135: the reducer keeps unresolved returns project-scoped", () => {
  it("a project switch drops the previous project's unsaved returns", async () => {
    // Only p-a owes a return; p-b's own receipt read comes back empty.
    fetchUnresolved.mockResolvedValueOnce([failedReturn]);
    fetchUnresolved.mockResolvedValue([]);

    const { result, rerender } = renderHook(
      (projectId: string) => useStudioProject(projectId),
      { initialProps: "p-a" },
    );
    await waitFor(() =>
      expect(result.current.state.unresolvedReturns).toHaveLength(1),
    );

    const projectB: StudioProject = {
      id: "p-b",
      title: "Wordmark",
      createdAtMs: 1,
      updatedAtMs: 1,
    };
    vi.mocked(getStudioProject).mockResolvedValue(projectB);
    rerender("p-b");

    await waitFor(() =>
      expect(result.current.state.project?.id).toBe("p-b"),
    );
    expect(result.current.state.unresolvedReturns).toEqual([]);
  });
});
