import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioProject, StudioTurn } from "@features/studio/api/schemas";
import {
  initialStudioState,
  isTurnInFlight,
  studioReducer,
  type StudioState,
} from "../studioReducer";
import { useStudioProject } from "../useStudioProject";

/**
 * Regression (latent, found during M5 hardening): "busy" was derived twice
 * and the two derivations disagreed. StudioPage used
 * `pendingTurnId || optimisticMessage`; StudioThread used `pendingTurnId`
 * alone. Across the whole thinking-stream window pendingTurnId is null and
 * optimisticMessage is set, so the composer was disabled while every
 * suggestion pill stayed live — and sendMessage had no concurrency guard,
 * so a click there ran a second turn whose turnAccepted orphaned the
 * first turn's poll.
 *
 * Invariant: one definition of "a turn is in flight", true from send until
 * the polled turn settles, and no second turn can start inside it.
 */

vi.mock("@features/studio/api/studioApi", () => ({
  createStudioProject: vi.fn(),
  deleteStudioProject: vi.fn(),
  getStudioModels: vi.fn(),
  getStudioProject: vi.fn(),
  getStudioTurn: vi.fn(),
  listStudioProjects: vi.fn(),
  listStudioTurns: vi.fn(),
  registerStudioAttachment: vi.fn(),
  runStudioTurn: vi.fn(),
  updateStudioProject: vi.fn(),
}));

import {
  getStudioModels,
  listStudioProjects,
  listStudioTurns,
  runStudioTurn,
} from "@features/studio/api/studioApi";

const project: StudioProject = {
  id: "p1",
  title: "Fox Logo",
  createdAtMs: 1,
  updatedAtMs: 1,
};

const decision = {
  action: "generate" as const,
  basePrompt: "a fox logo",
  variants: ["a", "b", "c", "d"],
  capability: "design",
  suggestions: ["make it warmer", "try a mark", "flat colour"],
};

const turn = (status: StudioTurn["status"]): StudioTurn => ({
  id: "t1",
  projectId: "p1",
  status,
  userMessage: "a fox logo",
  decision,
  resolvedModel: "recraft-v4.1",
  calls: [
    { index: 0, status: status === "complete" ? "succeeded" : "running" },
  ],
  createdAtMs: 1,
  updatedAtMs: 1,
});

describe("regression: one definition of a turn in flight", () => {
  it("stays true across send → stream → accept → poll → settle", () => {
    let state: StudioState = initialStudioState;
    expect(isTurnInFlight(state)).toBe(false);

    state = studioReducer(state, {
      type: "messageSent",
      message: "a fox logo",
    });
    expect(isTurnInFlight(state)).toBe(true);

    // The window the two derivations disagreed on: pendingTurnId is still
    // null here while the thinking text streams in.
    state = studioReducer(state, { type: "thinkingStreamStarted" });
    state = studioReducer(state, { type: "thinkingDelta", delta: "The user" });
    expect(state.pendingTurnId).toBeNull();
    expect(isTurnInFlight(state)).toBe(true);

    state = studioReducer(state, {
      type: "turnAccepted",
      turn: turn("running"),
    });
    expect(isTurnInFlight(state)).toBe(true);

    state = studioReducer(state, { type: "turnPolled", turn: turn("running") });
    expect(isTurnInFlight(state)).toBe(true);

    state = studioReducer(state, {
      type: "turnPolled",
      turn: turn("complete"),
    });
    expect(isTurnInFlight(state)).toBe(false);
  });
});

describe("regression: a second send during a turn is a no-op", () => {
  beforeEach(() => {
    vi.mocked(listStudioProjects).mockResolvedValue([project]);
    vi.mocked(getStudioModels).mockResolvedValue([]);
    vi.mocked(listStudioTurns).mockResolvedValue([]);
    // The turn stays in flight for the whole test.
    vi.mocked(runStudioTurn).mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("ignores a suggestion pill clicked while the first turn streams", async () => {
    const { result } = renderHook(() => useStudioProject());
    await act(async () => {});

    act(() => {
      void result.current.sendMessage("a fox logo");
    });
    expect(result.current.state.optimisticMessage).toBe("a fox logo");

    await act(async () => {
      await result.current.sendMessage("make it warmer");
    });

    expect(runStudioTurn).toHaveBeenCalledTimes(1);
    // The in-flight message is untouched — the pill did not hijack it.
    expect(result.current.state.optimisticMessage).toBe("a fox logo");
  });
});
