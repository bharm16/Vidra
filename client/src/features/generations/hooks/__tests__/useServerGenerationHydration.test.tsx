import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PromptHistoryEntry } from "@features/prompt-optimizer/types/domain/prompt-session";
import type { OwnedSessionGeneration } from "@features/generations/api/sessionGenerations";
import { useServerGenerationHydration } from "../useServerGenerationHydration";

const mocks = vi.hoisted(() => ({ read: vi.fn(), creator: "creator-1" }));
vi.mock("@features/generations/api/sessionGenerations", () => ({
  readOwnedSessionGeneration: mocks.read,
}));
vi.mock("@repositories/index", () => ({
  getAuthRepository: () => ({ getCurrentUser: () => ({ uid: mocks.creator }) }),
}));
const history: PromptHistoryEntry[] = [
  {
    id: "session-1",
    uuid: "session-1",
    input: "original words",
    output: "original words",
    versions: [
      {
        versionId: "v-1",
        prompt: "original words",
        timestamp: "2026-10-03T12:00:00Z",
        signature: "sig",
        generations: [],
      },
    ],
  },
];
const saved: OwnedSessionGeneration = {
  promptVersionId: "v-1",
  origin: "generated",
  generation: {
    id: "job-1",
    tier: "draft",
    status: "completed",
    model: "wan-2.2",
    prompt: "original words",
    promptVersionId: "v-1",
    createdAt: 100,
    completedAt: 200,
    mediaType: "video",
    mediaUrls: ["https://example.com/clip.mp4"],
  },
};

function setup(): {
  result: { current: ReturnType<typeof useServerGenerationHydration> };
  update: ReturnType<typeof vi.fn>;
} {
  const update = vi.fn();
  const { result } = renderHook(() =>
    useServerGenerationHydration({
      creatorId: "creator-1",
      sessionId: "session-1",
      history,
      updateEntryLocal: update,
      onError: vi.fn(),
    }),
  );
  return { result, update };
}

describe("saved generation hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.creator = "creator-1";
    window.history.replaceState({}, "", "/session/session-1");
  });
  it("adds the exact server take to local history without replacing current words", async () => {
    mocks.read.mockResolvedValue(saved);
    const { result, update } = setup();
    await act(async () =>
      result.current({ sessionId: "session-1", generationId: "job-1" }),
    );
    expect(mocks.read).toHaveBeenCalledWith("creator-1", "session-1", "job-1");
    expect(update).toHaveBeenCalledWith("session-1", {
      versions: [
        { ...history[0]?.versions?.[0], generations: [saved.generation] },
      ],
    });
  });
  it.each(["creator", "navigation"])(
    "discards late saved-take reads after %s changes",
    async (change) => {
      let finish: ((value: OwnedSessionGeneration) => void) | undefined;
      mocks.read.mockImplementation(
        () =>
          new Promise<OwnedSessionGeneration>((resolve) => {
            finish = resolve;
          }),
      );
      const { result, update } = setup();
      act(() =>
        result.current({ sessionId: "session-1", generationId: "job-1" }),
      );
      if (change === "creator") mocks.creator = "creator-2";
      else window.history.pushState({}, "", "/history");
      await act(async () => {
        finish?.(saved);
      });
      expect(update).not.toHaveBeenCalled();
    },
  );
  it("does not read or apply a completion belonging to another session", () => {
    const { result, update } = setup();
    act(() =>
      result.current({ sessionId: "session-2", generationId: "job-1" }),
    );
    expect(mocks.read).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
