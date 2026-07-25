/**
 * Studio page orchestration: bootstrap (projects + roster), project
 * open/create, sending turns, and the 1s poll while a turn is running
 * (plan: "Request flow (asynchronous turns)").
 */

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  createStudioProject,
  getStudioModels,
  getStudioProject,
  getStudioTurn,
  listStudioProjects,
  listStudioTurns,
  runStudioTurn,
  updateStudioProject,
} from "../api/studioApi";
import type {
  StudioModelSlug,
  StudioProject,
  StudioTurn,
} from "../api/schemas";
import {
  initialStudioState,
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
  pinModel: (slug: StudioModelSlug | null) => Promise<void>;
  selectImage: (imageId: string | null) => void;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

export function useStudioProject(): UseStudioProjectReturn {
  const [state, dispatch] = useReducer(studioReducer, initialStudioState);
  // Read by the poll interval without re-arming it.
  const projectIdRef = useRef<string | null>(null);
  projectIdRef.current = state.project?.id ?? null;

  // Bootstrap: roster + project list; open the most recent project or
  // start fresh with a new one so the page is always usable immediately.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [projects, models] = await Promise.all([
          listStudioProjects(),
          getStudioModels(),
        ]);
        if (cancelled) return;
        dispatch({ type: "bootstrapped", projects, models });
        const mostRecent = projects[0];
        if (mostRecent) {
          const turns = await listStudioTurns(mostRecent.id);
          if (cancelled) return;
          dispatch({ type: "projectOpened", project: mostRecent, turns });
        } else {
          const project = await createStudioProject();
          if (cancelled) return;
          dispatch({ type: "projectOpened", project, turns: [] });
        }
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
          dispatch({ type: "turnPolled", turn });
          // A settled turn can change the project doc server-side
          // (auto-title, behavior 8) — sync it so the header updates
          // without a reload.
          if (turn.status !== "running") {
            const project = await getStudioProject(projectId);
            if (projectIdRef.current === project.id) {
              dispatch({ type: "projectPatched", project });
            }
          }
        })
        .catch((error: unknown) =>
          dispatch({ type: "requestFailed", error: describeError(error) }),
        );
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [state.pendingTurnId]);

  const openProject = useCallback(async (project: StudioProject) => {
    try {
      const turns = await listStudioTurns(project.id);
      dispatch({ type: "projectOpened", project, turns });
    } catch (error) {
      dispatch({ type: "requestFailed", error: describeError(error) });
    }
  }, []);

  const newProject = useCallback(async () => {
    try {
      const project = await createStudioProject();
      dispatch({ type: "projectOpened", project, turns: [] });
    } catch (error) {
      dispatch({ type: "requestFailed", error: describeError(error) });
    }
  }, []);

  const sendMessage = useCallback(async (message: string) => {
    const projectId = projectIdRef.current;
    const trimmed = message.trim();
    if (!projectId || !trimmed) return;
    dispatch({ type: "messageSent", message: trimmed });
    try {
      const { turnId } = await runStudioTurn(projectId, trimmed);
      const turn = await getStudioTurn(projectId, turnId);
      dispatch({ type: "turnAccepted", turn });
    } catch (error) {
      dispatch({ type: "requestFailed", error: describeError(error) });
    }
  }, []);

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

  const pinModel = useCallback(async (slug: StudioModelSlug | null) => {
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
    dispatch({ type: "imageSelected", imageId });
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
  };
}
