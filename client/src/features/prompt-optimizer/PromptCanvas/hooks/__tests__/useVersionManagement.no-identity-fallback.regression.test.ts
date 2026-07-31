/**
 * Regression: no working identity means NO current entry.
 *
 * With currentPromptUuid and currentPromptDocId both null (a fresh "/" —
 * New session), useVersionManagement fell back to history[0]: the most
 * recent session's entry. Its versions and generations then leaked into
 * the fresh workspace — the space rendered the previous session's
 * image/clip lineage, the Anchor empty state (and with it the composer)
 * never mounted, and "New session" became a dead end showing another
 * session's content behind a disabled Make-it bar.
 *
 * Invariant: identity drives entry resolution. No identity resolves to no
 * versions and no active version — never to whichever entry happens to be
 * newest in the store.
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  PromptHistoryEntry,
  PromptVersionEntry,
} from "@features/prompt-optimizer/types/domain/prompt-session";
import { useVersionManagement } from "../useVersionManagement";

vi.mock("../usePromptVersioning", () => ({
  usePromptVersioning: () => ({
    syncVersionHighlights: vi.fn(),
    syncVersionGenerations: vi.fn(),
  }),
}));

const PREVIOUS_SESSION_VERSIONS: PromptVersionEntry[] = [
  {
    versionId: "v-prev-1",
    label: "v1",
    signature: "sig-prev",
    prompt: "a red vintage convertible on a coastal road",
    timestamp: new Date(1000).toISOString(),
    generations: [
      {
        id: "gen-prev-1",
        status: "completed",
        mediaType: "image",
      } as unknown as NonNullable<PromptVersionEntry["generations"]>[number],
    ],
  },
];

const PREVIOUS_SESSION_ENTRY: PromptHistoryEntry = {
  id: "session_1785519433836_df5aefd1",
  uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  input: "a red vintage convertible",
  output: "a red vintage convertible, expanded",
  versions: PREVIOUS_SESSION_VERSIONS,
};

const setup = (identity: { uuid: string | null; docId: string | null }) =>
  renderHook(() =>
    useVersionManagement({
      hasShotContext: false,
      shotId: null,
      shotPromptEntry: null,
      updateShotVersions: vi.fn(),
      promptHistory: {
        history: [PREVIOUS_SESSION_ENTRY],
        createDraft: vi.fn(() => ({ uuid: "u", id: "draft-1" })),
        updateEntryVersions: vi.fn(),
      },
      currentPromptUuid: identity.uuid,
      currentPromptDocId: identity.docId,
      setCurrentPromptUuid: vi.fn(),
      setCurrentPromptDocId: vi.fn(),
      activeVersionId: null,
      setActiveVersionId: vi.fn(),
      inputPrompt: "",
      normalizedDisplayedPrompt: "",
      selectedMode: "video",
      selectedModel: "",
      generationParams: {},
      serializedKeyframes: [],
      promptOptimizer: { setOptimizedPrompt: vi.fn() },
      applyInitialHighlightSnapshot: vi.fn(),
      resetEditStacks: vi.fn(),
      setDisplayedPromptSilently: vi.fn(),
      latestHighlightRef: { current: null },
      versionEditCountRef: { current: 0 },
      versionEditsRef: { current: [] },
      resetVersionEdits: vi.fn(),
      effectiveAspectRatio: null,
    }),
  );

describe("useVersionManagement identity fallback (regression)", () => {
  it("resolves nothing when no identity is set", () => {
    const { result } = setup({ uuid: null, docId: null });

    expect(result.current.currentVersions).toEqual([]);
    expect(result.current.activeVersion).toBeNull();
    expect(result.current.versionsForPanel).toEqual([]);
  });

  it("still resolves the entry the identity points at", () => {
    const { result } = setup({
      uuid: PREVIOUS_SESSION_ENTRY.uuid ?? null,
      docId: PREVIOUS_SESSION_ENTRY.id ?? null,
    });

    expect(result.current.currentVersions).toHaveLength(1);
    expect(result.current.activeVersion?.versionId).toBe("v-prev-1");
  });
});
