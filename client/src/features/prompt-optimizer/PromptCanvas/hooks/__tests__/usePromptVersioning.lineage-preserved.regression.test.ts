import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Generation } from "@features/generations/types";
import type {
  PromptHistoryEntry,
  PromptVersionEntry,
} from "@features/prompt-optimizer/types/domain/prompt-session";
import { usePromptVersioning } from "../usePromptVersioning";

/**
 * Regression: a client write must not erase the server's lineage edge.
 *
 * `version.generations` has two writers. The worker persists a clip with
 * `ancestorGenerationId` (ADR-0013) — the picture→clip edge the space draws.
 * The client then PATCHes its whole versions array back, and the merge picks a
 * whole object per id by a completeness score. A finished runtime clip and its
 * persisted twin score the same, and the tie goes to the incoming one — which
 * has no `ancestorGenerationId`, because that field is not on the client's
 * runtime `Generation` at all. So the edge could be written away by a routine
 * sync, and no type would notice.
 */
const makeRuntimeClip = (): Generation => ({
  id: "gen-clip-1",
  tier: "render",
  status: "completed",
  model: "sora-2",
  prompt: "a dancer in the rain",
  promptVersionId: "v-1",
  createdAt: Date.now(),
  completedAt: Date.now(),
  mediaType: "video",
  mediaUrls: ["https://storage.example.com/clip.mp4"],
  thumbnailUrl: "https://storage.example.com/last.webp",
});

const renderVersioning = (
  updateEntryVersions: ReturnType<typeof vi.fn>,
  persistedVersions: PromptVersionEntry[],
) => {
  const historyEntry: PromptHistoryEntry = {
    id: "doc-1",
    uuid: "uuid-1",
    input: "a dancer in the rain",
    output: "a dancer in the rain",
    versions: persistedVersions,
  };
  return renderHook(() =>
    usePromptVersioning({
      promptHistory: { history: [historyEntry], updateEntryVersions },
      currentPromptUuid: "uuid-1",
      currentPromptDocId: "doc-1",
      activeVersionId: "v-1",
      latestHighlightRef: { current: null },
      versionEditCountRef: { current: 0 },
      versionEditsRef: { current: [] },
      resetVersionEdits: vi.fn(),
    }),
  );
};

describe("regression: syncing generations preserves the server's lineage", () => {
  it("keeps ancestorGenerationId when the runtime clip wins the merge", () => {
    const updateEntryVersions = vi.fn();
    // What the worker persisted: the same clip, carrying its source picture.
    const persisted = {
      ...makeRuntimeClip(),
      ancestorGenerationId: "gen-pic-1",
    } as Generation;

    const { result } = renderVersioning(updateEntryVersions, [
      {
        versionId: "v-1",
        signature: "sig",
        prompt: "a dancer in the rain",
        timestamp: "2026-08-12T00:00:00.000Z",
        generations: [persisted],
      },
    ]);

    act(() => {
      // The client syncs its runtime copy, which has no lineage field.
      result.current.syncVersionGenerations([makeRuntimeClip()]);
    });

    // updateEntryVersions(uuid, docId, versions)
    const written = updateEntryVersions.mock.calls.at(-1)?.[2] as
      | PromptVersionEntry[]
      | undefined;
    const record = written?.[0]?.generations?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(record?.ancestorGenerationId).toBe("gen-pic-1");
  });

  it("keeps a soft-removed record removed", () => {
    const updateEntryVersions = vi.fn();
    const persisted = { ...makeRuntimeClip(), archived: true } as Generation;

    const { result } = renderVersioning(updateEntryVersions, [
      {
        versionId: "v-1",
        signature: "sig",
        prompt: "a dancer in the rain",
        timestamp: "2026-08-12T00:00:00.000Z",
        generations: [persisted],
      },
    ]);

    act(() => {
      result.current.syncVersionGenerations([makeRuntimeClip()]);
    });

    // updateEntryVersions(uuid, docId, versions)
    const written = updateEntryVersions.mock.calls.at(-1)?.[2] as
      | PromptVersionEntry[]
      | undefined;
    const record = written?.[0]?.generations?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(record?.archived).toBe(true);
  });
});
