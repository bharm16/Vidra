import { useCallback, useReducer, useRef } from "react";
import { generatePreview } from "@/features/preview/api/previewApi";
import { retryPictureAttachment } from "@/features/generations/api/takeAttachment";
import type { KeyframeTile } from "@/features/generation-controls/types";
import type { TakeAttachment } from "@shared/schemas/attachment.schemas";
import type { IdeaBoxStage } from "../types";
import { IDEA_BOX_ASPECT_RATIO } from "../config/constants";

type IdeaBoxAction =
  | { type: "FRAMING" }
  | { type: "READY"; unattachedTake: TakeAttachment | null }
  | { type: "FAILED"; message: string }
  | { type: "ATTACHED" }
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
  /**
   * ADR-0022 decision 6: the frame was made, and its session write was not.
   * Kept beside the stage rather than inside it — the frame is READY and the
   * gate still belongs on screen; "not saved" is a second fact about the same
   * picture, not a different stage of it.
   */
  unattachedTake: TakeAttachment | null;
}

const INITIAL_STATE: IdeaBoxState = {
  stage: { kind: "idle" },
  consecutiveFailures: 0,
  unattachedTake: null,
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
        unattachedTake: null,
      };
    case "READY":
      return {
        stage: { kind: "ready" },
        consecutiveFailures: 0,
        unattachedTake: action.unattachedTake,
      };
    case "FAILED": {
      const consecutiveFailures = state.consecutiveFailures + 1;
      return {
        stage: { kind: "failed", message: action.message, consecutiveFailures },
        consecutiveFailures,
        unattachedTake: null,
      };
    }
    case "ATTACHED":
      return { ...state, unattachedTake: null };
    case "RESET":
      return {
        stage: { kind: "idle" },
        consecutiveFailures: 0,
        unattachedTake: state.unattachedTake,
      };
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
  /**
   * The frame that was made but not saved (ADR-0022 decision 6), or null. It
   * carries the take identity and the record, so retrying re-attaches THIS
   * picture rather than painting another one.
   */
  unattachedTake: TakeAttachment | null;
  /** Re-attach the unsaved frame. Never regenerates and never re-charges. */
  retryAttachment: () => Promise<void>;
}

export function useIdeaBox({
  startImageUrl,
  setStartFrame,
  resolvePersistenceTarget,
}: UseIdeaBoxParams): UseIdeaBoxResult {
  const [state, dispatch] = useReducer(ideaBoxReducer, INITIAL_STATE);
  const runIdRef = useRef(0);
  // Read through a ref so the retry callback stays stable across renders —
  // it is handed to a context whose consumers re-render on identity change.
  const unattachedRef = useRef<TakeAttachment | null>(null);

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
        // The picture is on screen either way; what differs is whether the
        // session has it. Reporting that plainly is the whole point of the
        // explicit state — an absent generationId used to mean both "no
        // session was named" and "the session write failed".
        dispatch({
          type: "READY",
          unattachedTake:
            data.attachment?.state === "failed" ? data.attachment : null,
        });
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

  const retryAttachment = useCallback(async (): Promise<void> => {
    const pending = unattachedRef.current;
    if (!pending) return;
    await retryPictureAttachment(pending);
    dispatch({ type: "ATTACHED" });
  }, []);

  unattachedRef.current = state.unattachedTake;

  return {
    stage: state.stage,
    continueAfterOptimization,
    regenerateFrame: runFrameGeneration,
    acceptFrame,
    unattachedTake: state.unattachedTake,
    retryAttachment,
  };
}
