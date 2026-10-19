import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ProjectSketchCaptureCommandSchema, SketchPictureDataUriSchema } from "@shared/schemas/workflow/sketch.schemas";
import { sendSketchFrame, SketchFrameRefused, type SendSketchFrame } from "@/features/realtime-sketch/api/falI2i";
import { FalI2iResultSchema } from "@/features/realtime-sketch/api/schemas";
import { createInitialGenerationState, generationReducer, type GenerationAction, type GenerationState } from "@/features/realtime-sketch/hooks/generationReducer";
import type { SketchSettings } from "@/features/realtime-sketch/hooks/useRealtimeSketch";
import { DEFAULT_STEPS, DEFAULT_STRENGTH, DEFAULT_SEED, IN_FLIGHT_WATCHDOG_MS } from "@/features/realtime-sketch/config/constants";

type Action = GenerationAction | { type: "stop"; clearError?: boolean } | { type: "resetAllowance" };
function reducer(state: GenerationState, action: Action): GenerationState {
  if (action.type === "stop") return { ...state, inFlight: null, pending: null, stats: { ...state.stats, ...(action.clearError ? { lastError: null } : {}) } };
  if (action.type === "resetAllowance") return { ...state, halted: null, stats: { ...state.stats, lastError: null } };
  if (action.type === "generationError") return { ...state, inFlight: null, pending: null, stats: { ...state.stats, lastError: { message: action.message, at: action.at } } };
  return generationReducer(state, action);
}
export const INITIAL_SKETCH_SETTINGS: SketchSettings = { prompt: "A quiet desk in warm evening light.", strength: DEFAULT_STRENGTH, steps: DEFAULT_STEPS, seed: DEFAULT_SEED };

/** Reuses the bounded relay and newest-wins reducer; stopping aborts transport and drops pending frames. */
export function useProjectSketchPreview(sendFrame: SendSketchFrame = sendSketchFrame): {
  state: GenerationState; settings: SketchSettings; updateSettings(patch: Partial<SketchSettings>): void;
  snapshot(dataUri: string, encodeMs: number): void; start(): void; pause(): void;
  status: "off" | "connecting" | "live" | "paused" | "error" | "limit";
} {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialGenerationState);
  const [settings, setSettings] = useState(INITIAL_SKETCH_SETTINGS);
  const [enabled, setEnabled] = useState(false);
  const [starting, setStarting] = useState(false);
  const drawing = useRef<{ dataUri: string; encodeMs: number }>();
  const currentSettings = useRef(settings); currentSettings.current = settings;
  const enabledRef = useRef(enabled); enabledRef.current = enabled;
  const lastRequest = useRef<string>();
  const snapshot = useCallback((dataUri: string, encodeMs: number): void => {
    drawing.current = { dataUri, encodeMs };
    if (enabledRef.current) dispatch({ type: "snapshot", dataUri, encodeMs, at: Date.now() });
  }, []);
  const start = useCallback((): void => {
    if (state.halted && Date.now() < state.halted.resumeAtMs) return;
    if (!drawing.current || !currentSettings.current.prompt.trim()) return;
    setEnabled(true); setStarting(true); enabledRef.current = true;
    dispatch({ type: "stop", clearError: true });
    dispatch({ type: "snapshot", ...drawing.current, at: Date.now() });
  }, [state.halted]);
  const pause = useCallback((): void => { enabledRef.current = false; setEnabled(false); setStarting(false); dispatch({ type: "stop", clearError: true }); }, []);
  const updateSettings = useCallback((patch: Partial<SketchSettings>): void => { setSettings(previous => ({ ...previous, ...patch })); }, []);
  useEffect(() => {
    if (enabledRef.current && drawing.current && settings.prompt.trim()) dispatch({ type: "snapshot", ...drawing.current, at: Date.now() });
  }, [settings]);

  useEffect(() => {
    const frame = state.inFlight;
    if (!enabled || !frame || frame.requestId === lastRequest.current) return;
    lastRequest.current = frame.requestId;
    const controller = new AbortController();
    const inputs = { ...currentSettings.current };
    const fail = (message: string): void => { setEnabled(false); setStarting(false); enabledRef.current = false; dispatch({ type: "generationError", message, at: Date.now(), requestId: frame.requestId }); };
    const timeout = setTimeout(() => { controller.abort(); fail("The preview took too long. Retry when connected."); }, IN_FLIGHT_WATCHDOG_MS);
    void sendFrame({ prompt: inputs.prompt, image_url: frame.dataUri, strength: inputs.strength, num_inference_steps: inputs.steps, seed: inputs.seed }, controller.signal).then(raw => {
      if (controller.signal.aborted) return;
      const response = FalI2iResultSchema.parse(raw);
      const picture = SketchPictureDataUriSchema.parse(response.images[0]?.url);
      // Validation here prevents a temporary provider URL from masquerading as an exact byte snapshot.
      const actual = ProjectSketchCaptureCommandSchema.shape.inputs.parse({ ...inputs, seed: response.seed ?? inputs.seed });
      setStarting(false);
      dispatch({ type: "result", requestId: frame.requestId, imageUrl: picture, at: Date.now(), inputs: actual });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setEnabled(false); setStarting(false); enabledRef.current = false;
      if (error instanceof SketchFrameRefused && error.refusal.reason === "daily-allowance-reached") dispatch({ type: "allowanceReached", message: error.refusal.detail, resumeAtMs: error.refusal.resetAtMs, at: Date.now() });
      else fail(error instanceof Error ? error.message : "Preview stopped updating.");
    }).finally(() => { clearTimeout(timeout); });
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [enabled, state.inFlight, sendFrame]);

  useEffect(() => {
    if (!state.halted) return;
    const delay = Math.max(0, state.halted.resumeAtMs - Date.now());
    const timer = setTimeout(() => dispatch({ type: "resetAllowance" }), Math.min(delay, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [state.halted]);
  const status = state.halted ? "limit" : state.stats.lastError ? "error" : enabled ? starting ? "connecting" : "live" : state.liveOutput ? "paused" : "off";
  return { state, settings, updateSettings, snapshot, start, pause, status };
}
