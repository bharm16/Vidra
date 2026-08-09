/**
 * Studio image runner seam.
 *
 * Studio's request shape is deliberately not `ImagePreviewProvider`'s: a
 * studio call carries an opaque per-model `input` bag (the model registry
 * shapes it) plus a hard timeout budget, which the preview request type
 * cannot express — see the note in `ReplicateStudioImageRunner`. So this is
 * a second, studio-local seam rather than a reuse of the preview one.
 */

export interface StudioImageCall {
  /** Replicate model id, e.g. "recraft-ai/recraft-v4.1". */
  model: string;
  input: Record<string, unknown>;
  userId: string;
  /** Hard budget for create+poll; on exceed the call fails (plan: "Timeouts"). */
  timeoutMs: number;
}

export interface StudioImageCallResult {
  imageUrl: string;
  durationMs: number;
}

/**
 * Everything `StudioService` must know to run a studio image call.
 *
 * Deliberately one method: `run` is the only member the service invokes
 * (StudioService.ts:612, :663, :843). Keeping availability off this port is
 * what lets a test fake be an honest `{ run }` rather than a type assertion.
 */
export interface StudioImageRunner {
  run(call: StudioImageCall): Promise<StudioImageCallResult>;
}

/**
 * A runner backed by real credentials, which can therefore be unconfigured.
 *
 * Only the record path needs this: recording against an unavailable runner
 * would capture nothing, so `RecordReplayStudioImageRunner` refuses it up
 * front. Replay-mode fakes and test doubles are always "available" by
 * construction and implement the narrower {@link StudioImageRunner}.
 */
export interface LiveStudioImageRunner extends StudioImageRunner {
  isAvailable(): boolean;
}
