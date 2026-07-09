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
    expect(state.inFlight?.requestId).toBe("0-1");
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
      requestId: "0-1",
      imageDataUri: "data:image/jpeg;base64,rendered",
      inferenceSeconds: 0.32,
      at: 1_400,
    });

    expect(state.liveOutput?.imageDataUri).toBe(
      "data:image/jpeg;base64,rendered",
    );
    expect(state.inFlight).toBeNull();
    expect(state.stats.rttMs).toEqual([400]);
    expect(state.stats.modelMs).toEqual([320]);
    expect(state.stats.resultTimes).toEqual([1_400]);
  });

  it("a result immediately promotes the pending frame to in-flight", () => {
    let state = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    state = generationReducer(state, snapshot(1_150));
    state = generationReducer(state, {
      type: "result",
      requestId: "0-1",
      imageDataUri: "data:image/jpeg;base64,rendered",
      inferenceSeconds: null,
      at: 1_400,
    });

    expect(state.inFlight?.requestId).toBe("0-2");
    expect(state.inFlight?.dataUri).toBe("data:image/jpeg;base64,frame1150");
    expect(state.inFlight?.sentAt).toBe(1_400);
    expect(state.pending).toBeNull();
    expect(state.stats.sent).toBe(2);
    expect(state.liveOutput?.requestId).toBe("0-1");
  });

  it("drops a result whose request id does not match the in-flight frame", () => {
    const inFlightState = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    const state = generationReducer(inFlightState, {
      type: "result",
      requestId: "0-99",
      imageDataUri: "data:image/jpeg;base64,stale",
      inferenceSeconds: null,
      at: 1_400,
    });

    expect(state).toEqual(inFlightState);
  });

  it("reconnect abandons the in-flight frame but re-sends the newest pending drawing under the new epoch", () => {
    let state = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    state = generationReducer(state, snapshot(1_150));
    state = generationReducer(state, { type: "reconnected", at: 2_000 });

    expect(state.epoch).toBe(1);
    expect(state.inFlight?.requestId).toBe("1-2");
    expect(state.inFlight?.dataUri).toBe("data:image/jpeg;base64,frame1150");
    expect(state.inFlight?.sentAt).toBe(2_000);
    expect(state.pending).toBeNull();
    expect(state.connection).toBe("live");
  });

  it("reconnect with nothing queued just resets the loop to idle under the new epoch", () => {
    let state = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    state = generationReducer(state, {
      type: "result",
      requestId: "0-1",
      imageDataUri: "data:image/jpeg;base64,rendered",
      inferenceSeconds: null,
      at: 1_400,
    });
    state = generationReducer(state, { type: "reconnected", at: 2_000 });

    expect(state.epoch).toBe(1);
    expect(state.inFlight).toBeNull();
    expect(state.liveOutput?.imageDataUri).toBe(
      "data:image/jpeg;base64,rendered",
    );
  });

  it("an error is sticky until the next successful frame and never blanks the live output", () => {
    let state = generationReducer(
      createInitialGenerationState(),
      snapshot(1_000),
    );
    state = generationReducer(state, {
      type: "result",
      requestId: "0-1",
      imageDataUri: "data:image/jpeg;base64,rendered",
      inferenceSeconds: null,
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
    expect(state.liveOutput?.imageDataUri).toBe(
      "data:image/jpeg;base64,rendered",
    );

    state = generationReducer(state, {
      type: "result",
      requestId: "0-2",
      imageDataUri: "data:image/jpeg;base64,rendered2",
      inferenceSeconds: null,
      at: 1_800,
    });

    expect(state.stats.lastError).toBeNull();
    expect(state.liveOutput?.imageDataUri).toBe(
      "data:image/jpeg;base64,rendered2",
    );
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
      requestId: "0-1",
      at: 1_600,
    });

    expect(state.stats.lastError?.message).toBe("no image in result");
    expect(state.inFlight?.requestId).toBe("0-2");
    expect(state.inFlight?.dataUri).toBe("data:image/jpeg;base64,frame1150");
    expect(state.pending).toBeNull();
    expect(state.stats.sent).toBe(2);
  });
});
