/**
 * Studio page state — pure reducer, discriminated-union actions (house
 * pattern). The thread IS the turn list: each turn carries its user message
 * and the assistant's decision/results, so no separate message array exists.
 */

import type {
  StudioModelInfo,
  StudioModelSlug,
  StudioProject,
  StudioTurn,
} from "../api/schemas";

export interface StudioState {
  project: StudioProject | null;
  projects: StudioProject[];
  models: StudioModelInfo[];
  /** Chronological thread (oldest first). */
  turns: StudioTurn[];
  /** Turn currently being polled; null when idle. */
  pendingTurnId: string | null;
  /** User message shown optimistically until the 202 arrives. */
  optimisticMessage: string | null;
  /** Local selection (ring + future edit source); persistence lands at M4. */
  selectedImageId: string | null;
  listOpen: boolean;
  error: string | null;
  loading: boolean;
}

export const initialStudioState: StudioState = {
  project: null,
  projects: [],
  models: [],
  turns: [],
  pendingTurnId: null,
  optimisticMessage: null,
  selectedImageId: null,
  listOpen: false,
  error: null,
  loading: true,
};

export type StudioAction =
  | {
      type: "bootstrapped";
      projects: StudioProject[];
      models: StudioModelInfo[];
    }
  | { type: "projectOpened"; project: StudioProject; turns: StudioTurn[] }
  /**
   * Lazy first-send creation: unlike projectOpened, the in-flight
   * optimistic message and (empty) thread are preserved — the turn that
   * triggered the creation is about to land.
   */
  | { type: "projectCreated"; project: StudioProject }
  | { type: "messageSent"; message: string }
  | { type: "turnAccepted"; turn: StudioTurn }
  | { type: "turnPolled"; turn: StudioTurn }
  | { type: "requestFailed"; error: string }
  | { type: "errorDismissed" }
  | { type: "imageSelected"; imageId: string | null }
  | { type: "projectPatched"; project: StudioProject }
  /**
   * Deleting the active project empties the workspace back to the
   * projectless state (the next send lazily creates a fresh project).
   */
  | { type: "projectDeleted"; projectId: string }
  | { type: "listToggled"; open?: boolean };

/** A polled turn replaces its thread entry; unknown ids append (defensive). */
function mergeTurn(turns: StudioTurn[], turn: StudioTurn): StudioTurn[] {
  const index = turns.findIndex((existing) => existing.id === turn.id);
  if (index === -1) return [...turns, turn];
  const next = [...turns];
  next[index] = turn;
  return next;
}

const TERMINAL_STATUSES = new Set(["complete", "partial", "failed"]);

export function studioReducer(
  state: StudioState,
  action: StudioAction,
): StudioState {
  switch (action.type) {
    case "bootstrapped":
      return {
        ...state,
        projects: action.projects,
        models: action.models,
        loading: false,
      };
    case "projectOpened":
      return {
        ...state,
        project: action.project,
        turns: action.turns,
        pendingTurnId: null,
        optimisticMessage: null,
        selectedImageId: action.project.selectedImageId ?? null,
        error: null,
        loading: false,
      };
    case "projectCreated":
      return {
        ...state,
        project: action.project,
        projects: [action.project, ...state.projects],
        selectedImageId: null,
      };
    case "messageSent":
      return { ...state, optimisticMessage: action.message, error: null };
    case "turnAccepted":
      return {
        ...state,
        turns: mergeTurn(state.turns, action.turn),
        pendingTurnId: action.turn.id,
        optimisticMessage: null,
      };
    case "turnPolled": {
      const settled = TERMINAL_STATUSES.has(action.turn.status);
      return {
        ...state,
        turns: mergeTurn(state.turns, action.turn),
        pendingTurnId:
          settled && state.pendingTurnId === action.turn.id
            ? null
            : state.pendingTurnId,
      };
    }
    case "requestFailed":
      return {
        ...state,
        error: action.error,
        optimisticMessage: null,
        pendingTurnId: null,
        loading: false,
      };
    case "errorDismissed":
      return { ...state, error: null };
    case "imageSelected":
      return { ...state, selectedImageId: action.imageId };
    case "projectPatched":
      return {
        ...state,
        project: action.project,
        projects: state.projects.map((project) =>
          project.id === action.project.id ? action.project : project,
        ),
      };
    case "projectDeleted": {
      const projects = state.projects.filter(
        (project) => project.id !== action.projectId,
      );
      if (state.project?.id !== action.projectId) {
        return { ...state, projects };
      }
      return {
        ...state,
        projects,
        project: null,
        turns: [],
        pendingTurnId: null,
        optimisticMessage: null,
        selectedImageId: null,
      };
    }
    case "listToggled":
      return { ...state, listOpen: action.open ?? !state.listOpen };
    default:
      return state;
  }
}

/** Every succeeded image across the thread, for the plane and selection. */
export function collectThreadImages(
  turns: StudioTurn[],
): Array<{ turnId: string; imageId: string; viewUrl?: string }> {
  return turns.flatMap((turn) =>
    turn.calls.flatMap((call) =>
      call.status === "succeeded" && call.image
        ? [
            {
              turnId: turn.id,
              imageId: call.image.id,
              ...(call.image.viewUrl ? { viewUrl: call.image.viewUrl } : {}),
            },
          ]
        : [],
    ),
  );
}

export type { StudioModelSlug };
