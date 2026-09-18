import { describe, expect, it, vi } from "vitest";
import { SessionService } from "@services/sessions/SessionService";
import type { SessionRecord } from "@services/sessions/types";

const makeSession = (
  overrides: Partial<SessionRecord> = {},
): SessionRecord => ({
  id: "session_existing",
  userId: "user-1",
  status: "active",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  prompt: {
    uuid: "prompt-1",
    input: "old input",
    output: "old output",
    mode: "video",
  },
  promptUuid: "prompt-1",
  hasContinuity: false,
  ...overrides,
});

describe("SessionService.createPromptSession", () => {
  it("updates an existing session when prompt UUID already exists", async () => {
    const existing = makeSession();
    const save = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn().mockResolvedValue(existing);
    // updateSession now runs through the store's transactional mutate path
    // (issue #113); the double models it as read → mutate → write so the
    // save assertion below still means "this update wrote".
    const store = {
      save,
      get,
      findByPromptUuid: vi.fn().mockResolvedValue(existing),
      mutate: vi.fn(
        async (
          sessionId: string,
          mutator: (current: SessionRecord) => SessionRecord,
        ) => {
          const current = (await get(sessionId)) as SessionRecord | null;
          if (!current) return null;
          const next = mutator(current);
          await save(next);
          return next;
        },
      ),
    } as unknown as ConstructorParameters<typeof SessionService>[0];

    const service = new SessionService(store);

    const result = await service.createPromptSession("user-1", {
      name: "Updated Name",
      prompt: {
        uuid: "prompt-1",
        input: "new input",
        output: "new output",
        mode: "video",
      },
    });

    expect(store.findByPromptUuid).toHaveBeenCalledWith("user-1", "prompt-1");
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(result.id).toBe("session_existing");
    expect(result.name).toBe("Updated Name");
    expect(result.prompt?.input).toBe("new input");
    expect(result.prompt?.output).toBe("new output");
    expect(result.promptUuid).toBe("prompt-1");
  });

  it("creates a new session when prompt UUID does not exist", async () => {
    const store = {
      save: vi.fn().mockResolvedValue(undefined),
      findByPromptUuid: vi.fn().mockResolvedValue(null),
      get: vi.fn(),
    } as unknown as ConstructorParameters<typeof SessionService>[0];

    const service = new SessionService(store);

    const result = await service.createPromptSession("user-1", {
      prompt: {
        uuid: "prompt-new",
        input: "input",
        output: "output",
        mode: "video",
      },
    });

    expect(store.findByPromptUuid).toHaveBeenCalledWith("user-1", "prompt-new");
    expect(store.get).not.toHaveBeenCalled();
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(result.id.startsWith("session_")).toBe(true);
    expect(result.promptUuid).toBe("prompt-new");
  });
});
