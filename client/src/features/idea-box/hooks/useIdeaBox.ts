import { useCallback, useReducer, useRef } from "react";
import { generatePreview } from "@/features/preview/api/previewApi";
import type { KeyframeTile } from "@/features/generation-controls/types";
import type { IdeaBoxStage } from "../types";
import { IDEA_BOX_ASPECT_RATIO } from "../config/constants";

type IdeaBoxAction =
  | { type: "FRAMING" }
  | { type: "READY" }
  | { type: "FAILED"; message: string }
  | { type: "RESET" };

/**
 * Reducer state. `consecutiveFailures` lives beside the stage (not only inside
 * the failed variant) because a retry passes through "framing" before the next
 * FAILED — the count must survive that transition to escalate on repeat
 * failures. It resets on success (READY) or reset.
 */
interface IdeaBoxState {
  stage: IdeaBoxStage;
  consecutiveFailures: number;
}

const INITIAL_STATE: IdeaBoxState = {
  stage: { kind: "idle" },
  consecutiveFailures: 0,
};

function ideaBoxReducer(
  state: IdeaBoxState,
  action: IdeaBoxAction,
): IdeaBoxState {
  switch (action.type) {
    case "FRAMING":
      return {
        stage: { kind: "framing" },
        consecutiveFailures: state.consecutiveFailures,
      };
    case "READY":
      return { stage: { kind: "ready" }, consecutiveFailures: 0 };
    case "FAILED": {
      const consecutiveFailures = state.consecutiveFailures + 1;
      return {
        stage: { kind: "failed", message: action.message, consecutiveFailures },
        consecutiveFailures,
      };
    }
    case "RESET":
      return { stage: { kind: "idle" }, consecutiveFailures: 0 };
  }
}

/**
 * The session + words-version a generated frame should persist onto. Both
 * fields are optional so a blank return (no remote session, no version yet)
 * cleanly omits persistence — the picture stays client-only. (M5 D4)
 */
export interface PersistenceTarget {
  sessionId?: string;
  promptVersionId?: string;
}

export interface UseIdeaBoxParams {
  /**
   * Current start-image URL. The chain only runs when no start frame exists —
   * the same condition under which optimization runs at all (I2V mode
   * bypasses the rewrite entirely; see usePromptOptimization).
   */
  startImageUrl: string | null;
  setStartFrame: (tile: KeyframeTile) => void;
  /**
   * Resolves where this frame should persist, invoked once per generation.
   * Mirrors the storyboard's create-on-demand semantics: the words-version is
   * minted/reused at frame time (not at hook creation), so the returned id is
   * the node the picture attaches to. Omitted — or returning blanks — keeps
   * the legacy client-only path (server persistence is opt-in). (M5 D4)
   */
  resolvePersistenceTarget?: () => PersistenceTarget;
}

export interface UseIdeaBoxResult {
  stage: IdeaBoxStage;
  /**
   * Continuation for usePromptOptimization's onOptimizationApplied: generates
   * a first frame from the optimized prompt and sets it as the start frame.
   * Setting the frame flips the workspace into I2V mode, which mounts motion
   * ideas and arms the render gate — no further orchestration here.
   */
  continueAfterOptimization: (optimizedPrompt: string) => Promise<void>;
  /**
   * The gate's reject path: re-generate the first frame from the current
   * prompt, replacing the existing start frame. Deliberately not gated on
   * startImageUrl — replacing a wrong frame is its purpose. (Resubmitting the
   * composer cannot do this: with a frame set, optimization is bypassed and
   * the chain's guard holds.)
   */
  regenerateFrame: (prompt: string) => Promise<void>;
  /** The gate's accept path: dismisses the gate prompt (stage back to idle). */
  acceptFrame: () => void;
}

export function useIdeaBox({
  startImageUrl,
  setStartFrame,
  resolvePersistenceTarget,
}: UseIdeaBoxParams): UseIdeaBoxResult {
  const [state, dispatch] = useReducer(ideaBoxReducer, INITIAL_STATE);
  const runIdRef = useRef(0);

  const runFrameGeneration = useCallback(
    async (rawPrompt: string): Promise<void> => {
      const prompt = rawPrompt.trim();
      if (!prompt) return;

      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      dispatch({ type: "FRAMING" });

      // Resolve the persistence target lazily, at frame time, so the words-
      // version is minted/reused for this exact generation. Blank fields are
      // omitted (not sent as undefined/empty) to preserve the additive,
      // opt-in contract the server relies on to take its legacy path.
      const target = resolvePersistenceTarget?.() ?? {};

      try {
        const response = await generatePreview(prompt, {
          aspectRatio: IDEA_BOX_ASPECT_RATIO,
          ...(target.sessionId ? { sessionId: target.sessionId } : {}),
          ...(target.promptVersionId
            ? { promptVersionId: target.promptVersionId }
            : {}),
        });
        if (runIdRef.current !== runId) return; // superseded by a newer run

        if (!response.success) {
          throw new Error(response.error ?? "Frame generation failed");
        }
        const data = response.data;

        setStartFrame({
          id: `idea-box-${runId}-${Date.now()}`,
          url: data.viewUrl ?? data.imageUrl,
          source: "generation",
          sourcePrompt: prompt,
          ...(data.storagePath ? { storagePath: data.storagePath } : {}),
          ...(data.viewUrlExpiresAt
            ? { viewUrlExpiresAt: data.viewUrlExpiresAt }
            : {}),
          // M5 2b: carry the persisted picture's id so animating this frame
          // links the clip to its source picture in the space.
          ...(data.generationId ? { generationId: data.generationId } : {}),
        });
        dispatch({ type: "READY" });
      } catch (error) {
        if (runIdRef.current !== runId) return;
        dispatch({
          type: "FAILED",
          message:
            error instanceof Error ? error.message : "Frame generation failed",
        });
      }
    },
    [resolvePersistenceTarget, setStartFrame],
  );

  const continueAfterOptimization = useCallback(
    async (optimizedPrompt: string): Promise<void> => {
      if (startImageUrl) return;
      await runFrameGeneration(optimizedPrompt);
    },
    [runFrameGeneration, startImageUrl],
  );

  const acceptFrame = useCallback((): void => {
    dispatch({ type: "RESET" });
  }, []);

  return {
    stage: state.stage,
    continueAfterOptimization,
    regenerateFrame: runFrameGeneration,
    acceptFrame,
  };
}
