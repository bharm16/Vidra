import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import {
  connectRealtimeSketch,
  preflightTokenMint,
  type ConnectRealtimeSketch,
  type PreflightTokenMint,
  type RealtimeSketchConnection,
} from "../api/falRealtime";
import { FalRealtimeResultSchema } from "../api/schemas";
import {
  DEFAULT_PROMPT,
  DEFAULT_SEED,
  DEFAULT_STEPS,
  DEFAULT_STRENGTH,
  SNAPSHOT_SIZE,
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
  reconnect: () => void;
}

interface UseRealtimeSketchOptions {
  connectFn?: ConnectRealtimeSketch;
  preflightFn?: PreflightTokenMint;
}

export function useRealtimeSketch(
  options?: UseRealtimeSketchOptions,
): UseRealtimeSketchReturn {
  const connectFn = options?.connectFn ?? connectRealtimeSketch;
  const preflightFn = options?.preflightFn ?? preflightTokenMint;
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
  const [connectNonce, setConnectNonce] = useState(0);
  const connectionRef = useRef<RealtimeSketchConnection | null>(null);
  const lastSentRef = useRef<string | null>(null);
  const previousImageUrlRef = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // fal's machine never reports auth failures; probe the mint ourselves so a
  // dead key/balance shows up in the HUD instead of an eternal "connecting".
  useEffect(() => {
    let cancelled = false;
    void preflightFn().then((message) => {
      if (message !== null && !cancelled) {
        dispatch({ type: "generationError", message, at: Date.now() });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [preflightFn, connectNonce]);

  useEffect(() => {
    const connection = connectFn({
      onResult: (raw) => {
        const at = Date.now();
        const parsed = FalRealtimeResultSchema.safeParse(raw);
        const image = parsed.success ? parsed.data.images[0] : undefined;
        if (!parsed.success || image === undefined) {
          // Attribute to the in-flight frame so the loop frees instead of
          // deadlocking until reconnect (liveness over strict attribution).
          const attributed = lastSentRef.current;
          dispatch({
            type: "generationError",
            message: "unexpected result shape",
            at,
            ...(attributed === null ? {} : { requestId: attributed }),
          });
          return;
        }
        // Realtime binary protocol: raw JPEG bytes → object URL for <img>.
        const blob = new Blob([image.content.slice().buffer], {
          type: image.content_type ?? "image/jpeg",
        });
        // fal includes request_id as an empty string when nothing was echoed.
        const echoed = parsed.data.request_id;
        dispatch({
          type: "result",
          requestId:
            echoed !== undefined && echoed.length > 0
              ? echoed
              : (lastSentRef.current ?? ""),
          imageUrl: URL.createObjectURL(blob),
          inferenceSeconds: parsed.data.timings?.inference ?? null,
          at,
        });
      },
      onError: (error) => {
        const attributed = lastSentRef.current;
        dispatch({
          type: "generationError",
          message:
            error instanceof Error
              ? error.message
              : "realtime connection error",
          at: Date.now(),
          ...(attributed === null ? {} : { requestId: attributed }),
        });
      },
    });
    connectionRef.current = connection;
    return () => {
      connectionRef.current = null;
      connection.close();
    };
  }, [connectFn, connectNonce]);

  // The send effect: fires exactly once per in-flight frame. The reducer is
  // the only thing that creates in-flight frames, so this IS the send
  // discipline's actuator.
  useEffect(() => {
    const frame = state.inFlight;
    if (frame === null || lastSentRef.current === frame.requestId) {
      return;
    }
    lastSentRef.current = frame.requestId;
    const current = settingsRef.current;
    connectionRef.current?.send({
      prompt: current.prompt,
      image_url: frame.dataUri,
      strength: current.strength,
      num_inference_steps: current.steps,
      image_size: { width: SNAPSHOT_SIZE, height: SNAPSHOT_SIZE },
      seed: current.seed,
      sync_mode: true,
      enable_safety_checker: true,
      request_id: frame.requestId,
    });
  }, [state.inFlight]);

  // Each frame mints a fresh object URL; release the displaced one or a
  // long drawing session leaks a blob per result.
  useEffect(() => {
    const current = state.liveOutput?.imageUrl ?? null;
    const previous = previousImageUrlRef.current;
    if (
      previous !== null &&
      previous !== current &&
      previous.startsWith("blob:")
    ) {
      URL.revokeObjectURL(previous);
    }
    previousImageUrlRef.current = current;
  }, [state.liveOutput]);

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

  const reconnect = useCallback((): void => {
    dispatch({ type: "reconnected", at: Date.now() });
    setConnectNonce((nonce) => nonce + 1);
  }, []);

  return {
    state,
    settings,
    updateSettings,
    captureSnapshot,
    rerollSeed,
    reconnect,
  };
}
