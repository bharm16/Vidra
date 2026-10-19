import type { AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import type { DraftContent } from "@shared/schemas/workflow/draft.schemas";
import { editDraftBuffer, type DraftBuffer } from "./draftBuffer";

export interface WorkspaceViewState {
  drafts: Record<string, DraftBuffer>;
  activeDraftId: string | undefined;
  requests: AcceptedRequest[];
  viewedVersionId: string | undefined;
  timelineVisible: boolean;
  historyProblem: string | undefined;
}
export type WorkspaceViewEvent =
  | { type: "reset" }
  | { type: "conversation" }
  | { type: "open-draft"; buffer: DraftBuffer }
  | { type: "edit-draft"; draftId: string; content: DraftContent; typingGroup?: string }
  | { type: "update-buffer"; buffer: DraftBuffer }
  | { type: "view-media"; versionId: string }
  | { type: "observe-requests"; requests: AcceptedRequest[] }
  | { type: "timeline-visibility"; visible: boolean };

export const EMPTY_WORKSPACE_VIEW: WorkspaceViewState = { drafts: {}, activeDraftId: undefined, requests: [], viewedVersionId: undefined, timelineVisible: true, historyProblem: undefined };

/** Selection, editing and asynchronous history observations have separate owners. */
export function workspaceViewReducer(state: WorkspaceViewState, event: WorkspaceViewEvent): WorkspaceViewState {
  switch (event.type) {
    case "reset": return EMPTY_WORKSPACE_VIEW;
    case "conversation": return { ...state, activeDraftId: undefined, requests: [], historyProblem: undefined };
    case "open-draft": return { ...state, drafts: { ...state.drafts, [event.buffer.record.id]: event.buffer }, activeDraftId: event.buffer.record.id };
    case "update-buffer": return { ...state, drafts: { ...state.drafts, [event.buffer.record.id]: event.buffer } };
    case "edit-draft": {
      const current = state.drafts[event.draftId];
      if (!current) return state;
      const edited = editDraftBuffer(current, event.content, event.typingGroup);
      return { ...state, drafts: { ...state.drafts, [event.draftId]: edited } };
    }
    case "view-media": return { ...state, viewedVersionId: event.versionId };
    case "timeline-visibility": return { ...state, timelineVisible: event.visible };
    case "observe-requests": {
      const requests = new Map(state.requests.map(request => [request.id, request]));
      for (const request of event.requests) {
        const existing = requests.get(request.id);
        if (existing && existing.snapshotHash !== request.snapshotHash) return { ...state, historyProblem: "A received history update disagrees with the saved request. Keep the original history and reload it." };
        if (existing && (existing.ownerId !== request.ownerId || existing.projectId !== request.projectId || existing.conversationId !== request.conversationId || existing.slots.some((slot, index) => request.slots[index]?.id !== slot.id))) return { ...state, historyProblem: "A received request update has different ownership or result slots. Reload the saved history." };
        requests.set(request.id, existing ? { ...request, slots: request.slots.map((slot, index) => {
          const prior = existing.slots[index];
          if (!prior) return slot;
          // Older polls cannot erase completed work or a confirmed stop.
          if (["completed", "failed", "cancelled", "needs-attention"].includes(prior.outcome) && ["queued", "running", "unknown"].includes(slot.outcome)) return prior;
          if (prior.outcome === "running" && slot.outcome === "queued") return prior;
          if (prior.delivery === "ready" && ["none", "storing", "stored", "attaching"].includes(slot.delivery)) return prior;
          if (prior.cancellation !== "not-requested" && slot.cancellation === "not-requested") return { ...slot, cancellation: prior.cancellation };
          return slot;
        }) } : request);
      }
      return { ...state, requests: [...requests.values()].sort((a, b) => a.acceptanceSequence - b.acceptanceSequence), historyProblem: undefined };
    }
  }
}
