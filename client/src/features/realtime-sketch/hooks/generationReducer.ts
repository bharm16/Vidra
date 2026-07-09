/**
 * Pure state machine for the realtime sketch's generation loop
 * (spec: docs/superpowers/specs/2026-07-09-realtime-sketch-spike-design.md).
 *
 * Send discipline: at most one frame in flight, one newest-wins pending slot.
 * Actions carry their own timestamps so the reducer stays pure and the
 * invariants stay unit-testable.
 */

export interface InFlightFrame {
  requestId: string;
  dataUri: string;
  sentAt: number;
  encodeMs: number;
}

export interface PendingFrame {
  dataUri: string;
  capturedAt: number;
  encodeMs: number;
}

export interface GenerationStats {
  sent: number;
  skipped: number;
  /** Round-trip times of completed frames, newest last (window of 20). */
  rttMs: number[];
  /** Model inference times reported by fal, newest last (window of 20). */
  modelMs: number[];
  /** Arrival timestamps of results, newest last (11 kept = 10 gaps). */
  resultTimes: number[];
  /** Sticky: set on failure, cleared by the next successful frame. */
  lastError: { message: string; at: number } | null;
  /** Encode cost of the most recent snapshot (canvas → JPEG → base64). */
  lastEncodeMs: number | null;
}

export interface LiveOutput {
  imageUrl: string;
  requestId: string;
  at: number;
}

export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "error";

export interface GenerationState {
  epoch: number;
  requestCounter: number;
  connection: ConnectionStatus;
  inFlight: InFlightFrame | null;
  pending: PendingFrame | null;
  liveOutput: LiveOutput | null;
  stats: GenerationStats;
}

export type GenerationAction =
  | { type: "snapshot"; dataUri: string; encodeMs: number; at: number }
  | {
      type: "result";
      requestId: string;
      imageUrl: string;
      inferenceSeconds: number | null;
      at: number;
    }
  | { type: "reconnected"; at: number }
  | {
      type: "generationError";
      message: string;
      at: number;
      /** When the error is attributable to a specific sent frame. */
      requestId?: string;
    };

const RTT_WINDOW = 20;
const RESULT_TIMES_WINDOW = 11;

function pushWindow(values: number[], value: number, cap: number): number[] {
  return [...values, value].slice(-cap);
}

export function createInitialGenerationState(): GenerationState {
  return {
    epoch: 0,
    requestCounter: 0,
    connection: "connecting",
    inFlight: null,
    pending: null,
    liveOutput: null,
    stats: {
      sent: 0,
      skipped: 0,
      rttMs: [],
      modelMs: [],
      resultTimes: [],
      lastError: null,
      lastEncodeMs: null,
    },
  };
}

export function generationReducer(
  state: GenerationState,
  action: GenerationAction,
): GenerationState {
  switch (action.type) {
    case "snapshot": {
      if (state.inFlight !== null) {
        return {
          ...state,
          pending: {
            dataUri: action.dataUri,
            capturedAt: action.at,
            encodeMs: action.encodeMs,
          },
          stats: {
            ...state.stats,
            skipped: state.stats.skipped + (state.pending !== null ? 1 : 0),
            lastEncodeMs: action.encodeMs,
          },
        };
      }
      const requestCounter = state.requestCounter + 1;
      return {
        ...state,
        requestCounter,
        inFlight: {
          requestId: `${state.epoch}-${requestCounter}`,
          dataUri: action.dataUri,
          sentAt: action.at,
          encodeMs: action.encodeMs,
        },
        stats: {
          ...state.stats,
          sent: state.stats.sent + 1,
          lastEncodeMs: action.encodeMs,
        },
      };
    }
    case "result": {
      if (
        state.inFlight === null ||
        state.inFlight.requestId !== action.requestId
      ) {
        return state;
      }
      const stats: GenerationStats = {
        ...state.stats,
        rttMs: pushWindow(
          state.stats.rttMs,
          action.at - state.inFlight.sentAt,
          RTT_WINDOW,
        ),
        modelMs:
          action.inferenceSeconds === null
            ? state.stats.modelMs
            : pushWindow(
                state.stats.modelMs,
                Math.round(action.inferenceSeconds * 1000),
                RTT_WINDOW,
              ),
        resultTimes: pushWindow(
          state.stats.resultTimes,
          action.at,
          RESULT_TIMES_WINDOW,
        ),
        lastError: null,
      };
      if (state.pending === null) {
        return {
          ...state,
          inFlight: null,
          liveOutput: {
            imageUrl: action.imageUrl,
            requestId: action.requestId,
            at: action.at,
          },
          stats,
        };
      }
      const requestCounter = state.requestCounter + 1;
      return {
        ...state,
        requestCounter,
        inFlight: {
          requestId: `${state.epoch}-${requestCounter}`,
          dataUri: state.pending.dataUri,
          sentAt: action.at,
          encodeMs: state.pending.encodeMs,
        },
        pending: null,
        liveOutput: {
          imageUrl: action.imageUrl,
          requestId: action.requestId,
          at: action.at,
        },
        stats: { ...stats, sent: stats.sent + 1 },
      };
    }
    case "reconnected": {
      const epoch = state.epoch + 1;
      if (state.pending === null) {
        return { ...state, epoch, connection: "live", inFlight: null };
      }
      const requestCounter = state.requestCounter + 1;
      return {
        ...state,
        epoch,
        connection: "live",
        requestCounter,
        inFlight: {
          requestId: `${epoch}-${requestCounter}`,
          dataUri: state.pending.dataUri,
          sentAt: action.at,
          encodeMs: state.pending.encodeMs,
        },
        pending: null,
        stats: { ...state.stats, sent: state.stats.sent + 1 },
      };
    }
    case "generationError": {
      const stats: GenerationStats = {
        ...state.stats,
        lastError: { message: action.message, at: action.at },
      };
      const failedInFlight =
        state.inFlight !== null &&
        action.requestId === state.inFlight.requestId;
      if (!failedInFlight) {
        return { ...state, stats };
      }
      if (state.pending === null) {
        return { ...state, inFlight: null, stats };
      }
      const requestCounter = state.requestCounter + 1;
      return {
        ...state,
        requestCounter,
        inFlight: {
          requestId: `${state.epoch}-${requestCounter}`,
          dataUri: state.pending.dataUri,
          sentAt: action.at,
          encodeMs: state.pending.encodeMs,
        },
        pending: null,
        stats: { ...stats, sent: stats.sent + 1 },
      };
    }
  }
}
