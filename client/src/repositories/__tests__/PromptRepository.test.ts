import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/services/ApiClient", () => ({
  apiClient: mockApiClient,
}));

vi.mock("../../services/LoggingService", () => ({
  logger: {
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { PromptRepository } from "../PromptRepository";
import { PromptRepositoryError } from "../promptRepositoryTypes";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("PromptRepository", () => {
  let repository: PromptRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PromptRepository();
  });

  it("save posts session payload and returns id/uuid", async () => {
    mockApiClient.post.mockResolvedValue({
      data: {
        id: "session_1",
        prompt: { uuid },
      },
    });

    const result = await repository.save("user-1", {
      uuid,
      title: "My Prompt",
      input: "input",
      output: "output",
      score: 90,
      mode: "video",
    });

    expect(mockApiClient.post).toHaveBeenCalledWith("/sessions", {
      name: "My Prompt",
      prompt: expect.objectContaining({
        uuid,
        title: "My Prompt",
        input: "input",
        output: "output",
        score: 90,
        mode: "video",
      }),
    });
    expect(result).toEqual({ id: "session_1", uuid });
  });

  it("getUserPrompts maps session DTOs and filters missing prompt payloads", async () => {
    mockApiClient.get.mockResolvedValue({
      data: [
        {
          id: "session_1",
          updatedAt: "2025-01-01T00:00:00.000Z",
          prompt: {
            uuid,
            title: "T",
            input: "in",
            output: "out",
            score: 70,
            mode: "video",
            versions: [],
          },
        },
        {
          id: "session_2",
          updatedAt: "2025-01-01T00:00:01.000Z",
          prompt: null,
        },
      ],
    });

    const result = await repository.getUserPrompts("user-1", 25);

    expect(mockApiClient.get).toHaveBeenCalledWith(
      "/sessions?limit=25&includeContinuity=true&includePrompt=true",
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "session_1",
      uuid,
      title: "T",
      input: "in",
      output: "out",
      score: 70,
      mode: "video",
      versions: [],
    });
  });

  it("getUserPrompts keeps prompt entries that also have continuity payloads", async () => {
    mockApiClient.get.mockResolvedValue({
      data: [
        {
          id: "session_mixed",
          updatedAt: "2026-02-12T16:00:00.000Z",
          prompt: {
            uuid: "22222222-2222-4222-8222-222222222222",
            input: "mixed input",
            output: "mixed output",
            versions: [],
          },
          continuity: {
            shots: [{ id: "shot-1" }],
          },
        },
      ],
    });

    const result = await repository.getUserPrompts("user-1", 10);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "session_mixed",
      uuid: "22222222-2222-4222-8222-222222222222",
      input: "mixed input",
      output: "mixed output",
      versions: [],
    });
  });

  it("getUserPrompts includes continuity-only sessions so sequence history survives reloads", async () => {
    mockApiClient.get.mockResolvedValue({
      data: [
        {
          id: "session_prompt_1",
          updatedAt: "2026-02-12T16:00:00.000Z",
          prompt: {
            uuid: "33333333-3333-4333-8333-333333333333",
            input: "prompt input",
            output: "prompt output",
            versions: [],
          },
        },
        {
          id: "session_continuity_1",
          name: "Continuity Session",
          updatedAt: "2026-02-12T16:10:00.000Z",
          continuity: {
            shots: [{ id: "shot-1" }],
            settings: {
              generationMode: "continuity",
              defaultContinuityMode: "frame-bridge",
              defaultStyleStrength: 0.6,
              defaultModel: "model-1",
              autoExtractFrameBridge: false,
              useCharacterConsistency: false,
            },
          },
        },
      ],
    });

    const result = await repository.getUserPrompts("user-1", 10);

    expect(mockApiClient.get).toHaveBeenCalledWith(
      "/sessions?limit=10&includeContinuity=true&includePrompt=true",
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "session_prompt_1",
      uuid: "33333333-3333-4333-8333-333333333333",
      input: "prompt input",
      output: "prompt output",
    });
    expect(result[1]).toMatchObject({
      id: "session_continuity_1",
      uuid: "session_continuity_1",
      title: "Continuity Session",
      input: "",
      output: "",
      versions: [],
    });
  });

  it("getById routes uuid lookup through by-prompt endpoint", async () => {
    mockApiClient.get.mockResolvedValue({
      data: {
        id: "session_uuid",
        updatedAt: "2025-01-01T00:00:00.000Z",
        prompt: {
          uuid,
          input: "input",
          output: "output",
        },
      },
    });

    const result = await repository.getById(uuid);

    expect(mockApiClient.get).toHaveBeenCalledWith(
      `/sessions/by-prompt/${encodeURIComponent(uuid)}`,
    );
    expect(result).toMatchObject({
      id: "session_uuid",
      uuid,
      input: "input",
      output: "output",
    });
  });

  it("getById routes non-uuid lookup through sessions endpoint", async () => {
    mockApiClient.get.mockResolvedValue({
      data: {
        id: "session_abc",
        updatedAt: "2025-01-01T00:00:00.000Z",
        prompt: {
          uuid: "abc",
          input: "in",
          output: "out",
        },
      },
    });

    const result = await repository.getById("session_abc");

    expect(mockApiClient.get).toHaveBeenCalledWith("/sessions/session_abc");
    expect(result).toMatchObject({
      id: "session_abc",
      input: "in",
      output: "out",
    });
  });

  it("maps continuity-only sessions to a minimal prompt entry for route loading", async () => {
    mockApiClient.get.mockResolvedValue({
      data: {
        id: "continuity_1",
        name: "Continuity Session",
        updatedAt: "2026-02-12T00:00:00.000Z",
        continuity: {
          shots: [{ id: "shot-1" }],
          settings: {
            generationMode: "continuity",
            defaultContinuityMode: "frame-bridge",
            defaultStyleStrength: 0.6,
            defaultModel: "model-1",
            autoExtractFrameBridge: false,
            useCharacterConsistency: false,
          },
        },
      },
    });

    const result = await repository.getById("continuity_1");

    expect(result).toMatchObject({
      id: "continuity_1",
      uuid: "continuity_1",
      title: "Continuity Session",
      input: "",
      output: "",
      mode: "video",
      versions: [],
    });
  });

  it("resolves uuid to session id once and reuses cached resolution for later writes", async () => {
    mockApiClient.get.mockResolvedValue({ data: { id: "session_cached" } });
    mockApiClient.patch.mockResolvedValue(undefined);

    await repository.updatePrompt(uuid, { input: "first" });
    await repository.updateOutput(uuid, "second");

    expect(mockApiClient.get).toHaveBeenCalledTimes(1);
    expect(mockApiClient.patch).toHaveBeenNthCalledWith(
      1,
      "/sessions/session_cached/prompt",
      { input: "first" },
    );
    expect(mockApiClient.patch).toHaveBeenNthCalledWith(
      2,
      "/sessions/session_cached/output",
      { output: "second" },
    );
  });

  it("deduplicates in-flight session resolution for concurrent updates", async () => {
    let resolveLookup: ((value: unknown) => void) | undefined;
    mockApiClient.get.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLookup = resolve;
        }),
    );
    mockApiClient.patch.mockResolvedValue(undefined);

    const p1 = repository.updatePrompt(uuid, { title: "t1" });
    const p2 = repository.updateOutput(uuid, "out-2");

    expect(mockApiClient.get).toHaveBeenCalledTimes(1);

    resolveLookup?.({ data: { id: "session_inflight" } });
    await Promise.all([p1, p2]);

    expect(mockApiClient.patch).toHaveBeenCalledWith(
      "/sessions/session_inflight/prompt",
      {
        title: "t1",
      },
    );
    expect(mockApiClient.patch).toHaveBeenCalledWith(
      "/sessions/session_inflight/output",
      {
        output: "out-2",
      },
    );
  });

  it("throws PromptRepositoryError for invalid save responses", async () => {
    mockApiClient.post.mockResolvedValue({ data: null });

    await expect(
      repository.save("user-1", {
        input: "a",
        output: "b",
      }),
    ).rejects.toBeInstanceOf(PromptRepositoryError);
  });

  it("throws PromptRepositoryError when deleteById receives empty id", async () => {
    await expect(repository.deleteById("")).rejects.toBeInstanceOf(
      PromptRepositoryError,
    );
  });
});
