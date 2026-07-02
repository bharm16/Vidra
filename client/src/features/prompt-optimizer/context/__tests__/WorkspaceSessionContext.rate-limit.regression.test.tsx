import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { SessionDto } from "@shared/types/session";
import {
  WorkspaceSessionProvider,
  useWorkspaceSession,
  __resetWorkspaceSessionFetchStateForTests,
} from "../WorkspaceSessionContext";

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock("@/services/ApiClient", () => ({
  apiClient: {
    get: mockApiGet,
  },
}));

vi.mock("@/features/continuity/api/continuityApi", () => ({
  continuityApi: {
    createSession: vi.fn(),
    createSceneProxy: vi.fn(),
    previewSceneProxy: vi.fn(),
    addShot: vi.fn(),
    updateShot: vi.fn(),
    updateShotStyleReference: vi.fn(),
    generateShot: vi.fn(),
  },
}));

const buildSession = (): SessionDto => ({
  id: "session-429",
  userId: "user-1",
  name: "Session",
  status: "active",
  createdAt: "2026-02-12T00:00:00.000Z",
  updatedAt: "2026-02-12T00:00:00.000Z",
  prompt: {
    input: "Input prompt",
    output: "Shot description",
  },
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <WorkspaceSessionProvider sessionId="session-429">
    {children}
  </WorkspaceSessionProvider>
);

describe("regression: workspace session loader backs off on 429", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetWorkspaceSessionFetchStateForTests();
  });

  it("does not immediately retry session fetches after a 429 response", async () => {
    const rateLimitedError = Object.assign(new Error("Too many requests"), {
      status: 429,
    });
    mockApiGet
      .mockRejectedValueOnce(rateLimitedError)
      .mockResolvedValueOnce({ data: buildSession() });

    const { result } = renderHook(() => useWorkspaceSession(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockApiGet).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refreshSession();
      await result.current.refreshSession();
    });

    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });
});
