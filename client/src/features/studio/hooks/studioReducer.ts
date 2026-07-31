/**
 * Studio page state — pure reducer, discriminated-union actions (house
 * pattern). The thread IS the turn list: each turn carries its user message
 * and the assistant's decision/results, so no separate message array exists.
 */

import type {
  StudioAttachment,
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
  /**
   * The assistant's thinking text as it STREAMS during the in-flight turn
   * (NDJSON deltas). Null when idle; cleared when the accepted turn (which
   * carries the final text in its decision) lands.
   */
  streamingThinking: string | null;
  /** Local selection (ring + future edit source); persistence lands at M4. */
  selectedImageId: string | null;
  /** S-12: uploaded-but-unsent reference images, staged in the composer. */
  pendingAttachments: StudioAttachment[];
  listOpen: boolean;
  error: string | null;
  loading: boolean;
}

/** The slice of state that belongs to whichever project is open. */
type ProjectScopedState = Pick<
  StudioState,
  | "turns"
  | "pendingTurnId"
  | "optimisticMessage"
  | "streamingThinking"
  | "selectedImageId"
  | "pendingAttachments"
>;

/**
 * What "no project is open" looks like — stated ONCE. Every transition
 * that changes which project the workspace is showing spreads this, so a
 * field added to the project scope cannot be forgotten by one of them
 * (pendingAttachments used to be: staged uploads are registered against a
 * specific project, and survived a switch into the next project's send).
 */
function emptyProjectScope(): ProjectScopedState {
  return {
    turns: [],
    pendingTurnId: null,
    optimisticMessage: null,
    streamingThinking: null,
    selectedImageId: null,
    pendingAttachments: [],
  };
}

export const initialStudioState: StudioState = {
  project: null,
  projects: [],
  models: [],
  ...emptyProjectScope(),
  listOpen: false,
  error: null,
  loading: true,
};

/**
 * The one definition of "a turn is in flight" — true from the moment the
 * message is sent (optimistic) until the polled turn settles. The composer,
 * the thread's pills, and the send guard all read this; deriving it twice
 * left the pills clickable through the whole streaming window, which
 * started a second turn against the same project.
 */
export function isTurnInFlight(state: StudioState): boolean {
  return state.pendingTurnId !== null || state.optimisticMessage !== null;
}

/**
 * The image a settled refinement turn produced, or null.
 *
 * Edit and transform refine ONE lineage, so the working selection follows
 * their output — the policy engine edits the stored selection (template rule
 * 7), and without this hand-off every follow-up edit re-edited the image the
 * user selected before the chain started. A generate fans out options; picking
 * one of those stays the user's move.
 */
export function refinementProducedImageId(turn: StudioTurn): string | null {
  if (turn.decision.action !== "edit" && turn.decision.action !== "transform") {
    return null;
  }
  if (!TERMINAL_STATUSES.has(turn.status)) return null;
  for (let i = turn.calls.length - 1; i >= 0; i -= 1) {
    const call = turn.calls[i];
    if (call?.status === "succeeded" && call.image) return call.image.id;
  }
  return null;
}

export type StudioAction =
  /**
   * Bootstrap settles the roster and the project list SEPARATELY — fusing
   * them meant a failing /models blanked the Creator's whole thread list.
   */
  | { type: "projectsLoaded"; projects: StudioProject[] }
  | { type: "rosterLoaded"; models: StudioModelInfo[] }
  | { type: "projectOpened"; project: StudioProject; turns: StudioTurn[] }
  /**
   * Lazy first-send creation: a continuation, not a switch, so this does
   * NOT clear the project scope — the in-flight optimistic message and
   * (empty) thread are preserved because the turn that triggered the
   * creation is about to land.
   */
  | { type: "projectCreated"; project: StudioProject }
  | { type: "messageSent"; message: string }
  | { type: "attachmentStaged"; attachment: StudioAttachment }
  | { type: "attachmentUnstaged"; attachmentId: string }
  /** A new LLM attempt began — reset the streamed thinking text. */
  | { type: "thinkingStreamStarted" }
  | { type: "thinkingDelta"; delta: string }
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
    case "projectsLoaded":
      return { ...state, projects: action.projects, loading: false };
    case "rosterLoaded":
      return { ...state, models: action.models };
    case "projectOpened":
      return {
        ...state,
        ...emptyProjectScope(),
        project: action.project,
        turns: action.turns,
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
      // Staged attachments ride this message; the composer clears.
      return {
        ...state,
        optimisticMessage: action.message,
        streamingThinking: null,
        pendingAttachments: [],
        error: null,
      };
    case "attachmentStaged":
      return {
        ...state,
        pendingAttachments: [...state.pendingAttachments, action.attachment],
      };
    case "attachmentUnstaged":
      return {
        ...state,
        pendingAttachments: state.pendingAttachments.filter(
          (attachment) => attachment.id !== action.attachmentId,
        ),
      };
    case "thinkingStreamStarted":
      return { ...state, streamingThinking: "" };
    case "thinkingDelta":
      return {
        ...state,
        streamingThinking: (state.streamingThinking ?? "") + action.delta,
      };
    case "turnAccepted":
      return {
        ...state,
        turns: mergeTurn(state.turns, action.turn),
        pendingTurnId: action.turn.id,
        optimisticMessage: null,
        streamingThinking: null,
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
        streamingThinking: null,
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
      return { ...state, ...emptyProjectScope(), projects, project: null };
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
