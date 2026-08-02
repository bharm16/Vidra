import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStudioProject } from "../useStudioProject";

/**
 * Regression (found live 2026-07-25, S-12 verification): the signed GCS
 * upload failed because the PUT omitted headers the V4 signature covers.
 * That invariant now lives with the request, in
 * api/__tests__/studioApi.attach-upload.regression.test.ts — the whole
 * three-step move (grant → PUT → register) sits behind
 * uploadStudioAttachment, so this hook test stops at the feature's api/
 * seam instead of stubbing global fetch.
 *
 * Invariant here: a projectless page births its project before uploading,
 * and the registered attachment is staged on the composer.
 */

vi.mock("../../api/studioApi", () => ({
  createStudioProject: vi.fn(async () => ({
    id: "p1",
    title: "Untitled",
    createdAtMs: 1,
    updatedAtMs: 1,
  })),
  deleteStudioProject: vi.fn(),
  getStudioModels: vi.fn(async () => []),
  getStudioProject: vi.fn(),
  getStudioTurn: vi.fn(),
  listStudioProjects: vi.fn(async () => []),
  listStudioTurns: vi.fn(async () => []),
  runStudioTurn: vi.fn(),
  updateStudioProject: vi.fn(),
  uploadStudioAttachment: vi.fn(async () => ({
    id: "att-1",
    storagePath: "users/u1/previews/images/sketch.png",
    filename: "fox-sketch.png",
    createdAtMs: 2,
  })),
}));

import {
  createStudioProject,
  uploadStudioAttachment,
} from "../../api/studioApi";

describe("regression: attaching a file stages it on the composer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the project on demand, uploads once, and stages the result", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "fox-sketch.png", {
      type: "image/png",
    });

    const { result } = renderHook(() => useStudioProject(null));
    await act(async () => {});
    expect(result.current.state.project).toBeNull();

    await act(async () => {
      await result.current.attachFile(file);
    });

    expect(createStudioProject).toHaveBeenCalledTimes(1);
    expect(uploadStudioAttachment).toHaveBeenCalledWith("p1", file);
    expect(result.current.state.pendingAttachments.map((a) => a.id)).toEqual([
      "att-1",
    ]);
  });
});
