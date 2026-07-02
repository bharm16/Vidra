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

function ideaBoxReducer(
  _state: IdeaBoxStage,
  action: IdeaBoxAction,
): IdeaBoxStage {
  switch (action.type) {
    case "FRAMING":
      return { kind: "framing" };
    case "READY":
      return { kind: "ready" };
    case "FAILED":
      return { kind: "failed", message: action.message };
    case "RESET":
      return { kind: "idle" };
  }
}

export interface UseIdeaBoxParams {
  /**
   * Current start-image URL. The chain only runs when no start frame exists —
   * the same condition under which optimization runs at all (I2V mode
   * bypasses the rewrite entirely; see usePromptOptimization).
   */
  startImageUrl: string | null;
  setStartFrame: (tile: KeyframeTile) => void;
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
}: UseIdeaBoxParams): UseIdeaBoxResult {
  const [stage, dispatch] = useReducer(ideaBoxReducer, { kind: "idle" });
  const runIdRef = useRef(0);

  const runFrameGeneration = useCallback(
    async (rawPrompt: string): Promise<void> => {
      const prompt = rawPrompt.trim();
      if (!prompt) return;

      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      dispatch({ type: "FRAMING" });

      try {
        const response = await generatePreview(prompt, {
          aspectRatio: IDEA_BOX_ASPECT_RATIO,
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
    [setStartFrame],
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
    stage,
    continueAfterOptimization,
    regenerateFrame: runFrameGeneration,
    acceptFrame,
  };
}
