import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useGenerationActions } from "../useGenerationActions";
import type { Generation } from "../../types";

const compileWanPromptMock = vi.fn();
const generateVideoPreviewMock = vi.fn();
const generateStoryboardPreviewMock = vi.fn();
const waitForVideoJobMock = vi.fn();
const getCapabilitiesMock = vi.fn();
const publishCreditBalanceSyncMock = vi.hoisted(() => vi.fn());
const requestCreditBalanceRefreshMock = vi.hoisted(() => vi.fn());

vi.mock("@/services", () => ({
  capabilitiesApi: {
    getCapabilities: (...args: unknown[]) => getCapabilitiesMock(...args),
  },
}));

vi.mock("../../api", () => ({
  compileWanPrompt: (...args: unknown[]) => compileWanPromptMock(...args),
  generateVideoPreview: (...args: unknown[]) =>
    generateVideoPreviewMock(...args),
  generateStoryboardPreview: (...args: unknown[]) =>
    generateStoryboardPreviewMock(...args),
  waitForVideoJob: (...args: unknown[]) => waitForVideoJobMock(...args),
}));

const getUpdateActions = (dispatch: ReturnType<typeof vi.fn>) =>
  dispatch.mock.calls
    .map((call) => call[0] as { type: string; payload?: unknown })
    .filter((action) => action.type === "UPDATE_GENERATION");

const createPendingGeneration = (
  overrides: Partial<Generation> = {},
): Generation => ({
  id: "gen-restore-1",
  tier: "render",
  status: "pending",
  model: "wan-2.2",
  prompt: "A cinematic astronaut crosses the red Martian dust.",
  promptVersionId: "version-1",
  createdAt: Date.now(),
  completedAt: null,
  aspectRatio: "16:9",
  duration: 10,
  fps: 24,
  mediaType: "video",
  mediaUrls: [],
  thumbnailUrl: null,
  serverProgress: 5,
  serverJobStatus: "queued",
  jobId: "job-restore-1",
  isFavorite: false,
  error: null,
  ...overrides,
});

describe("regression: persisted video jobs resume instead of stalling forever", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    compileWanPromptMock.mockResolvedValue("compiled prompt");
    getCapabilitiesMock.mockResolvedValue({
      provider: "generic",
      model: "wan-2.2",
      version: "1",
      fields: {},
    });
  });

  it("reconnects to persisted pending jobs and finalizes them when the server job completes", async () => {
    const dispatch = vi.fn();
    waitForVideoJobMock.mockResolvedValue({
      videoUrl: "https://example.com/generated.mp4",
      assetId: "asset-restore-1",
      storagePath: "users/u1/generations/generated.mp4",
    });

    renderHook(() =>
      useGenerationActions(dispatch, {
        generations: [createPendingGeneration()],
      }),
    );

    await waitFor(() => {
      expect(waitForVideoJobMock).toHaveBeenCalledWith(
        "job-restore-1",
        expect.any(AbortSignal),
        expect.any(Function),
      );
    });

    await waitFor(() => {
      expect(
        getUpdateActions(dispatch).some((action) => {
          const payload = action.payload as
            | {
                id?: string;
                updates?: {
                  status?: string;
                  mediaUrls?: string[];
                  mediaAssetIds?: string[];
                };
              }
            | undefined;
          return (
            payload?.id === "gen-restore-1" &&
            payload.updates?.status === "completed" &&
            payload.updates?.mediaUrls?.[0] ===
              "https://example.com/generated.mp4" &&
            payload.updates?.mediaAssetIds?.[0] === "asset-restore-1"
          );
        }),
      ).toBe(true);
    });
  });

  it("lets restored pending jobs be cancelled after reconnecting to their server job", async () => {
    const dispatch = vi.fn();
    waitForVideoJobMock.mockImplementation(
      (_jobId: string, signal: AbortSignal) =>
        new Promise<null>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const { result } = renderHook(() =>
      useGenerationActions(dispatch, {
        generations: [createPendingGeneration()],
      }),
    );

    await waitFor(() => {
      expect(waitForVideoJobMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      result.current.cancelGeneration("gen-restore-1");
    });

    await waitFor(() => {
      expect(
        getUpdateActions(dispatch).some((action) => {
          const payload = action.payload as
            | {
                id?: string;
                updates?: { status?: string; error?: string };
              }
            | undefined;
          return (
            payload?.id === "gen-restore-1" &&
            payload.updates?.status === "failed" &&
            payload.updates?.error === "Cancelled"
          );
        }),
      ).toBe(true);
    });
  });
});
