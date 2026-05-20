import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBuildFirebaseAuthHeaders } = vi.hoisted(() => ({
  mockBuildFirebaseAuthHeaders: vi.fn(),
}));

vi.mock("@/services/http/firebaseAuth", () => ({
  buildFirebaseAuthHeaders: mockBuildFirebaseAuthHeaders,
}));

vi.mock("@/config/api.config", () => ({
  API_CONFIG: {
    baseURL: "https://api.example.test",
  },
}));

import { continuityApi } from "../continuityApi";

const baseShot = {
  id: "shot-1",
  sessionId: "session-1",
  sequenceIndex: 0,
  userPrompt: "A wide establishing shot",
  continuityMode: "style-match",
  styleStrength: 0.8,
  styleReferenceId: null,
  modelId: "sora-2",
  status: "draft",
  createdAt: "2025-01-01T00:00:00.000Z",
};

const baseSessionDto = {
  id: "session-1",
  userId: "user-1",
  name: "My Session",
  description: "Continuity sequence",
  status: "active",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:01.000Z",
  continuity: {
    shots: [baseShot],
    primaryStyleReference: null,
    sceneProxy: null,
    settings: {
      generationMode: "continuity",
      defaultContinuityMode: "style-match",
      defaultStyleStrength: 0.7,
      defaultModel: "sora-2",
      autoExtractFrameBridge: true,
      useCharacterConsistency: true,
    },
  },
};

describe("continuityApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildFirebaseAuthHeaders.mockResolvedValue({
      Authorization: "Bearer firebase-token",
    });
  });

  it("createSession builds request and maps session payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: baseSessionDto,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await continuityApi.createSession({
      name: "Storyboard 1",
      description: "Test sequence",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/sessions/continuity",
      expect.objectContaining({ method: "POST" }),
    );

    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(options.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer firebase-token");
    expect(options.body).toBe(
      JSON.stringify({
        name: "Storyboard 1",
        description: "Test sequence",
      }),
    );

    expect(result).toMatchObject({
      id: "session-1",
      userId: "user-1",
      name: "My Session",
      status: "active",
      shots: [expect.objectContaining({ id: "shot-1" })],
      defaultSettings: expect.objectContaining({
        defaultModel: "sora-2",
      }),
    });
  });

  it("listSessions maps each dto and falls back name when missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [
            baseSessionDto,
            {
              ...baseSessionDto,
              id: "session-2",
              name: undefined,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await continuityApi.listSessions();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/sessions?includeContinuity=true&includePrompt=false",
      expect.any(Object),
    );
    expect(result).toHaveLength(2);
    expect(result[1]?.name).toBe("Continuity Session");
  });

  it("throws API message when server responds with non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Session creation denied" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      continuityApi.createSession({
        name: "Denied",
      }),
    ).rejects.toThrow("Session creation denied");
  });

  it("throws when API response does not match expected schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: { id: "broken" } }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    await expect(continuityApi.getSession("session-1")).rejects.toThrow(
      "Invalid continuity API response",
    );
  });

  it("rejects malformed nested continuity data instead of passing it through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              ...baseSessionDto,
              continuity: {
                ...baseSessionDto.continuity,
                sceneProxy: {
                  id: "proxy-1",
                  status: "ready",
                },
              },
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    await expect(continuityApi.getSession("session-1")).rejects.toThrow(
      "Invalid continuity API response",
    );
  });

  it("throws when session payload omits continuity object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: "session-1",
              userId: "user-1",
              status: "active",
              createdAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    await expect(continuityApi.getSession("session-1")).rejects.toThrow(
      "Session does not include continuity data",
    );
  });
});
