import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as fc from "fast-check";
import { usePromptKeyframesSync } from "../usePromptKeyframesSync";
import { hydrateKeyframes } from "@features/prompt-optimizer/utils/keyframeTransforms";
import type { KeyframeTile } from "@features/generation-controls";
import type { PromptKeyframe } from "@features/prompt-optimizer/types/domain/prompt-session";

type HookParams = Parameters<typeof usePromptKeyframesSync>[0];

const buildParams = (
  overrides: Partial<HookParams> & {
    updateEntryPersisted?: ReturnType<typeof vi.fn>;
    entryKeyframes?: PromptKeyframe[];
  },
): HookParams => {
  const updateEntryPersisted = overrides.updateEntryPersisted ?? vi.fn();
  return {
    keyframes: [],
    startFrame: null,
    setKeyframes: vi.fn(),
    setStartFrame: vi.fn(),
    clearEndFrame: vi.fn(),
    clearVideoReferences: vi.fn(),
    clearExtendVideo: vi.fn(),
    currentPromptUuid: "uuid-1",
    currentPromptDocId: "session_123",
    isLoadingHistory: false,
    promptHistory: {
      history: [
        {
          id: "session_123",
          uuid: "uuid-1",
          keyframes: overrides.entryKeyframes ?? [],
        } as unknown as HookParams["promptHistory"]["history"][number],
      ],
      updateEntryPersisted,
    },
    ...overrides,
  } as HookParams;
};

const startFrameArbitrary = fc.record({
  id: fc.string({ minLength: 1, maxLength: 30 }),
  url: fc
    .string({ minLength: 1, maxLength: 40 })
    .map((s) => `https://media.example.com/${encodeURIComponent(s)}.png`),
  source: fc.constantFrom(
    "generation" as const,
    "upload" as const,
    "library" as const,
  ),
  storagePath: fc.option(
    fc.string({ minLength: 1, maxLength: 40 }).map((s) => `frames/${s}.png`),
    { nil: undefined },
  ),
  generationId: fc.option(fc.string({ minLength: 1, maxLength: 24 }), {
    nil: undefined,
  }),
  sourcePrompt: fc.option(fc.string({ minLength: 1, maxLength: 60 }), {
    nil: undefined,
  }),
});

describe("regression: the armed start frame is a session fact (ADR-0011 D4)", () => {
  it("for any armed start frame, the persisted keyframes carry it at [0] and hydrating them re-arms an equivalent frame", () => {
    fc.assert(
      fc.property(startFrameArbitrary, (frame) => {
        const updateEntryPersisted = vi.fn();
        const startFrame: KeyframeTile = {
          id: frame.id,
          url: frame.url,
          source: frame.source,
          ...(frame.storagePath === undefined
            ? {}
            : { storagePath: frame.storagePath }),
          ...(frame.generationId === undefined
            ? {}
            : { generationId: frame.generationId }),
          ...(frame.sourcePrompt === undefined
            ? {}
            : { sourcePrompt: frame.sourcePrompt }),
        };

        // Arming is a transition: the session is loaded (no frame), then the
        // idea-box / upload arms one. Mount unarmed, then arm. Collaborator
        // identities stay stable across renders, as they do in the component.
        const baseParams = buildParams({ updateEntryPersisted });
        const { rerender } = renderHook(
          ({ armed }: { armed: KeyframeTile | null }) =>
            usePromptKeyframesSync({ ...baseParams, startFrame: armed }),
          { initialProps: { armed: null as KeyframeTile | null } },
        );
        rerender({ armed: startFrame });

        // Write side: the session entry receives the armed frame as keyframes[0].
        expect(updateEntryPersisted).toHaveBeenCalled();
        const lastCall = updateEntryPersisted.mock.calls.at(-1);
        const persisted = (
          lastCall?.[2] as { keyframes?: PromptKeyframe[] } | undefined
        )?.keyframes;
        expect(persisted?.[0]?.url).toBe(startFrame.url);
        if (startFrame.storagePath) {
          expect(persisted?.[0]?.storagePath).toBe(startFrame.storagePath);
        }

        // Read side: hydrating what was persisted re-arms an equivalent frame.
        const rearmed = hydrateKeyframes(persisted)[0];
        expect(rearmed?.url).toBe(startFrame.url);
        expect(rearmed?.storagePath).toBe(startFrame.storagePath);
        // Lineage survives the round trip (M5 2b): a re-armed frame still
        // names its source picture and the words that produced it.
        expect(rearmed?.generationId).toBe(startFrame.generationId);
        expect(rearmed?.sourcePrompt).toBe(startFrame.sourcePrompt);
      }),
      { numRuns: 40 },
    );
  });

  it("a generation-sourced frame keeps its lineage (generationId + sourcePrompt) across persist and hydrate", () => {
    const updateEntryPersisted = vi.fn();
    const startFrame: KeyframeTile = {
      id: "kf-lineage",
      url: "https://media.example.com/frame.png",
      source: "generation",
      storagePath: "frames/frame.png",
      generationId: "gen-source-picture",
      sourcePrompt: "a clockmaker winds a brass clock",
    };
    const baseParams = buildParams({ updateEntryPersisted });
    const { rerender } = renderHook(
      ({ armed }: { armed: KeyframeTile | null }) =>
        usePromptKeyframesSync({ ...baseParams, startFrame: armed }),
      { initialProps: { armed: null as KeyframeTile | null } },
    );
    rerender({ armed: startFrame });

    const persisted = (
      updateEntryPersisted.mock.calls.at(-1)?.[2] as {
        keyframes?: PromptKeyframe[];
      }
    ).keyframes;
    expect(persisted?.[0]?.generationId).toBe("gen-source-picture");
    expect(persisted?.[0]?.sourcePrompt).toBe(
      "a clockmaker winds a brass clock",
    );

    const rearmed = hydrateKeyframes(persisted)[0];
    expect(rearmed?.generationId).toBe("gen-source-picture");
    expect(rearmed?.sourcePrompt).toBe("a clockmaker winds a brass clock");
  });

  it("an armed frame already persisted at [0] does not write again (no dupes, no loops)", () => {
    const updateEntryPersisted = vi.fn();
    const startFrame: KeyframeTile = {
      id: "kf-armed",
      url: "https://media.example.com/frame.png",
      source: "generation",
      storagePath: "frames/frame.png",
    };
    renderHook(() =>
      usePromptKeyframesSync(
        buildParams({
          startFrame,
          keyframes: [startFrame],
          entryKeyframes: [
            {
              id: "kf-armed",
              url: "https://media.example.com/frame.png",
              source: "generation",
              storagePath: "frames/frame.png",
            },
          ],
          updateEntryPersisted,
        }),
      ),
    );
    expect(updateEntryPersisted).not.toHaveBeenCalled();
  });
});
