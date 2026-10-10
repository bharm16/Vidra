import { describe, expect, it } from "vitest";

import {
  createInitialGenerationState,
  generationReducer,
} from "../generationReducer";

const snapshot = (at: number, dataUri = `data:image/jpeg;base64,frame${at}`) =>
  ({
    type: "snapshot",
    dataUri,
    encodeMs: 3,
    at,
  }) as const;

/**
 * A result carries the inputs its frame was DISPATCHED with (ADR-0022
 * decision 5): the sender reads them at send time, because settings are live
 * state and have moved on by the time the answer lands.
 */
const result = (requestId: string, imageUrl: string, at: number) =>
  ({
    type: "result",
    requestId,
    imageUrl,
    at,
    inputs: { prompt: "a lamp", strength: 0.875, steps: 8, seed: 42 },
  }) as const;

describe("generationReducer — send discipline", () => {
  it("newest snapshot wins the pending slot; the overwritten one counts as skipped", () => {
    let state = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    state = generationReducer(state, snapshot(1_150));
    state = generationReducer(state, snapshot(1_300));

    expect(state.pending?.dataUri).toBe("data:image/jpeg;base64,frame1300");
    expect(state.stats.skipped).toBe(1);
    expect(state.stats.sent).toBe(1);
  });

  it("drops a result whose request id does not match the in-flight frame", () => {
    const inFlightState = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    const state = generationReducer(
      inFlightState,
      result("99", "data:image/jpeg;base64,stale", 1_400),
    );

    expect(state).toEqual(inFlightState);
  });

  it("an error is sticky until the next successful frame and never blanks the live output", () => {
    let state = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    state = generationReducer(
      state,
      result("1", "data:image/jpeg;base64,rendered", 1_400),
    );
    state = generationReducer(state, snapshot(1_500));
    state = generationReducer(state, {
      type: "generationError",
      message: "unexpected result shape",
      at: 1_600,
    });

    expect(state.stats.lastError).toEqual({
      message: "unexpected result shape",
      at: 1_600,
    });
    expect(state.liveOutput?.imageUrl).toBe("data:image/jpeg;base64,rendered");

    state = generationReducer(
      state,
      result("2", "data:image/jpeg;base64,rendered2", 1_800),
    );

    expect(state.stats.lastError).toBeNull();
    expect(state.liveOutput?.imageUrl).toBe("data:image/jpeg;base64,rendered2");
  });
});

/**
 * The relay bounds each creator's daily sketch spend and refuses frames once
 * the allowance is gone (issue #84). A refusal is the one failure the loop
 * must NOT retry: every attempt would be refused, and the retry would be a
 * request the relay has to answer for nothing.
 */
describe("generationReducer — daily allowance halt", () => {
  const RESUME_AT = Date.UTC(2026, 8, 18);
  const halt = (at: number) =>
    ({
      type: "allowanceReached",
      message: "Daily sketch allowance reached.",
      resumeAtMs: RESUME_AT,
      at,
    }) as const;

  it("drops the in-flight and pending frames instead of retrying them", () => {
    let state = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    state = generationReducer(state, snapshot(1_150));
    expect(state.inFlight).not.toBeNull();
    expect(state.pending).not.toBeNull();

    state = generationReducer(state, halt(1_200));

    expect(state.inFlight).toBeNull();
    expect(state.pending).toBeNull();
    expect(state.halted).toEqual({
      message: "Daily sketch allowance reached.",
      resumeAtMs: RESUME_AT,
    });
    expect(state.stats.lastError?.message).toBe(
      "Daily sketch allowance reached.",
    );
  });

  it("resumes on the first snapshot at or after the reset boundary", () => {
    let state = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    state = generationReducer(state, halt(1_200));

    state = generationReducer(state, snapshot(RESUME_AT));

    expect(state.halted).toBeNull();
    expect(state.inFlight?.sentAt).toBe(RESUME_AT);
    // The allowance message goes with the halt — it is stale the moment the
    // loop is sending again.
    expect(state.stats.lastError).toBeNull();
  });
});
