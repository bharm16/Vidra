/**
 * Regression: a same-turn identity promotion must be visible to version
 * creation.
 *
 * The Idea Box golden path promotes the working prompt to a session identity
 * (applyOptimizationResult → setCurrentPromptUuid/setCurrentPromptDocId) and
 * then, in the same async turn, generates the first frame — which resolves a
 * persistence target through createVersionIfNeeded. That resolver closure was
 * captured on the previous render, so its render-time identity props are
 * stale (null). It used to fall into ensureDraftEntry's mint-a-draft branch,
 * which then OVERWROTE the just-promoted session identity with a local
 * "draft-" identity: highlight persistence 404'd against
 * /sessions/by-prompt/draft-…, the accepted frame never attached to the
 * session, and the next "Make it" forked a brand-new session.
 *
 * Invariant: after the session-state setters run, any resolution — even one
 * invoked from a stale closure in the same turn — must see the promoted
 * identity via promptIdentityRef, mint no draft, and leave the identity
 * untouched.
 *
 * Composes the REAL usePromptSessionState (which owns promptIdentityRef) with
 * useVersionManagement, exactly as PromptStateContext wires them.
 */

import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePromptSessionState } from "@features/prompt-optimizer/context/hooks/usePromptSessionState";
import { useVersionManagement } from "../useVersionManagement";

vi.mock("../usePromptVersioning", () => ({
  usePromptVersioning: () => ({
    syncVersionHighlights: vi.fn(),
    syncVersionGenerations: vi.fn(),
  }),
}));

const PROMPT = "an old lighthouse keeper climbs a spiral staircase";
const PROMOTED_UUID = "3f2b6f2e-9f0a-4d55-8e6a-9adf1c2b7a10";
const PROMOTED_SESSION_ID = "session_1785518497450_8b752d13";

const setup = () => {
  const createDraft = vi.fn(() => ({
    uuid: "uuid-of-minted-draft",
    id: "draft-999",
  }));
  const updateEntryVersions = vi.fn();

  const hook = renderHook(() => {
    const session = usePromptSessionState();
    const versioning = useVersionManagement({
      hasShotContext: false,
      shotId: null,
      shotPromptEntry: null,
      updateShotVersions: vi.fn(),
      promptHistory: {
        history: [],
        createDraft,
        updateEntryVersions,
      },
      currentPromptUuid: session.currentPromptUuid,
      currentPromptDocId: session.currentPromptDocId,
      setCurrentPromptUuid: session.setCurrentPromptUuid,
      setCurrentPromptDocId: session.setCurrentPromptDocId,
      promptIdentityRef: session.promptIdentityRef,
      activeVersionId: null,
      setActiveVersionId: vi.fn(),
      inputPrompt: PROMPT,
      normalizedDisplayedPrompt: PROMPT,
      selectedMode: "video",
      selectedModel: "wan-2.2",
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
    });
    return { session, versioning };
  });

  return { hook, createDraft, updateEntryVersions };
};

describe("useVersionManagement same-turn promotion (regression)", () => {
  it("resolves the promoted identity from a stale closure without minting a draft", () => {
    const { hook, createDraft, updateEntryVersions } = setup();

    // The resolver the Idea Box chain holds: captured BEFORE the promotion.
    const staleCreateVersionIfNeeded =
      hook.result.current.versioning.createVersionIfNeeded;

    act(() => {
      // applyOptimizationResult's promotion…
      hook.result.current.session.setCurrentPromptUuid(PROMOTED_UUID);
      hook.result.current.session.setCurrentPromptDocId(PROMOTED_SESSION_ID);
      // …followed in the SAME turn (no re-render yet) by frame persistence.
      staleCreateVersionIfNeeded();
    });

    // No draft is minted over the promoted identity…
    expect(createDraft).not.toHaveBeenCalled();
    // …the words-version lands on the promoted session…
    expect(updateEntryVersions).toHaveBeenCalledTimes(1);
    expect(updateEntryVersions).toHaveBeenCalledWith(
      PROMOTED_UUID,
      PROMOTED_SESSION_ID,
      expect.arrayContaining([expect.objectContaining({ label: "v1" })]),
    );
    // …and the identity survives untouched.
    expect(hook.result.current.session.currentPromptUuid).toBe(PROMOTED_UUID);
    expect(hook.result.current.session.currentPromptDocId).toBe(
      PROMOTED_SESSION_ID,
    );
  });

  it("still mints a draft when no identity exists at all", () => {
    const { hook, createDraft } = setup();

    act(() => {
      hook.result.current.versioning.createVersionIfNeeded();
    });

    expect(createDraft).toHaveBeenCalledTimes(1);
  });
});
