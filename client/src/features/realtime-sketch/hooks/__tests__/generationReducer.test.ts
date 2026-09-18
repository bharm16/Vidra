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

describe("generationReducer — send discipline", () => {
  it("sends the first snapshot immediately: it becomes the in-flight frame", () => {
    const state = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );

    expect(state.inFlight).not.toBeNull();
    expect(state.inFlight?.dataUri).toBe("data:image/jpeg;base64,frame1000");
    expect(state.inFlight?.sentAt).toBe(1_000);
    expect(state.inFlight?.requestId).toBe("1");
    expect(state.pending).toBeNull();
    expect(state.stats.sent).toBe(1);
  });

  it("queues a snapshot while a frame is in flight instead of sending it", () => {
    const afterFirst = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    const state = generationReducer(afterFirst, snapshot(1_150));

    expect(state.inFlight).toEqual(afterFirst.inFlight);
    expect(state.pending?.dataUri).toBe("data:image/jpeg;base64,frame1150");
    expect(state.stats.sent).toBe(1);
    expect(state.stats.skipped).toBe(0);
  });

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

  it("a matching result becomes the live output and records round-trip + model stats", () => {
    let state = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    state = generationReducer(state, {
      type: "result",
      requestId: "1",
      imageUrl: "data:image/jpeg;base64,rendered",
      at: 1_400,
    });

    expect(state.liveOutput?.imageUrl).toBe("data:image/jpeg;base64,rendered");
    expect(state.inFlight).toBeNull();
  });

  it("a result immediately promotes the pending frame to in-flight", () => {
    let state = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    state = generationReducer(state, snapshot(1_150));
    state = generationReducer(state, {
      type: "result",
      requestId: "1",
      imageUrl: "data:image/jpeg;base64,rendered",
      at: 1_400,
    });

    expect(state.inFlight?.requestId).toBe("2");
    expect(state.inFlight?.dataUri).toBe("data:image/jpeg;base64,frame1150");
    expect(state.inFlight?.sentAt).toBe(1_400);
    expect(state.pending).toBeNull();
    expect(state.stats.sent).toBe(2);
    expect(state.liveOutput?.requestId).toBe("1");
  });

  it("drops a result whose request id does not match the in-flight frame", () => {
    const inFlightState = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    const state = generationReducer(inFlightState, {
      type: "result",
      requestId: "99",
      imageUrl: "data:image/jpeg;base64,stale",
      at: 1_400,
    });

    expect(state).toEqual(inFlightState);
  });

  it("an error is sticky until the next successful frame and never blanks the live output", () => {
    let state = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    state = generationReducer(state, {
      type: "result",
      requestId: "1",
      imageUrl: "data:image/jpeg;base64,rendered",
      at: 1_400,
    });
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

    state = generationReducer(state, {
      type: "result",
      requestId: "2",
      imageUrl: "data:image/jpeg;base64,rendered2",
      at: 1_800,
    });

    expect(state.stats.lastError).toBeNull();
    expect(state.liveOutput?.imageUrl).toBe("data:image/jpeg;base64,rendered2");
  });

  it("an error attributed to the in-flight frame frees the slot and promotes the pending drawing", () => {
    let state = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    state = generationReducer(state, snapshot(1_150));
    state = generationReducer(state, {
      type: "generationError",
      message: "no image in result",
      requestId: "1",
      at: 1_600,
    });

    expect(state.stats.lastError?.message).toBe("no image in result");
    expect(state.inFlight?.requestId).toBe("2");
    expect(state.inFlight?.dataUri).toBe("data:image/jpeg;base64,frame1150");
    expect(state.pending).toBeNull();
    expect(state.stats.sent).toBe(2);
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

  it("sends nothing while the allowance is spent", () => {
    let state = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    state = generationReducer(state, halt(1_200));
    const sentBefore = state.stats.sent;

    state = generationReducer(state, snapshot(1_400));
    state = generationReducer(state, snapshot(1_600));

    expect(state.inFlight).toBeNull();
    expect(state.pending).toBeNull();
    expect(state.stats.sent).toBe(sentBefore);
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
