import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SessionDto } from "@shared/types/session";
import type {
  ContinuitySession,
  ContinuityShot,
  CreateShotInput,
  UpdateShotInput,
} from "@/features/continuity/types";
import { continuityApi } from "@/features/continuity/api/continuityApi";
import { apiClient } from "@/services/ApiClient";
import { logger } from "@/services/LoggingService";
import { isRemoteSessionId } from "@/repositories/sessionIdNamespace";

interface StartSequenceInput {
  sourceVideoId: string;
  sourceImageUrl?: string;
  prompt?: string;
  name?: string;
  originSessionId?: string;
}

interface StartSequenceResult {
  sessionId: string;
  shot: ContinuityShot;
}

interface CreateSceneProxyInput {
  sourceShotId?: string;
  sourceVideoId?: string;
}

type SceneProxyCameraInput = NonNullable<UpdateShotInput["camera"]>;

interface WorkspaceSessionContextValue {
  session: SessionDto | null;
  loading: boolean;
  error: string | null;
  isSequenceMode: boolean;
  hasActiveContinuityShot: boolean;
  shots: ContinuityShot[];
  editorShots: ContinuityShot[];
  currentShotId: string | null;
  currentShot: ContinuityShot | null;
  currentEditorShot: ContinuityShot | null;
  currentShotIndex: number;
  setCurrentShotId: (shotId: string | null) => void;
  refreshSession: () => Promise<void>;
  addShot: (input: CreateShotInput) => Promise<ContinuityShot>;
  updateShot: (
    shotId: string,
    updates: UpdateShotInput,
  ) => Promise<ContinuityShot>;
  updateShotStyleReference: (
    shotId: string,
    styleReferenceId: string | null,
  ) => Promise<ContinuityShot>;
  generateShot: (shotId: string) => Promise<ContinuityShot>;
  createSceneProxy: (input?: CreateSceneProxyInput) => Promise<void>;
  isCreatingSceneProxy: boolean;
  previewSceneProxy: (
    shotId: string,
    camera?: SceneProxyCameraInput,
  ) => Promise<ContinuityShot>;
  isPreviewingSceneProxy: boolean;
  startSequence: (input: StartSequenceInput) => Promise<StartSequenceResult>;
  isStartingSequence: boolean;
}

const WorkspaceSessionContext =
  createContext<WorkspaceSessionContextValue | null>(null);
const log = logger.child("WorkspaceSessionContext");
const VIRTUAL_SINGLE_SHOT_ID = "__single__";
const SESSION_FETCH_CACHE_TTL_MS = 5_000;
const SESSION_FETCH_RATE_LIMIT_COOLDOWN_MS = 15_000;

const sessionFetchCache = new Map<
  string,
  { data: SessionDto | null; expiresAt: number }
>();
const sessionFetchInFlight = new Map<string, Promise<SessionDto | null>>();
const sessionFetchRetryAt = new Map<string, number>();

const getErrorStatus = (error: unknown): number | null => {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
};

const isRetryableSessionError = (error: unknown): boolean => {
  const status = getErrorStatus(error);
  if (status === 429) return true;
  if (status !== null && status >= 500 && status <= 599) return true;
  return false;
};

const fetchSessionById = async (
  sessionId: string,
): Promise<SessionDto | null> => {
  const now = Date.now();
  const retryAt = sessionFetchRetryAt.get(sessionId);
  if (typeof retryAt === "number" && now < retryAt) {
    throw Object.assign(
      new Error("Session fetch is temporarily rate limited"),
      { status: 429 },
    );
  }

  const cached = sessionFetchCache.get(sessionId);
  if (cached && now < cached.expiresAt) {
    return cached.data;
  }

  const inflight = sessionFetchInFlight.get(sessionId);
  if (inflight) {
    return await inflight;
  }

  const task = (async (): Promise<SessionDto | null> => {
    try {
      const response = await apiClient.get(
        `/sessions/${encodeURIComponent(sessionId)}`,
      );
      const data = (response as { data?: SessionDto }).data ?? null;
      sessionFetchCache.set(sessionId, {
        data,
        expiresAt: Date.now() + SESSION_FETCH_CACHE_TTL_MS,
      });
      sessionFetchRetryAt.delete(sessionId);
      return data;
    } catch (error) {
      if (isRetryableSessionError(error)) {
        sessionFetchRetryAt.set(
          sessionId,
          Date.now() + SESSION_FETCH_RATE_LIMIT_COOLDOWN_MS,
        );
      }
      throw error;
    } finally {
      sessionFetchInFlight.delete(sessionId);
    }
  })();

  sessionFetchInFlight.set(sessionId, task);
  return await task;
};

export const __resetWorkspaceSessionFetchStateForTests = (): void => {
  sessionFetchCache.clear();
  sessionFetchInFlight.clear();
  sessionFetchRetryAt.clear();
};

const mapContinuityToSession = (
  continuity: ContinuitySession,
): NonNullable<SessionDto["continuity"]> => ({
  shots: continuity.shots,
  primaryStyleReference: continuity.primaryStyleReference ?? null,
  sceneProxy: continuity.sceneProxy ?? null,
  settings: continuity.defaultSettings,
});

const buildVirtualSingleShot = (session: SessionDto): ContinuityShot => ({
  id: VIRTUAL_SINGLE_SHOT_ID,
  sessionId: session.id,
  sequenceIndex: 0,
  userPrompt: session.prompt?.input ?? "",
  continuityMode: "none",
  styleStrength: 0.6,
  styleReferenceId: null,
  modelId:
    typeof session.prompt?.targetModel === "string"
      ? session.prompt.targetModel
      : "",
  status: "draft",
  createdAt:
    session.updatedAt ?? session.createdAt ?? "1970-01-01T00:00:00.000Z",
  ...(Array.isArray(session.prompt?.versions)
    ? { versions: session.prompt.versions }
    : {}),
});

export function useWorkspaceSession(): WorkspaceSessionContextValue {
  const context = useContext(WorkspaceSessionContext);
  if (!context) {
    throw new Error(
      "useWorkspaceSession must be used within WorkspaceSessionProvider",
    );
  }
  return context;
}

export function WorkspaceSessionProvider({
  sessionId,
  children,
}: {
  sessionId?: string;
  children: ReactNode;
}): React.ReactElement {
  const [session, setSession] = useState<SessionDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentShotId, setCurrentShotId] = useState<string | null>(null);
  const [isStartingSequence, setIsStartingSequence] = useState(false);
  const [isCreatingSceneProxy, setIsCreatingSceneProxy] = useState(false);
  const [isPreviewingSceneProxy, setIsPreviewingSceneProxy] = useState(false);
  const routeSessionIdRef = useRef<string | undefined>(sessionId);
  const refreshRequestIdRef = useRef(0);

  useEffect(() => {
    routeSessionIdRef.current = sessionId;
  }, [sessionId]);

  const refreshSession = useCallback(async () => {
    const requestedSessionId = sessionId;
    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;

    if (!requestedSessionId) {
      setSession(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (!isRemoteSessionId(requestedSessionId)) {
      setSession(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSessionById(requestedSessionId);
      if (
        refreshRequestIdRef.current !== requestId ||
        routeSessionIdRef.current !== requestedSessionId
      ) {
        return;
      }
      setSession(data);
    } catch (err) {
      if (
        refreshRequestIdRef.current !== requestId ||
        routeSessionIdRef.current !== requestedSessionId
      ) {
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (
        refreshRequestIdRef.current === requestId &&
        routeSessionIdRef.current === requestedSessionId
      ) {
        setLoading(false);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    setSession((prev) => {
      if (!sessionId) return null;
      return prev?.id === sessionId ? prev : null;
    });
    setError(null);
    setCurrentShotId(null);
  }, [sessionId]);

  const realShots = useMemo<ContinuityShot[]>(
    () => session?.continuity?.shots ?? [],
    [session?.continuity?.shots],
  );

  const orderedRealShots = useMemo(
    () => [...realShots].sort((a, b) => a.sequenceIndex - b.sequenceIndex),
    [realShots],
  );

  const editorShots = useMemo<ContinuityShot[]>(() => {
    if (!session) return [];
    if (orderedRealShots.length > 0) {
      return orderedRealShots;
    }
    return [buildVirtualSingleShot(session)];
  }, [orderedRealShots, session]);

  // Sequence mode is purely a UI condition: two or more real continuity shots.
  const isSequenceMode = orderedRealShots.length > 1;

  const currentEditorShot = useMemo(() => {
    if (!currentShotId) return null;
    return editorShots.find((shot) => shot.id === currentShotId) ?? null;
  }, [currentShotId, editorShots]);

  const currentRealShot = useMemo(() => {
    if (!currentShotId) return null;
    return orderedRealShots.find((shot) => shot.id === currentShotId) ?? null;
  }, [currentShotId, orderedRealShots]);

  const hasActiveContinuityShot = Boolean(currentRealShot);

  const currentShotIndex = useMemo(() => {
    if (!currentShotId) return -1;
    return editorShots.findIndex((shot) => shot.id === currentShotId);
  }, [currentShotId, editorShots]);

  useEffect(() => {
    if (editorShots.length === 0) {
      if (currentShotId !== null) {
        setCurrentShotId(null);
      }
      return;
    }
    if (
      currentShotId &&
      editorShots.some((shot) => shot.id === currentShotId)
    ) {
      return;
    }
    const firstShot = editorShots[0];
    setCurrentShotId(firstShot?.id ?? null);
  }, [currentShotId, editorShots]);

  const updateShotInState = useCallback((shot: ContinuityShot) => {
    setSession((prev) => {
      if (!prev?.continuity) return prev;
      const nextShots = prev.continuity.shots.map((existing) =>
        existing.id === shot.id ? shot : existing,
      );
      if (!nextShots.some((existing) => existing.id === shot.id)) {
        nextShots.push(shot);
      }
      return {
        ...prev,
        continuity: {
          ...prev.continuity,
          shots: nextShots,
        },
      };
    });
  }, []);

  const patchShotInState = useCallback(
    (shotId: string, updates: Partial<ContinuityShot>) => {
      setSession((prev) => {
        if (!prev?.continuity) return prev;
        const nextShots = prev.continuity.shots.map((existing) =>
          existing.id === shotId ? { ...existing, ...updates } : existing,
        );
        return {
          ...prev,
          continuity: {
            ...prev.continuity,
            shots: nextShots,
          },
        };
      });
    },
    [],
  );

  const addShot = useCallback(
    async (input: CreateShotInput): Promise<ContinuityShot> => {
      if (!sessionId) throw new Error("No active session");
      const shot = (await continuityApi.addShot(
        sessionId,
        input,
      )) as ContinuityShot;
      setSession((prev) => {
        if (!prev?.continuity) return prev;
        return {
          ...prev,
          continuity: {
            ...prev.continuity,
            shots: [...prev.continuity.shots, shot],
          },
        };
      });
      return shot;
    },
    [sessionId],
  );

  const updateShot = useCallback(
    async (
      shotId: string,
      updates: UpdateShotInput,
    ): Promise<ContinuityShot> => {
      if (!sessionId) throw new Error("No active session");
      const shot = (await continuityApi.updateShot(
        sessionId,
        shotId,
        updates,
      )) as ContinuityShot;
      updateShotInState(shot);
      return shot;
    },
    [sessionId, updateShotInState],
  );

  const updateShotStyleReference = useCallback(
    async (
      shotId: string,
      styleReferenceId: string | null,
    ): Promise<ContinuityShot> => {
      if (!sessionId) throw new Error("No active session");
      const shot = (await continuityApi.updateShotStyleReference(
        sessionId,
        shotId,
        styleReferenceId,
      )) as ContinuityShot;
      updateShotInState(shot);
      return shot;
    },
    [sessionId, updateShotInState],
  );

  const generateShot = useCallback(
    async (shotId: string): Promise<ContinuityShot> => {
      if (!sessionId) throw new Error("No active session");
      patchShotInState(shotId, {
        status: "generating-video",
        error: undefined,
      });
      try {
        const shot = (await continuityApi.generateShot(
          sessionId,
          shotId,
        )) as ContinuityShot;
        updateShotInState(shot);
        return shot;
      } catch (error) {
        patchShotInState(shotId, {
          status: "failed",
          error:
            error instanceof Error ? error.message : "Shot generation failed",
        });
        throw error;
      }
    },
    [sessionId, patchShotInState, updateShotInState],
  );

  const createSceneProxy = useCallback(
    async (input?: CreateSceneProxyInput): Promise<void> => {
      if (!sessionId) throw new Error("No active session");
      if (isCreatingSceneProxy) {
        throw new Error("Scene proxy creation in progress");
      }

      const normalizedSourceShotId = input?.sourceShotId?.trim() || null;
      const normalizedSourceVideoId = input?.sourceVideoId?.trim() || null;
      const fallbackShot = session?.continuity?.shots.find((shot) =>
        Boolean(shot.videoAssetId),
      );
      const resolvedSourceShotId =
        normalizedSourceShotId ?? fallbackShot?.id ?? null;
      const resolvedSourceVideoId =
        normalizedSourceVideoId ?? fallbackShot?.videoAssetId ?? null;

      if (!resolvedSourceShotId && !resolvedSourceVideoId) {
        throw new Error("Scene proxy requires a source shot or video");
      }

      setIsCreatingSceneProxy(true);
      try {
        const updatedSession = await continuityApi.createSceneProxy(sessionId, {
          ...(resolvedSourceShotId
            ? { sourceShotId: resolvedSourceShotId }
            : {}),
          ...(resolvedSourceVideoId
            ? { sourceVideoId: resolvedSourceVideoId }
            : {}),
        });
        const mapped = mapContinuityToSession(updatedSession);
        setSession((prev) => {
          if (!prev || prev.id !== sessionId) return prev;
          return {
            ...prev,
            continuity: mapped,
          };
        });
      } finally {
        setIsCreatingSceneProxy(false);
      }
    },
    [isCreatingSceneProxy, session?.continuity?.shots, sessionId],
  );

  const previewSceneProxy = useCallback(
    async (
      shotId: string,
      camera?: SceneProxyCameraInput,
    ): Promise<ContinuityShot> => {
      if (!sessionId) throw new Error("No active session");
      if (!shotId.trim()) throw new Error("Shot id is required");
      if (isPreviewingSceneProxy) {
        throw new Error("Scene proxy preview in progress");
      }

      setIsPreviewingSceneProxy(true);
      try {
        const shot = (await continuityApi.previewSceneProxy(sessionId, shotId, {
          ...(camera ? { camera } : {}),
        })) as ContinuityShot;
        updateShotInState(shot);
        return shot;
      } finally {
        setIsPreviewingSceneProxy(false);
      }
    },
    [isPreviewingSceneProxy, sessionId, updateShotInState],
  );

  const startSequence = useCallback(
    async ({
      sourceVideoId,
      sourceImageUrl,
      prompt,
      name,
      originSessionId,
    }: StartSequenceInput): Promise<StartSequenceResult> => {
      const routeSessionIdAtStart = sessionId ?? null;
      const isCurrentRouteSessionLoaded =
        Boolean(routeSessionIdAtStart) && session?.id === routeSessionIdAtStart;
      const activeSessionId =
        routeSessionIdAtStart ?? originSessionId ?? session?.id ?? null;
      if (!sourceVideoId) {
        log.error(
          "Cannot start sequence without a source video id",
          undefined,
          {
            routeSessionId: sessionId ?? null,
            originSessionId: originSessionId ?? null,
          },
        );
        throw new Error("Missing source video");
      }
      if (isStartingSequence) {
        log.warn("Sequence creation already in progress", {
          routeSessionId: sessionId ?? null,
          originSessionId: originSessionId ?? null,
          sourceVideoId,
        });
        throw new Error("Sequence creation in progress");
      }

      setIsStartingSequence(true);
      try {
        let targetSessionId = activeSessionId;
        let continuityPayload: NonNullable<SessionDto["continuity"]> | null =
          isCurrentRouteSessionLoaded ? (session?.continuity ?? null) : null;
        const canReuseCurrentContinuitySession =
          Boolean(activeSessionId) &&
          isCurrentRouteSessionLoaded &&
          Boolean(session?.continuity) &&
          !session?.prompt &&
          routeSessionIdAtStart === activeSessionId;

        if (!canReuseCurrentContinuitySession) {
          const resolvedName =
            name ??
            (isCurrentRouteSessionLoaded ? session?.name : undefined) ??
            "Continuity Session";
          const safeName = resolvedName.trim()
            ? resolvedName
            : "Continuity Session";
          const continuitySession = await continuityApi.createSession({
            name: safeName,
            sourceVideoId,
            ...(typeof sourceImageUrl === "string" && sourceImageUrl.trim()
              ? { sourceImageUrl: sourceImageUrl.trim() }
              : {}),
          });
          const createdContinuity = mapContinuityToSession(continuitySession);
          targetSessionId = continuitySession.id;
          continuityPayload = createdContinuity;
          if (
            targetSessionId === routeSessionIdAtStart &&
            routeSessionIdRef.current === routeSessionIdAtStart
          ) {
            setSession((prev) =>
              prev
                ? {
                    ...prev,
                    continuity: createdContinuity,
                  }
                : prev,
            );
          }
        }

        if (!targetSessionId) {
          throw new Error("Failed to create continuity session");
        }

        const hasReadySceneProxy =
          continuityPayload?.sceneProxy?.status === "ready";
        if (!hasReadySceneProxy) {
          try {
            const continuityWithSceneProxy =
              await continuityApi.createSceneProxy(targetSessionId, {
                sourceVideoId,
              });
            continuityPayload = mapContinuityToSession(
              continuityWithSceneProxy,
            );
            if (
              targetSessionId === routeSessionIdAtStart &&
              routeSessionIdRef.current === routeSessionIdAtStart
            ) {
              setSession((prev) =>
                prev
                  ? {
                      ...prev,
                      continuity: continuityPayload ?? prev.continuity,
                    }
                  : prev,
              );
            }
          } catch (sceneProxyError) {
            log.warn(
              "Scene proxy creation failed during sequence startup; continuing without scene proxy",
              {
                sourceVideoId,
                targetSessionId,
                routeSessionId: sessionId ?? null,
                originSessionId: originSessionId ?? null,
                error:
                  sceneProxyError instanceof Error
                    ? sceneProxyError.message
                    : String(sceneProxyError),
              },
            );
          }
        }

        const requestedPrompt = prompt?.trim();
        const sessionPrompt = isCurrentRouteSessionLoaded
          ? session?.prompt?.input?.trim()
          : null;
        const activeShotPrompt = isCurrentRouteSessionLoaded
          ? currentEditorShot?.userPrompt?.trim()
          : null;
        const shotPrompt =
          requestedPrompt ||
          sessionPrompt ||
          activeShotPrompt ||
          "Continue the scene";
        const shot = (await continuityApi.addShot(targetSessionId, {
          prompt: shotPrompt,
          sourceVideoId,
        })) as ContinuityShot;
        if (
          targetSessionId === routeSessionIdAtStart &&
          routeSessionIdRef.current === routeSessionIdAtStart
        ) {
          setSession((prev) => {
            if (!prev) return prev;
            const baseContinuity = prev.continuity ?? continuityPayload;
            if (!baseContinuity) return prev;
            return {
              ...prev,
              continuity: {
                ...baseContinuity,
                shots: [...(baseContinuity.shots ?? []), shot],
              },
            };
          });
          setCurrentShotId(shot.id);
        }
        log.info("Sequence started", {
          sourceVideoId,
          targetSessionId,
          routeSessionId: sessionId ?? null,
          originSessionId: originSessionId ?? null,
          shotId: shot.id,
        });
        return { sessionId: targetSessionId, shot };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        log.error("Failed to start sequence", err, {
          sourceVideoId,
          activeSessionId,
          routeSessionId: sessionId ?? null,
          originSessionId: originSessionId ?? null,
        });
        throw error;
      } finally {
        setIsStartingSequence(false);
      }
    },
    [currentEditorShot, isStartingSequence, session, sessionId],
  );

  const value = useMemo(
    () => ({
      session,
      loading,
      error,
      isSequenceMode,
      hasActiveContinuityShot,
      shots: editorShots,
      editorShots,
      currentShotId,
      currentShot: currentEditorShot,
      currentEditorShot,
      currentShotIndex,
      setCurrentShotId,
      refreshSession,
      addShot,
      updateShot,
      updateShotStyleReference,
      generateShot,
      createSceneProxy,
      isCreatingSceneProxy,
      previewSceneProxy,
      isPreviewingSceneProxy,
      startSequence,
      isStartingSequence,
    }),
    [
      session,
      loading,
      error,
      isSequenceMode,
      hasActiveContinuityShot,
      editorShots,
      currentShotId,
      currentEditorShot,
      currentShotIndex,
      setCurrentShotId,
      refreshSession,
      addShot,
      updateShot,
      updateShotStyleReference,
      generateShot,
      createSceneProxy,
      isCreatingSceneProxy,
      previewSceneProxy,
      isPreviewingSceneProxy,
      startSequence,
      isStartingSequence,
    ],
  );

  return (
    <WorkspaceSessionContext.Provider value={value}>
      {children}
    </WorkspaceSessionContext.Provider>
  );
}

export default WorkspaceSessionContext;
