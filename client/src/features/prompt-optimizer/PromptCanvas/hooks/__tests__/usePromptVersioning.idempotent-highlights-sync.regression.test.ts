import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  PromptHistoryEntry,
  PromptVersionEntry,
} from "@features/prompt-optimizer/types/domain/prompt-session";
import type { HighlightSnapshot } from "../../types";
import { usePromptVersioning } from "../usePromptVersioning";

// Regression: ISSUE-31
//
// Invariant: navigating to a session without making any edit must NOT cause a
// PATCH /versions write. Hydrating the highlights pipeline from server state
// produces a HighlightSnapshot whose `updatedAt` is freshly stamped at parse
// time, but whose content (signature + spans) is identical to what's already
// persisted. The version sync path must treat that as a no-op so the session's
// `updatedAt` doesn't drift on every visit.
//
// Live repro (Sessions panel, 2026-04-30): the Tokyo alleyway session showed
// "4m ago" immediately after a passive navigation that did nothing else —
// because session load triggered re-labeling → echoed snapshot → PATCH.

const SHARED_SIGNATURE = "sig-A";

const buildSnapshot = (
  updatedAt: string,
  overrides: Partial<HighlightSnapshot> = {},
): HighlightSnapshot => ({
  spans: [
    { start: 0, end: 6, category: "subject", confidence: 0.9 },
    { start: 7, end: 12, category: "action", confidence: 0.8 },
  ],
  meta: null,
  signature: SHARED_SIGNATURE,
  cacheId: "cache-A",
  updatedAt,
  ...overrides,
});

const buildHistoryEntry = (): PromptHistoryEntry => ({
  id: "doc-1",
  uuid: "uuid-1",
  input: "samurai meditates",
  output: "samurai meditates",
  versions: [
    {
      versionId: "v-1",
      label: "v1",
      signature: SHARED_SIGNATURE,
      prompt: "samurai meditates",
      timestamp: "2026-04-29T12:00:00.000Z",
      // Highlights snapshot already persisted from a prior session.
      highlights: buildSnapshot("2026-04-29T12:00:00.000Z"),
    } as PromptVersionEntry,
  ],
});

describe("regression: passive session load does not re-PATCH highlights (ISSUE-31)", () => {
  it("does not call updateEntryVersions when the incoming snapshot matches the persisted one", () => {
    const updateEntryVersions = vi.fn();

    const { result } = renderHook(() =>
      usePromptVersioning({
        promptHistory: {
          history: [buildHistoryEntry()],
          updateEntryVersions,
        },
        currentPromptUuid: "uuid-1",
        currentPromptDocId: "doc-1",
        activeVersionId: null,
        latestHighlightRef: { current: null },
        versionEditCountRef: { current: 0 },
        versionEditsRef: { current: [] },
        resetVersionEdits: vi.fn(),
      }),
    );

    // Echo the same content with a freshly stamped updatedAt — exactly what
    // the labeling pipeline produces on session hydration.
    const echoedSnapshot = buildSnapshot("2026-05-02T17:00:00.000Z");

    act(() => {
      result.current.syncVersionHighlights(echoedSnapshot, "samurai meditates");
    });

    expect(updateEntryVersions).not.toHaveBeenCalled();
  });

  it("still persists when the highlight content actually changes (different length)", () => {
    // Sanity check: legitimate edits (different span set, same prompt
    // signature) must STILL flow through to persistence.
    const updateEntryVersions = vi.fn();

    const { result } = renderHook(() =>
      usePromptVersioning({
        promptHistory: {
          history: [buildHistoryEntry()],
          updateEntryVersions,
        },
        currentPromptUuid: "uuid-1",
        currentPromptDocId: "doc-1",
        activeVersionId: null,
        latestHighlightRef: { current: null },
        versionEditCountRef: { current: 0 },
        versionEditsRef: { current: [] },
        resetVersionEdits: vi.fn(),
      }),
    );

    // A genuine new labeling pass returns more spans than the persisted one.
    const expandedSnapshot = buildSnapshot("2026-05-02T17:00:00.000Z", {
      spans: [
        { start: 0, end: 6, category: "subject", confidence: 0.9 },
        { start: 7, end: 12, category: "action", confidence: 0.8 },
        { start: 13, end: 20, category: "lighting", confidence: 0.7 },
      ],
    });

    act(() => {
      result.current.syncVersionHighlights(
        expandedSnapshot,
        "samurai meditates",
      );
    });

    expect(updateEntryVersions).toHaveBeenCalledTimes(1);
  });

  it("persists when the labeler reclassifies a span (same length, different category)", () => {
    // The harder case: an earlier labeling pass categorized a span as
    // "subject"; a later pass corrected it to "character". Same prompt text
    // (signature collides), same cacheId, same number of spans — only the
    // category differs. A length-only or signature-only idempotency check
    // would silently drop this legitimate correction. The per-span
    // structural compare is what makes the guard correct.
    const updateEntryVersions = vi.fn();

    const { result } = renderHook(() =>
      usePromptVersioning({
        promptHistory: {
          history: [buildHistoryEntry()],
          updateEntryVersions,
        },
        currentPromptUuid: "uuid-1",
        currentPromptDocId: "doc-1",
        activeVersionId: null,
        latestHighlightRef: { current: null },
        versionEditCountRef: { current: 0 },
        versionEditsRef: { current: [] },
        resetVersionEdits: vi.fn(),
      }),
    );

    const reclassifiedSnapshot = buildSnapshot("2026-05-02T17:00:00.000Z", {
      spans: [
        // Was "subject" in the persisted record; now "character".
        { start: 0, end: 6, category: "character", confidence: 0.9 },
        { start: 7, end: 12, category: "action", confidence: 0.8 },
      ],
    });

    act(() => {
      result.current.syncVersionHighlights(
        reclassifiedSnapshot,
        "samurai meditates",
      );
    });

    expect(updateEntryVersions).toHaveBeenCalledTimes(1);
  });

  it("persists when a span boundary shifts (same length, same categories, different start/end)", () => {
    // Boundary-only change: the labeler now thinks the action verb starts
    // one character earlier. Same length, same category strings — only the
    // span coordinates differ. The structural compare must catch this.
    const updateEntryVersions = vi.fn();

    const { result } = renderHook(() =>
      usePromptVersioning({
        promptHistory: {
          history: [buildHistoryEntry()],
          updateEntryVersions,
        },
        currentPromptUuid: "uuid-1",
        currentPromptDocId: "doc-1",
        activeVersionId: null,
        latestHighlightRef: { current: null },
        versionEditCountRef: { current: 0 },
        versionEditsRef: { current: [] },
        resetVersionEdits: vi.fn(),
      }),
    );

    const shiftedSnapshot = buildSnapshot("2026-05-02T17:00:00.000Z", {
      spans: [
        { start: 0, end: 6, category: "subject", confidence: 0.9 },
        // Boundary moved: was [7,12], now [6,12].
        { start: 6, end: 12, category: "action", confidence: 0.8 },
      ],
    });

    act(() => {
      result.current.syncVersionHighlights(
        shiftedSnapshot,
        "samurai meditates",
      );
    });

    expect(updateEntryVersions).toHaveBeenCalledTimes(1);
  });

  it("does NOT persist when only confidence drifts (LLM noise across runs)", () => {
    // Confidence is non-deterministic numerical output from the labeler. A
    // re-run of the same labeling on the same text produces the same span
    // boundaries and categories with slightly different confidence scores
    // (e.g. 0.9 → 0.91). That drift must NOT trigger a passive PATCH —
    // otherwise the "browsing is read-only" invariant fails for the same
    // reason it failed before this guard existed.
    const updateEntryVersions = vi.fn();

    const { result } = renderHook(() =>
      usePromptVersioning({
        promptHistory: {
          history: [buildHistoryEntry()],
          updateEntryVersions,
        },
        currentPromptUuid: "uuid-1",
        currentPromptDocId: "doc-1",
        activeVersionId: null,
        latestHighlightRef: { current: null },
        versionEditCountRef: { current: 0 },
        versionEditsRef: { current: [] },
        resetVersionEdits: vi.fn(),
      }),
    );

    const confidenceDriftSnapshot = buildSnapshot("2026-05-02T17:00:00.000Z", {
      spans: [
        { start: 0, end: 6, category: "subject", confidence: 0.91 },
        { start: 7, end: 12, category: "action", confidence: 0.79 },
      ],
    });

    act(() => {
      result.current.syncVersionHighlights(
        confidenceDriftSnapshot,
        "samurai meditates",
      );
    });

    expect(updateEntryVersions).not.toHaveBeenCalled();
  });
});
