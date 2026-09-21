import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyframeTile } from "@features/generation-controls";
import type { PromptKeyframe } from "@features/prompt-optimizer/types/domain/prompt-session";
import { usePromptKeyframesSync } from "../usePromptKeyframesSync";

/**
 * Reopening selects the specifically accepted picture — issue #136.
 *
 * The accepted first frame is restored from its EXPLICIT persisted identity:
 * `keyframes[0]` of the reopened session, carrying the take's generationId
 * and its durable handle (#125). That identity is what the handoff wrote (and
 * what its arm door repairs), so hydration re-arms THIS picture even when the
 * session holds a newer take — selection by identity, never by recency, and
 * never a heuristic over "which images does this session happen to have".
 *
 * An expired URL does not unseat the identity: hydration keeps the frame and
 * its handle, and the URL is re-minted from the handle (#125).
 */

const ACCEPTED_TAKE_ID = "take-accepted";

/** The identity the handoff armed: expired URL, durable handle intact. */
const acceptedFrameIdentity: PromptKeyframe = {
  id: ACCEPTED_TAKE_ID,
  url: "https://storage.example.com/asset-accepted?sig=expired-an-hour-ago",
  source: "generation",
  assetId: "asset-accepted",
  storagePath: "image-previews/creator-1/asset-accepted",
  generationId: ACCEPTED_TAKE_ID,
  sourcePrompt: "an ergonomic desk lamp glowing",
  viewUrlExpiresAt: "2026-09-20T00:00:00.000Z",
};

describe("reopening a handoff session restores the accepted first frame (issue #136)", () => {
  let params: {
    keyframes: KeyframeTile[];
    startFrame: KeyframeTile | null;
    setKeyframes: ReturnType<typeof vi.fn>;
    setStartFrame: ReturnType<typeof vi.fn>;
    clearEndFrame: ReturnType<typeof vi.fn>;
    clearVideoReferences: ReturnType<typeof vi.fn>;
    clearExtendVideo: ReturnType<typeof vi.fn>;
    currentPromptUuid: string;
    currentPromptDocId: string;
    isLoadingHistory: boolean;
    promptHistory: {
      history: never[];
      updateEntryPersisted: ReturnType<typeof vi.fn>;
    };
  };
  let result: { current: ReturnType<typeof usePromptKeyframesSync> };

  beforeEach(() => {
    params = {
      keyframes: [],
      startFrame: null,
      setKeyframes: vi.fn(),
      setStartFrame: vi.fn(),
      clearEndFrame: vi.fn(),
      clearVideoReferences: vi.fn(),
      clearExtendVideo: vi.fn(),
      currentPromptUuid: "uuid-1",
      currentPromptDocId: "session-1",
      isLoadingHistory: false,
      promptHistory: { history: [], updateEntryPersisted: vi.fn() },
    };
    result = renderHook(() => usePromptKeyframesSync(params)).result;
  });

  it("re-arms the accepted picture — the persisted identity — not whichever take is newest", () => {
    // The reopened session: the accepted sketch take armed at keyframes[0],
    // while a NEWER picture take exists in the session's later words-version.
    // The persisted keyframes name the accepted one; recency would name the
    // other. The sync arms exactly what the identity names.
    act(() => {
      result.current.onLoadKeyframes([acceptedFrameIdentity]);
    });

    expect(params.setStartFrame).toHaveBeenCalledTimes(1);
    const armed = params.setStartFrame.mock.calls[0]?.[0] as KeyframeTile;
    expect(armed.generationId).toBe(ACCEPTED_TAKE_ID);
    expect(armed.id).toBe(ACCEPTED_TAKE_ID);
    expect(params.setKeyframes).toHaveBeenCalledWith([
      expect.objectContaining({ generationId: ACCEPTED_TAKE_ID }),
    ]);
  });

  it("keeps the durable handle on the armed frame so an expired URL recovers instead of an apparently-missing picture (#125)", () => {
    act(() => {
      result.current.onLoadKeyframes([acceptedFrameIdentity]);
    });

    const armed = params.setStartFrame.mock.calls[0]?.[0] as KeyframeTile;
    // The handle survived hydration: this is what the expired URL is
    // re-minted from, so the frame is recoverable, never apparently missing.
    expect(armed.storagePath).toBe("image-previews/creator-1/asset-accepted");
    expect(armed.assetId).toBe("asset-accepted");
    // An expired URL is still the persisted URL — the refresh path re-mints
    // it; the frame is not dropped for being stale.
    expect(armed.url).toContain("asset-accepted");
  });

  it("reading stays lenient for a legacy URL-only frame; the identity rule holds at the WRITE", () => {
    const legacyUrlOnly: PromptKeyframe = {
      id: "legacy-frame",
      url: "https://storage.example.com/old?sig=expired",
      source: "generation",
    };

    act(() => {
      result.current.onLoadKeyframes([legacyUrlOnly]);
    });

    // A legacy session keeps whatever it persisted — hydration does not
    // rewrite history. The WRITE side is where the rule lives:
    // `armFirstFrame` refuses a record with no durable handle, so a handoff
    // can never produce one of these as its "completed" output.
    const armed = params.setStartFrame.mock.calls[0]?.[0] as KeyframeTile;
    expect(armed.id).toBe("legacy-frame");
  });
});
