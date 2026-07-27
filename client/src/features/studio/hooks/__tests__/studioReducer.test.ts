import { describe, it, expect } from "vitest";
import {
  studioReducer,
  initialStudioState,
  collectThreadImages,
  type StudioState,
} from "../studioReducer";
import type { StudioTurn } from "../../api/schemas";

const makeTurn = (overrides: Partial<StudioTurn> = {}): StudioTurn => ({
  id: "t1",
  projectId: "p1",
  status: "running",
  userMessage: "a logo",
  decision: {
    action: "generate",
    basePrompt: "a logo",
    variants: ["a", "b", "c", "d"],
    capability: "design",
    suggestions: ["s1", "s2", "s3"],
  },
  resolvedModel: "recraft-v4.1",
  calls: [{ index: 0, status: "running" }],
  createdAtMs: 1,
  updatedAtMs: 1,
  ...overrides,
});

describe("studioReducer", () => {
  it("shows the user message optimistically, then swaps in the accepted turn", () => {
    let state: StudioState = initialStudioState;
    state = studioReducer(state, { type: "messageSent", message: "a logo" });
    expect(state.optimisticMessage).toBe("a logo");

    state = studioReducer(state, { type: "turnAccepted", turn: makeTurn() });
    expect(state.optimisticMessage).toBeNull();
    expect(state.pendingTurnId).toBe("t1");
    expect(state.turns).toHaveLength(1);
  });

  it("replaces the thread entry on poll and stops pending on terminal status", () => {
    let state = studioReducer(initialStudioState, {
      type: "turnAccepted",
      turn: makeTurn(),
    });

    state = studioReducer(state, {
      type: "turnPolled",
      turn: makeTurn({ status: "running", updatedAtMs: 2 }),
    });
    expect(state.pendingTurnId).toBe("t1");
    expect(state.turns).toHaveLength(1);

    state = studioReducer(state, {
      type: "turnPolled",
      turn: makeTurn({ status: "complete", updatedAtMs: 3 }),
    });
    expect(state.pendingTurnId).toBeNull();
    expect(state.turns[0]?.status).toBe("complete");
  });

  it("clears optimistic + pending state on request failure", () => {
    let state = studioReducer(initialStudioState, {
      type: "messageSent",
      message: "x",
    });
    state = studioReducer(state, {
      type: "requestFailed",
      error: "Daily studio limit reached",
    });
    expect(state.error).toContain("limit");
    expect(state.optimisticMessage).toBeNull();
    expect(state.pendingTurnId).toBeNull();
  });

  it("opening a project resets the thread and adopts its selection", () => {
    const opened = studioReducer(initialStudioState, {
      type: "projectOpened",
      project: {
        id: "p1",
        title: "Logo",
        selectedImageId: "img-9",
        createdAtMs: 1,
        updatedAtMs: 1,
      },
      turns: [makeTurn({ status: "complete" })],
    });
    expect(opened.selectedImageId).toBe("img-9");
    expect(opened.turns).toHaveLength(1);
    expect(opened.loading).toBe(false);
  });

  it("collectThreadImages returns only succeeded images", () => {
    const turn = makeTurn({
      status: "partial",
      calls: [
        {
          index: 0,
          status: "succeeded",
          image: {
            id: "img-1",
            storagePath: "p",
            sourcePrompt: "a",
            model: "recraft-v4.1",
            viewUrl: "https://signed/1",
          },
        },
        { index: 1, status: "failed", error: "timeout" },
      ],
    });
    const images = collectThreadImages([turn]);
    expect(images).toEqual([
      { turnId: "t1", imageId: "img-1", viewUrl: "https://signed/1" },
    ]);
  });

  it("accumulates streamed thinking deltas and resets on a new attempt", () => {
    let state = studioReducer(initialStudioState, {
      type: "messageSent",
      message: "a fox logo",
    });
    state = studioReducer(state, { type: "thinkingStreamStarted" });
    state = studioReducer(state, { type: "thinkingDelta", delta: "The u" });
    state = studioReducer(state, { type: "thinkingDelta", delta: "ser wants" });
    expect(state.streamingThinking).toBe("The user wants");

    // A corrective retry starts a fresh stream — the old text clears.
    state = studioReducer(state, { type: "thinkingStreamStarted" });
    expect(state.streamingThinking).toBe("");
    state = studioReducer(state, { type: "thinkingDelta", delta: "Take two" });
    expect(state.streamingThinking).toBe("Take two");

    // The accepted turn carries the final text; streaming state clears.
    state = studioReducer(state, { type: "turnAccepted", turn: makeTurn() });
    expect(state.streamingThinking).toBeNull();
  });

  it("clears streamed thinking when the request fails", () => {
    let state = studioReducer(initialStudioState, {
      type: "thinkingStreamStarted",
    });
    state = studioReducer(state, { type: "thinkingDelta", delta: "half a" });
    state = studioReducer(state, {
      type: "requestFailed",
      error: "Daily limit reached",
    });
    expect(state.streamingThinking).toBeNull();
    expect(state.error).toBe("Daily limit reached");
  });

  it("deleting the active project empties the workspace to the projectless state", () => {
    const project = {
      id: "p1",
      title: "Fox Logo",
      createdAtMs: 1,
      updatedAtMs: 1,
    };
    let state = studioReducer(initialStudioState, {
      type: "projectOpened",
      project,
      turns: [makeTurn({ status: "complete" })],
    });
    state = studioReducer(state, { type: "projectCreated", project });

    state = studioReducer(state, { type: "projectDeleted", projectId: "p1" });

    expect(state.project).toBeNull();
    expect(state.turns).toEqual([]);
    expect(state.selectedImageId).toBeNull();
    expect(state.projects.some((p) => p.id === "p1")).toBe(false);
  });

  it("deleting a background project only trims the list", () => {
    const active = {
      id: "p1",
      title: "Active",
      createdAtMs: 1,
      updatedAtMs: 1,
    };
    const other = { id: "p2", title: "Other", createdAtMs: 2, updatedAtMs: 2 };
    let state = studioReducer(initialStudioState, {
      type: "projectsLoaded",
      projects: [active, other],
    });
    state = studioReducer(state, {
      type: "projectOpened",
      project: active,
      turns: [makeTurn()],
    });

    state = studioReducer(state, { type: "projectDeleted", projectId: "p2" });

    expect(state.project?.id).toBe("p1");
    expect(state.turns).toHaveLength(1);
    expect(state.projects.map((p) => p.id)).toEqual(["p1"]);
  });
});
