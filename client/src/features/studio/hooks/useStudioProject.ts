/**
 * Studio page orchestration: bootstrap (projects + roster), project
 * open/create, sending turns, and the 1s poll while a turn is running
 * (plan: "Request flow (asynchronous turns)").
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  createStudioProject,
  deleteStudioProject,
  getStudioModels,
  getStudioProject,
  getStudioTurn,
  listStudioProjects,
  listStudioTurns,
  runStudioTurn,
  updateStudioProject,
  uploadStudioAttachment,
} from "../api/studioApi";
import type { StudioProject, StudioTurn } from "../api/schemas";
import {
  initialStudioState,
  isTurnInFlight,
  refinementProducedImageId,
  studioReducer,
  type StudioAction,
  type StudioState,
} from "./studioReducer";

const POLL_INTERVAL_MS = 1000;

export interface UseStudioProjectReturn {
  state: StudioState;
  dispatch: React.Dispatch<StudioAction>;
  openProject: (project: StudioProject) => Promise<void>;
  newProject: () => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
  renameProject: (title: string) => Promise<void>;
  /** A roster slug, or null for Auto. The server owns the roster. */
  pinModel: (slug: string | null) => Promise<void>;
  selectImage: (imageId: string | null) => void;
  deleteProject: (projectId: string) => Promise<void>;
  /** S-12: upload + stage a reference image on the composer. */
  attachFile: (file: File) => Promise<void>;
  removeAttachment: (attachmentId: string) => void;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

export function useStudioProject(): UseStudioProjectReturn {
  const [state, dispatch] = useReducer(studioReducer, initialStudioState);
  // Which project is open, readable synchronously: the poll interval reads
  // it without re-arming, and the settle guards below read it to tell their
  // own project from an abandoned one. A dispatch is invisible to already-
  // running async code until React re-renders, so every transition that
  // changes the open project also writes this ref at the same moment.
  const projectIdRef = useRef<string | null>(null);
  projectIdRef.current = state.project?.id ?? null;
  const pendingAttachmentIdsRef = useRef<string[]>([]);
  pendingAttachmentIdsRef.current = state.pendingAttachments.map(
    (attachment) => attachment.id,
  );
  // One definition of "a turn is in flight" (studioReducer owns it), read
  // by sendMessage's concurrency guard. Latched synchronously on send so
  // two clicks in the same tick cannot both start a turn.
  const turnInFlightRef = useRef(false);
  turnInFlightRef.current = isTurnInFlight(state);

  /**
   * Every async settle is addressed to the project it was issued for. A
   * project switch mid-flight makes the result stale, and mergeTurn
   * appends unknown ids by design — so an unguarded dispatch drops the old
   * project's turn into the newly-opened thread.
   */
  const isCurrentProject = useCallback(
    (projectId: string): boolean => projectIdRef.current === projectId,
    [],
  );

  // Bootstrap: the roster and the project list settle INDEPENDENTLY. Fused
  // (one Promise.all, one action) a failing /models cost the Creator their
  // entire thread history; the composer already degrades to Auto on an
  // empty roster. An empty account stays projectless — the project is
  // created lazily on the first send (StrictMode's double-mounted effect
  // used to create two "Untitled" projects here; bootstrap makes no
  // writes at all).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const models = await getStudioModels();
        if (!cancelled) dispatch({ type: "rosterLoaded", models });
      } catch (error) {
        if (!cancelled) {
          dispatch({ type: "requestFailed", error: describeError(error) });
        }
      }
    })();
    void (async () => {
      try {
        const projects = await listStudioProjects();
        if (cancelled) return;
        dispatch({ type: "projectsLoaded", projects });
        const mostRecent = projects[0];
        if (!mostRecent) return;
        const turns = await listStudioTurns(mostRecent.id);
        if (cancelled) return;
        dispatch({ type: "projectOpened", project: mostRecent, turns });
      } catch (error) {
        if (!cancelled) {
          dispatch({ type: "requestFailed", error: describeError(error) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll the pending turn until it settles (reducer clears pendingTurnId).
  useEffect(() => {
    if (!state.pendingTurnId) return;
    const turnId = state.pendingTurnId;
    const interval = setInterval(() => {
      const projectId = projectIdRef.current;
      if (!projectId) return;
      void getStudioTurn(projectId, turnId)
        .then(async (turn: StudioTurn) => {
          // Clearing the interval does not cancel the request already in
          // flight; a result for an abandoned project is dropped here.
          if (!isCurrentProject(projectId)) return;
          dispatch({ type: "turnPolled", turn });
          // A settled turn can change the project doc server-side
          // (auto-title, behavior 8) — sync it so the header updates
          // without a reload.
          if (turn.status !== "running") {
            // A refinement's result becomes the working selection, locally
            // and persisted — the next turn's policy context reads the
            // stored selection, so without this hand-off consecutive edits
            // all re-edit the image selected before the chain started.
            const produced = refinementProducedImageId(turn);
            if (produced) {
              dispatch({ type: "imageSelected", imageId: produced });
              void updateStudioProject(projectId, {
                selectedImageId: produced,
              }).catch((error: unknown) =>
                dispatch({
                  type: "requestFailed",
                  error: describeError(error),
                }),
              );
            }
            const project = await getStudioProject(projectId);
            if (isCurrentProject(project.id)) {
              dispatch({ type: "projectPatched", project });
            }
          }
        })
        .catch((error: unknown) =>
          dispatch({ type: "requestFailed", error: describeError(error) }),
        );
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [state.pendingTurnId, isCurrentProject]);

  const openProject = useCallback(async (project: StudioProject) => {
    try {
      const turns = await listStudioTurns(project.id);
      projectIdRef.current = project.id;
      dispatch({ type: "projectOpened", project, turns });
    } catch (error) {
      dispatch({ type: "requestFailed", error: describeError(error) });
    }
  }, []);

  const newProject = useCallback(async () => {
    try {
      const project = await createStudioProject();
      projectIdRef.current = project.id;
      dispatch({ type: "projectOpened", project, turns: [] });
    } catch (error) {
      dispatch({ type: "requestFailed", error: describeError(error) });
    }
  }, []);

  const sendMessage = useCallback(
    async (message: string) => {
      const trimmed = message.trim();
      // One turn at a time: suggestion pills and quick-picks stay live while
      // a turn streams, and a second turn would orphan the first one's poll.
      if (!trimmed || turnInFlightRef.current) return;
      turnInFlightRef.current = true;
      // The staged attachments ride this message (S-12); messageSent clears
      // the composer chips, so capture the ids first.
      const attachmentIds = pendingAttachmentIdsRef.current;
      dispatch({ type: "messageSent", message: trimmed });
      try {
        // Lazy creation: a projectless page births its project on the first
        // send — exactly once, user-initiated, so no mount-effect races.
        let projectId = projectIdRef.current;
        if (!projectId) {
          const project = await createStudioProject();
          projectIdRef.current = project.id;
          dispatch({ type: "projectCreated", project });
          projectId = project.id;
        }
        const { turnId } = await runStudioTurn(
          projectId,
          trimmed,
          {
            // Realtime thinking: deltas render as the LLM emits them.
            onThinkingStart: () => dispatch({ type: "thinkingStreamStarted" }),
            onThinkingDelta: (delta) =>
              dispatch({ type: "thinkingDelta", delta }),
          },
          attachmentIds,
        );
        const turn = await getStudioTurn(projectId, turnId);
        if (!isCurrentProject(projectId)) return;
        dispatch({ type: "turnAccepted", turn });
      } catch (error) {
        dispatch({ type: "requestFailed", error: describeError(error) });
      }
    },
    [isCurrentProject],
  );

  const renameProject = useCallback(async (title: string) => {
    const projectId = projectIdRef.current;
    if (!projectId || !title.trim()) return;
    try {
      const project = await updateStudioProject(projectId, {
        title: title.trim(),
      });
      dispatch({ type: "projectPatched", project });
    } catch (error) {
      dispatch({ type: "requestFailed", error: describeError(error) });
    }
  }, []);

  const pinModel = useCallback(async (slug: string | null) => {
    const projectId = projectIdRef.current;
    if (!projectId) return;
    try {
      const project = await updateStudioProject(projectId, {
        pinnedModel: slug,
      });
      dispatch({ type: "projectPatched", project });
    } catch (error) {
      dispatch({ type: "requestFailed", error: describeError(error) });
    }
  }, []);

  const selectImage = useCallback((imageId: string | null) => {
    // Local first for an instant ring; then persist — the LLM's edit
    // routing reads the stored selection (behavior 6, M4).
    dispatch({ type: "imageSelected", imageId });
    const projectId = projectIdRef.current;
    if (!projectId) return;
    void updateStudioProject(projectId, { selectedImageId: imageId }).catch(
      (error: unknown) =>
        dispatch({ type: "requestFailed", error: describeError(error) }),
    );
  }, []);

  /** S-12: upload a reference image and stage it on the composer. */
  const attachFile = useCallback(
    async (file: File) => {
      try {
        let projectId = projectIdRef.current;
        if (!projectId) {
          const project = await createStudioProject();
          projectIdRef.current = project.id;
          dispatch({ type: "projectCreated", project });
          projectId = project.id;
        }
        const attachment = await uploadStudioAttachment(projectId, file);
        if (!isCurrentProject(projectId)) return;
        dispatch({ type: "attachmentStaged", attachment });
      } catch (error) {
        dispatch({ type: "requestFailed", error: describeError(error) });
      }
    },
    [isCurrentProject],
  );

  const removeAttachment = useCallback((attachmentId: string) => {
    dispatch({ type: "attachmentUnstaged", attachmentId });
  }, []);

  const deleteProject = useCallback(async (projectId: string) => {
    try {
      await deleteStudioProject(projectId);
      if (projectIdRef.current === projectId) projectIdRef.current = null;
      dispatch({ type: "projectDeleted", projectId });
    } catch (error) {
      dispatch({ type: "requestFailed", error: describeError(error) });
    }
  }, []);

  return {
    state,
    dispatch,
    openProject,
    newProject,
    sendMessage,
    renameProject,
    pinModel,
    selectImage,
    deleteProject,
    attachFile,
    removeAttachment,
  };
}
