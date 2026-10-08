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
import { apiClient } from "@/services/ApiClient";
import { isRemoteSessionId } from "@/repositories/sessionIdNamespace";

interface WorkspaceSessionContextValue {
  session: SessionDto | null;
  loading: boolean;
  error: string | null;
  refreshSession: () => Promise<void>;
}

const WorkspaceSessionContext =
  createContext<WorkspaceSessionContextValue | null>(null);
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

export function useWorkspaceSession(): WorkspaceSessionContextValue {
  const context = useContext(WorkspaceSessionContext);
  if (!context) {
    throw new Error(
      "useWorkspaceSession must be used within WorkspaceSessionProvider",
    );
  }
  return context;
}

/** Loads the current authoring session without registering frozen continuity actions. */
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
  const routeSessionIdRef = useRef<string | undefined>(sessionId);
  const refreshRequestIdRef = useRef(0);
  routeSessionIdRef.current = sessionId;

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

  // Old-session data is never exposed under a new route while its fetch is pending.
  const currentSession = session?.id === sessionId ? session : null;
  const value = useMemo<WorkspaceSessionContextValue>(
    () => ({ session: currentSession, loading, error, refreshSession }),
    [currentSession, loading, error, refreshSession],
  );
  return (
    <WorkspaceSessionContext.Provider value={value}>
      {children}
    </WorkspaceSessionContext.Provider>
  );
}

export default WorkspaceSessionContext;
