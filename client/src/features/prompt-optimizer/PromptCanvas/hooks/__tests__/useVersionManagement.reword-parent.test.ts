/**
 * Issue #116 (ADR-0013 M4): a reword must RECORD the version it came from, so
 * the space can draw the true parent instead of guessing it from array order.
 *
 * The parent is the ACTIVE version at the moment the new words-version is
 * created — the version the creator selected and reworded from. These drive
 * the real write path (`handleCreateVersion` / `createVersionIfNeeded`) and
 * assert the persisted entry carries `rewordedFromVersionId`, or omits it for
 * the root.
 *
 * usePromptVersioning is mocked (as in the sibling regression test) because its
 * highlight/generation sync is unrelated to which parent a create records.
 */

import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PromptVersionEntry } from "@features/prompt-optimizer/types/domain/prompt-session";
import { useVersionManagement } from "../useVersionManagement";

vi.mock("../usePromptVersioning", () => ({
  usePromptVersioning: () => ({
    syncVersionHighlights: vi.fn(),
    syncVersionGenerations: vi.fn(),
  }),
}));

const PROMPT_UUID = "3f2b6f2e-9f0a-4d55-8e6a-9adf1c2b7a10";
const DOC_ID = "session_1785518497450_8b752d13";

const versionEntry = (
  over: Partial<PromptVersionEntry> & { versionId: string; timestamp: string },
): PromptVersionEntry => ({
  label: over.versionId,
  signature: `sig-${over.versionId}`,
  prompt: `words ${over.versionId}`,
  ...over,
});

const setup = (params: {
  versions: PromptVersionEntry[];
  activeVersionId: string | null;
  displayedPrompt: string;
}) => {
  const updateEntryVersions = vi.fn();
  const createDraft = vi.fn(() => ({ uuid: "uuid-draft", id: "draft-999" }));

  const hook = renderHook(() =>
    useVersionManagement({
      hasShotContext: false,
      shotId: null,
      shotPromptEntry: null,
      updateShotVersions: vi.fn(),
      promptHistory: {
        history: [
          {
            uuid: PROMPT_UUID,
            id: DOC_ID,
            input: "",
            output: "",
            versions: params.versions,
          },
        ],
        createDraft,
        updateEntryVersions,
      },
      currentPromptUuid: PROMPT_UUID,
      currentPromptDocId: DOC_ID,
      setCurrentPromptUuid: vi.fn(),
      setCurrentPromptDocId: vi.fn(),
      activeVersionId: params.activeVersionId,
      setActiveVersionId: vi.fn(),
      inputPrompt: params.displayedPrompt,
      normalizedDisplayedPrompt: params.displayedPrompt,
      selectedMode: "video",
      selectedModel: "wan-2.2",
      generationParams: {},
      serializedKeyframes: [],
      promptOptimizer: { setOptimizedPrompt: vi.fn() },
      applyInitialHighlightSnapshot: vi.fn(),
      setDisplayedPromptSilently: vi.fn(),
      latestHighlightRef: { current: null },
      versionEditCountRef: { current: 0 },
      versionEditsRef: { current: [] },
      resetVersionEdits: vi.fn(),
    }),
  );

  return { hook, updateEntryVersions, createDraft };
};

const lastPersistedVersions = (
  updateEntryVersions: ReturnType<typeof vi.fn>,
): PromptVersionEntry[] => {
  const call = updateEntryVersions.mock.calls.at(-1);
  return (call?.[2] ?? []) as PromptVersionEntry[];
};

describe("useVersionManagement reword parent (issue #116)", () => {
  it("records the OLDER active version as the parent of a handleCreateVersion reword", () => {
    const { hook, updateEntryVersions } = setup({
      versions: [
        versionEntry({
          versionId: "v1",
          timestamp: "2026-09-18T00:00:01.000Z",
        }),
        versionEntry({
          versionId: "v2",
          timestamp: "2026-09-18T00:00:02.000Z",
        }),
        versionEntry({
          versionId: "v3",
          timestamp: "2026-09-18T00:00:03.000Z",
        }),
      ],
      // The creator selected the OLDER v1 and reworded from it.
      activeVersionId: "v1",
      displayedPrompt: "a fresh rewording of the very first line",
    });

    act(() => {
      hook.result.current.handleCreateVersion();
    });

    const persisted = lastPersistedVersions(updateEntryVersions);
    expect(persisted).toHaveLength(4);
    const created = persisted.at(-1)!;
    // The parent is the OLDER v1, not the trailing v3.
    expect(created.rewordedFromVersionId).toBe("v1");
  });

  it("records the active version through createVersionIfNeeded too", () => {
    const { hook, updateEntryVersions } = setup({
      versions: [
        versionEntry({
          versionId: "v1",
          timestamp: "2026-09-18T00:00:01.000Z",
        }),
        versionEntry({
          versionId: "v2",
          timestamp: "2026-09-18T00:00:02.000Z",
        }),
      ],
      activeVersionId: "v1",
      displayedPrompt: "reworded again from the first line",
    });

    act(() => {
      hook.result.current.createVersionIfNeeded();
    });

    const created = lastPersistedVersions(updateEntryVersions).at(-1)!;
    expect(created.rewordedFromVersionId).toBe("v1");
  });

  it("records NO parent for the session's first words-version (the root)", () => {
    const { hook, updateEntryVersions } = setup({
      versions: [],
      activeVersionId: null,
      displayedPrompt: "the very first words of a brand new idea",
    });

    act(() => {
      hook.result.current.createVersionIfNeeded();
    });

    const created = lastPersistedVersions(updateEntryVersions).at(-1)!;
    expect(created.rewordedFromVersionId).toBeUndefined();
  });
});
