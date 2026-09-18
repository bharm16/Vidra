import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import {
  sendSketchFrame,
  SketchFrameRefused,
  type SendSketchFrame,
} from "../api/falI2i";
import { FalI2iResultSchema } from "../api/schemas";
import {
  DEFAULT_PROMPT,
  DEFAULT_SEED,
  DEFAULT_STEPS,
  DEFAULT_STRENGTH,
  IN_FLIGHT_WATCHDOG_MS,
} from "../config/constants";
import {
  createInitialGenerationState,
  generationReducer,
  type GenerationState,
} from "./generationReducer";

export interface SketchSettings {
  prompt: string;
  strength: number;
  steps: number;
  seed: number;
}

export interface UseRealtimeSketchReturn {
  state: GenerationState;
  settings: SketchSettings;
  updateSettings: (patch: Partial<SketchSettings>) => void;
  captureSnapshot: (dataUri: string, encodeMs: number) => void;
  rerollSeed: () => void;
}

interface UseRealtimeSketchOptions {
  sendFrameFn?: SendSketchFrame;
}

export function useRealtimeSketch(
  options?: UseRealtimeSketchOptions,
): UseRealtimeSketchReturn {
  const sendFrameFn = options?.sendFrameFn ?? sendSketchFrame;
  const [state, dispatch] = useReducer(
    generationReducer,
    undefined,
    createInitialGenerationState,
  );
  const [settings, setSettings] = useState<SketchSettings>({
    prompt: DEFAULT_PROMPT,
    strength: DEFAULT_STRENGTH,
    steps: DEFAULT_STEPS,
    seed: DEFAULT_SEED,
  });
  const lastSentRef = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // One HTTP request per in-flight frame. The reducer is the only thing that
  // creates in-flight frames, so this effect IS the send discipline's
  // actuator — and AbortController gives the watchdog true cancellation.
  useEffect(() => {
    const frame = state.inFlight;
    if (frame === null || lastSentRef.current === frame.requestId) {
      return;
    }
    lastSentRef.current = frame.requestId;
    const controller = new AbortController();
    const watchdog = setTimeout(() => {
      // Lost/stuck frame: cancel it, surface it, promote the newest drawing.
      controller.abort();
      dispatch({
        type: "generationError",
        message: `frame timed out after ${IN_FLIGHT_WATCHDOG_MS / 1000}s`,
        at: Date.now(),
        requestId: frame.requestId,
      });
    }, IN_FLIGHT_WATCHDOG_MS);
    const current = settingsRef.current;
    sendFrameFn(
      {
        prompt: current.prompt,
        image_url: frame.dataUri,
        strength: current.strength,
        num_inference_steps: current.steps,
        seed: current.seed,
      },
      controller.signal,
    )
      .then((raw) => {
        clearTimeout(watchdog);
        if (controller.signal.aborted) {
          return;
        }
        const at = Date.now();
        const parsed = FalI2iResultSchema.safeParse(raw);
        const image = parsed.success ? parsed.data.images[0] : undefined;
        if (!parsed.success || image === undefined) {
          dispatch({
            type: "generationError",
            message: "unexpected result shape",
            at,
            requestId: frame.requestId,
          });
          return;
        }
        dispatch({
          type: "result",
          requestId: frame.requestId,
          imageUrl: image.url,
          at,
          // The tuple "Use this" records, captured here because HERE is the
          // only place that knows it: `current` is what this frame was sent
          // with, and by the time the answer arrives the creator may have
          // changed every one of these (ADR-0022 decision 5, issue #87).
          inputs: {
            prompt: current.prompt,
            strength: current.strength,
            steps: current.steps,
            // The relay reports the seed it actually used. That is the
            // reproducible fact; the requested seed is only a request, and
            // recording it when the provider chose another would be the
            // fabrication decision 2 forbids.
            seed: parsed.data.seed ?? current.seed,
          },
        });
      })
      .catch((error: unknown) => {
        clearTimeout(watchdog);
        // Aborts are already handled (watchdog dispatched) or intentional
        // (unmount) — only real failures surface here.
        if (controller.signal.aborted) {
          return;
        }
        // A spent daily allowance is not a failure to retry: retrying is what
        // the relay just refused. Halt the loop until the relay's own reset.
        if (
          error instanceof SketchFrameRefused &&
          error.refusal.reason === "daily-allowance-reached"
        ) {
          dispatch({
            type: "allowanceReached",
            message: error.refusal.detail,
            resumeAtMs: error.refusal.resetAtMs,
            at: Date.now(),
          });
          return;
        }
        dispatch({
          type: "generationError",
          message:
            error instanceof Error ? error.message : "sketch frame failed",
          at: Date.now(),
          requestId: frame.requestId,
        });
      });
    return () => {
      // Runs only after this frame settled (inFlight changed) or on unmount;
      // late results are request-id-guarded in the reducer regardless.
      clearTimeout(watchdog);
      controller.abort();
    };
  }, [state.inFlight, sendFrameFn]);

  const captureSnapshot = useCallback(
    (dataUri: string, encodeMs: number): void => {
      dispatch({ type: "snapshot", dataUri, encodeMs, at: Date.now() });
    },
    [],
  );

  const updateSettings = useCallback((patch: Partial<SketchSettings>): void => {
    setSettings((previous) => ({ ...previous, ...patch }));
  }, []);

  const rerollSeed = useCallback((): void => {
    setSettings((previous) => ({
      ...previous,
      seed: Math.floor(Math.random() * 1_000_000_000),
    }));
  }, []);

  return { state, settings, updateSettings, captureSnapshot, rerollSeed };
}
