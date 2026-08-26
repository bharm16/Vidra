import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Generation } from "@features/generations/types";
import { useGenerationsState } from "../useGenerationsState";

const buildGeneration = (
  id: string,
  status: Generation["status"] = "pending",
  mediaUrls: string[] = [],
  thumbnailUrl: string | null = null,
): Generation => ({
  id,
  tier: "draft",
  status,
  model: "sora-2",
  prompt: `prompt-${id}`,
  promptVersionId: "v1",
  createdAt: Date.now(),
  completedAt: status === "completed" ? Date.now() : null,
  mediaType: "video",
  mediaUrls,
  thumbnailUrl,
});

describe("useGenerationsState", () => {
  it("handles set/update/remove/set-active transitions and isGenerating derivation", () => {
    const { result } = renderHook(() => useGenerationsState());

    // ISSUE-12 follow-up: ADD_GENERATION retired; "a new generation exists"
    // is now SET_GENERATIONS over the current state with the new entry
    // appended. Active-generation tracking + isGenerating derivation still
    // honour the same "last generation" semantics.
    act(() => {
      result.current.dispatch({
        type: "SET_GENERATIONS",
        payload: [buildGeneration("g1", "pending")],
      });
    });

    expect(result.current.generations).toHaveLength(1);
    expect(result.current.activeGenerationId).toBe("g1");
    expect(result.current.isGenerating).toBe(true);

    act(() => {
      result.current.dispatch({
        type: "UPDATE_GENERATION",
        payload: {
          id: "g1",
          updates: { status: "completed", completedAt: Date.now() },
        },
      });
    });
    expect(result.current.isGenerating).toBe(false);

    act(() => {
      result.current.dispatch({
        type: "SET_GENERATIONS",
        payload: [
          ...result.current.generations,
          buildGeneration("g2", "generating"),
        ],
      });
      result.current.dispatch({ type: "SET_ACTIVE", payload: "g1" });
      result.current.dispatch({
        type: "REMOVE_GENERATION",
        payload: { id: "g1" },
      });
    });

    expect(result.current.generations.map((g) => g.id)).toEqual(["g2"]);
    expect(result.current.activeGenerationId).toBe("g2");
    expect(result.current.isGenerating).toBe(true);
  });

  it("preserves active generation when it still exists after SET_GENERATIONS sync", async () => {
    const initial = [
      buildGeneration("g1", "completed"),
      buildGeneration("g2", "completed"),
    ];

    const { result, rerender } = renderHook(
      ({ initialGenerations }) =>
        useGenerationsState({
          initialGenerations,
          promptVersionId: "v1",
        }),
      { initialProps: { initialGenerations: initial } },
    );

    act(() => {
      result.current.setActiveGeneration("g1");
    });
    expect(result.current.activeGenerationId).toBe("g1");

    const next = [
      buildGeneration("g1", "completed"),
      buildGeneration("g3", "completed"),
    ];
    rerender({ initialGenerations: next });

    await waitFor(() => {
      expect(result.current.generations.map((g) => g.id)).toEqual(["g1", "g3"]);
      expect(result.current.activeGenerationId).toBe("g1");
    });
  });

  it("prefers local unsigned URLs over incoming signed URLs for matching generations", async () => {
    const localUnsignedVideo = "https://cdn.example.com/local.mp4";
    const localUnsignedThumb = "https://cdn.example.com/local.jpg";
    const incomingSignedVideo =
      "https://storage.googleapis.com/bucket/local.mp4?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Date=20260101T000000Z&X-Goog-Expires=3600&X-Goog-Signature=signed";
    const incomingSignedThumb =
      "https://storage.googleapis.com/bucket/local.jpg?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Date=20260101T000000Z&X-Goog-Expires=3600&X-Goog-Signature=signed";

    const local = [
      buildGeneration(
        "g1",
        "completed",
        [localUnsignedVideo],
        localUnsignedThumb,
      ),
    ];

    const { result, rerender } = renderHook(
      ({ initialGenerations }) =>
        useGenerationsState({
          initialGenerations,
          promptVersionId: "v1",
        }),
      { initialProps: { initialGenerations: local } },
    );

    rerender({
      initialGenerations: [
        buildGeneration(
          "g1",
          "completed",
          [incomingSignedVideo],
          incomingSignedThumb,
        ),
      ],
    });

    await waitFor(() => {
      expect(result.current.generations[0]?.mediaUrls).toEqual([
        localUnsignedVideo,
      ]);
      expect(result.current.generations[0]?.thumbnailUrl).toBe(
        localUnsignedThumb,
      );
    });
  });

  it("suppresses onGenerationsChange during external sync but emits for local changes", async () => {
    const onGenerationsChange = vi.fn();
    const initial = [buildGeneration("g1", "completed")];

    const { result, rerender } = renderHook(
      ({ initialGenerations }) =>
        useGenerationsState({
          initialGenerations,
          onGenerationsChange,
          promptVersionId: "v1",
        }),
      { initialProps: { initialGenerations: initial } },
    );

    rerender({
      initialGenerations: [buildGeneration("g2", "completed")],
    });

    await waitFor(() => {
      expect(result.current.generations.map((g) => g.id)).toEqual(["g2"]);
    });
    expect(onGenerationsChange).not.toHaveBeenCalled();

    act(() => {
      // Mirror how production grows state: dispatch SET_GENERATIONS directly
      // (the retired addGeneration wrapper did exactly this over the ref).
      result.current.dispatch({
        type: "SET_GENERATIONS",
        payload: [
          ...result.current.generations,
          buildGeneration("g3", "pending"),
        ],
      });
    });

    expect(onGenerationsChange).toHaveBeenCalledTimes(1);
    const latest = onGenerationsChange.mock.calls[0]?.[0] as Generation[];
    expect(latest.map((g) => g.id)).toEqual(["g2", "g3"]);
  });
});
