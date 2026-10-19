import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AcceptedRequestSchema, type AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import { ConversationHistory, type ConversationHistoryProps } from "../components/ConversationHistory";

const observers: ControlledResizeObserver[] = [];
class ControlledResizeObserver implements ResizeObserver {
  readonly targets = new Set<Element>();
  disconnected = false;
  constructor(private readonly callback: ResizeObserverCallback) { observers.push(this); }
  observe(target: Element): void { this.targets.add(target); }
  unobserve(target: Element): void { this.targets.delete(target); }
  disconnect(): void { this.disconnected = true; this.targets.clear(); }
  resize(): void { this.callback([], this); }
}
const timestamp = "2026-10-17T06:00:00.000Z";
function request(id: string, sequence: number): AcceptedRequest {
  return AcceptedRequestSchema.parse({ schemaVersion: "vidra-workflow/v2", id, ownerId: "owner", projectId: "project_current", conversationId: "conversation_current", submissionId: `submission_${sequence}`, executionDraftId: `draft_${sequence}`, executionDraftRevision: 1, acceptanceSequence: sequence, snapshotHash: "a".repeat(64), snapshot: { action: "make-image", instructions: sequence === 1 ? "Earlier request" : "Try another version.", inputs: [], settings: { profileId: "qualified", profileRevision: "1", parameters: {}, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_current", conversationId: "conversation_current" } }, materializedContext: { projectInstructions: "", entries: [] }, slots: [{ id: `slot_${sequence}`, ordinal: 1, outcome: "queued", delivery: "none", usage: { mode: "free", reserved: 0, settled: 0 } }], acceptedAt: timestamp });
}
function props(): ConversationHistoryProps {
  return { requests: [request("request_first", 1), request("request_second", 2)], media: [], selected: undefined, pending: [], onView: vi.fn(), onRecover: vi.fn(), access: vi.fn(async () => ({ url: "/unused.png" })) };
}
function geometry(node: HTMLElement, clip = true): { height: number; viewport: number; position: number } {
  const size = { height: 401, viewport: 327, position: 0 };
  if (clip) node.style.setProperty("--vf-history-end-spacing", "73px");
  Object.defineProperties(node, {
    scrollHeight: { configurable: true, get: () => size.height },
    clientHeight: { configurable: true, get: () => size.viewport },
    scrollTop: { configurable: true, get: () => size.position, set: (value: number) => { size.position = Math.max(0, Math.min(value, size.height - size.viewport)); } },
  });
  return size;
}
function resize(): void { act(() => { for (const observer of observers) if (!observer.disconnected) observer.resize(); }); }
beforeEach(() => { observers.length = 0; vi.stubGlobal("ResizeObserver", ControlledResizeObserver); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("follows late article and viewport resizing while pinned without selecting or dropping requests", () => {
  const state = props(); const original = structuredClone(state.requests);
  const { unmount } = render(<ConversationHistory {...state} />);
  const history = screen.getByLabelText("Conversation history"); const size = geometry(history);
  resize(); expect(history.scrollTop).toBe(74);
  expect(observers[0]?.targets.size).toBe(3);
  size.height += 28; resize(); expect(history.scrollTop).toBe(102);
  size.viewport = 380; resize(); expect(history.scrollTop).toBe(49);
  expect(screen.getByText("Earlier request")).toBeInTheDocument();
  expect(screen.getByText("Try another version.")).toBeInTheDocument();
  expect(state.requests).toEqual(original); expect(state.onView).not.toHaveBeenCalled(); expect(state.onRecover).not.toHaveBeenCalled();
  unmount(); expect(observers.every(observer => observer.disconnected)).toBe(true);
});

it("respects a deliberate scroll within the entire 74px clip range through outcome and viewport changes, then follows explicit End", () => {
  render(<ConversationHistory {...props()} />);
  const history = screen.getByLabelText("Conversation history"); const size = geometry(history);
  resize(); history.scrollTop = 0; fireEvent.scroll(history);
  size.height = 388; size.viewport = 380; nodeOutcome("60px"); resize(); fireEvent.scroll(history);
  expect(history.scrollTop).toBe(0);
  size.height = 401; size.viewport = 327; nodeOutcome("73px"); resize(); fireEvent.scroll(history);
  expect(history.scrollTop).toBe(0);
  fireEvent.keyDown(history, { key: "End" }); expect(history.scrollTop).toBe(74);
  size.height += 16; resize(); expect(history.scrollTop).toBe(90);
  function nodeOutcome(value: string): void { history.style.setProperty("--vf-history-end-spacing", value); }
});

it("does not resume following when a resize natively clamps a manually scrolled history to its end", () => {
  render(<ConversationHistory {...props()} />);
  const history = screen.getByLabelText("Conversation history"); const size = geometry(history);
  resize(); history.scrollTop = 30; fireEvent.scroll(history);
  size.viewport = 500; size.height = 500; history.scrollTop = 0; resize(); fireEvent.scroll(history);
  size.viewport = 327; size.height = 401; resize(); fireEvent.scroll(history);
  expect(history.scrollTop).toBe(0);
  fireEvent.keyDown(history, { key: "End" }); expect(history.scrollTop).toBe(74);
});

it("retains the existing 80px progress-follow policy and ignores resize-only changes outside mobile clips", () => {
  const state = props(); const { rerender } = render(<ConversationHistory {...state} />);
  const history = screen.getByLabelText("Conversation history"); const size = geometry(history, false);
  size.height = 2000; size.viewport = 300; history.scrollTop = 1630; fireEvent.scroll(history);
  size.height = 2100; resize(); expect(history.scrollTop).toBe(1630);
  const running = state.requests.map(current => ({ ...current, slots: current.slots.map(slot => ({ ...slot, outcome: "running" as const })) }));
  rerender(<ConversationHistory {...state} requests={running} />); expect(history.scrollTop).toBe(1800);
  history.scrollTop = 0; fireEvent.scroll(history); size.height = 2200;
  rerender(<ConversationHistory {...state} />); expect(history.scrollTop).toBe(0);
});

it("keeps manual intent when desktop styling removes the clip marker or a hidden history has zero dimensions", () => {
  render(<ConversationHistory {...props()} />);
  const history = screen.getByLabelText("Conversation history"); const size = geometry(history);
  resize(); history.scrollTop = 30; fireEvent.scroll(history);
  history.style.removeProperty("--vf-history-end-spacing");
  size.height = 500; size.viewport = 500; history.scrollTop = 0; resize(); fireEvent.scroll(history);
  history.style.setProperty("--vf-history-end-spacing", "73px");
  size.height = 401; size.viewport = 327; resize(); fireEvent.scroll(history);
  expect(history.scrollTop).toBe(0);
  size.height = 0; size.viewport = 0; resize(); fireEvent.scroll(history);
  size.height = 401; size.viewport = 327; resize(); fireEvent.scroll(history);
  expect(history.scrollTop).toBe(0);
  fireEvent.keyDown(history, { key: "End" }); expect(history.scrollTop).toBe(74);
});
