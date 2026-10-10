import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { SessionDto } from "@shared/types/session";
import {
  WorkspaceSessionProvider,
  useWorkspaceSession,
  __resetWorkspaceSessionFetchStateForTests,
} from "../WorkspaceSessionContext";

const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock("@/services/ApiClient", () => ({ apiClient: { get: mockApiGet } }));
const buildSession = (overrides: Partial<SessionDto> = {}): SessionDto => ({
  id: "session-1",
  userId: "user-1",
  name: "Session",
  status: "active",
  createdAt: "2026-02-12T00:00:00.000Z",
  updatedAt: "2026-02-12T00:00:00.000Z",
  prompt: { input: "Keep this prompt", output: "Generated output" },
  ...overrides,
});
const wrapper = ({ children }: { children: ReactNode }) => (
  <WorkspaceSessionProvider sessionId="session-1">
    {children}
  </WorkspaceSessionProvider>
);

describe("WorkspaceSessionContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetWorkspaceSessionFetchStateForTests();
    mockApiGet.mockResolvedValue({ data: buildSession() });
  });
  it("loads the current authoring session without creating a virtual continuity shot", async () => {
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper });
    await waitFor(() => expect(result.current.session?.id).toBe("session-1"));
    expect(result.current.session?.prompt?.input).toBe("Keep this prompt");
    expect(mockApiGet).toHaveBeenCalledWith("/sessions/session-1");
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
  it("skips remote fetches for local drafts", async () => {
    const { result } = renderHook(() => useWorkspaceSession(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <WorkspaceSessionProvider sessionId="draft-123">
          {children}
        </WorkspaceSessionProvider>
      ),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockApiGet).not.toHaveBeenCalled();
    expect(result.current.session).toBeNull();
  });

  it("reports session read failures", async () => {
    mockApiGet.mockRejectedValue(new Error("Session unavailable"));
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper });
    await waitFor(() =>
      expect(result.current.error).toBe("Session unavailable"),
    );
    expect(result.current.loading).toBe(false);
    expect(result.current.session).toBeNull();
  });
  it("ignores stale session responses when route session id changes", async () => {
    let resolveSession1: ((value: unknown) => void) | null = null;
    let resolveSession2: ((value: unknown) => void) | null = null;
    mockApiGet.mockImplementation((url: string) => {
      if (url === "/sessions/session-1") {
        return new Promise((resolve) => {
          resolveSession1 = resolve;
        });
      }
      if (url === "/sessions/session-2") {
        return new Promise((resolve) => {
          resolveSession2 = resolve;
        });
      }
      return Promise.resolve({ data: null });
    });

    let activeSessionId = "session-1";
    const dynamicWrapper = ({ children }: { children: ReactNode }) => (
      <WorkspaceSessionProvider sessionId={activeSessionId}>
        {children}
      </WorkspaceSessionProvider>
    );

    const { result, rerender } = renderHook(() => useWorkspaceSession(), {
      wrapper: dynamicWrapper,
    });

    activeSessionId = "session-2";
    rerender();

    await act(async () => {
      resolveSession2?.({
        data: buildSession({
          id: "session-2",
          name: "Second Session",
        }),
      });
    });

    await waitFor(() => {
      expect(result.current.session?.id).toBe("session-2");
    });

    await act(async () => {
      resolveSession1?.({
        data: buildSession({
          id: "session-1",
          name: "First Session",
          prompt: undefined,
          continuity: {
            shots: [],
            primaryStyleReference: null,
            sceneProxy: null,
            settings: {
              generationMode: "continuity",
              defaultContinuityMode: "frame-bridge",
              defaultStyleStrength: 0.6,
              defaultModel: "model-1",
              autoExtractFrameBridge: false,
              useCharacterConsistency: false,
            },
          },
        }),
      });
    });

    await waitFor(() => {
      expect(result.current.session?.id).toBe("session-2");
    });
  });
});
