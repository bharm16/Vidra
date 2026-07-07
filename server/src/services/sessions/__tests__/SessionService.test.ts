import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionRecord } from "../types";
import type {
  ContinuitySession,
  ContinuityShot,
} from "@server/domain/continuity/types";
import {
  GenerationNotFoundError,
  GenerationNotRemovableError,
  SessionAccessDeniedError,
  SessionNotFoundError,
  SessionService,
} from "../SessionService";

const buildRecord = (
  overrides: Partial<SessionRecord> = {},
): SessionRecord => ({
  id: "session-1",
  userId: "user-1",
  status: "active",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

const buildShot = (
  overrides: Partial<ContinuityShot> = {},
): ContinuityShot => ({
  id: "shot-1",
  sessionId: "session-1",
  sequenceIndex: 0,
  userPrompt: "Prompt",
  continuityMode: "frame-bridge",
  styleStrength: 0.6,
  styleReferenceId: null,
  modelId: "model-a" as ContinuityShot["modelId"],
  status: "completed",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  generatedAt: new Date("2026-01-01T00:00:10.000Z"),
  frameBridge: {
    id: "bridge-1",
    sourceVideoId: "video-1",
    sourceShotId: "shot-0",
    frameUrl: "https://example.com/bridge.png",
    framePosition: "last",
    frameTimestamp: 6,
    resolution: { width: 1280, height: 720 },
    aspectRatio: "16:9",
    extractedAt: new Date("2026-01-01T00:00:05.000Z"),
  },
  ...overrides,
});

const buildContinuity = (
  overrides: Partial<ContinuitySession> = {},
): ContinuitySession => ({
  id: "session-1",
  userId: "user-1",
  name: "Continuity",
  primaryStyleReference: {
    id: "style-1",
    sourceVideoId: "video-1",
    sourceFrameIndex: 0,
    frameUrl: "https://example.com/style.png",
    frameTimestamp: 0,
    resolution: { width: 1920, height: 1080 },
    aspectRatio: "16:9",
    extractedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  shots: [buildShot()],
  defaultSettings: {
    generationMode: "continuity",
    defaultContinuityMode: "frame-bridge",
    defaultStyleStrength: 0.6,
    defaultModel:
      "model-a" as ContinuitySession["defaultSettings"]["defaultModel"],
    autoExtractFrameBridge: false,
    useCharacterConsistency: false,
  },
  status: "active",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

describe("SessionService", () => {
  const sessionStore = {
    save: vi.fn(),
    get: vi.fn(),
    findByPromptUuid: vi.fn(),
    findByUser: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStore.findByPromptUuid.mockResolvedValue(null);
    sessionStore.get.mockResolvedValue(null);
    sessionStore.findByUser.mockResolvedValue([]);
  });

  it("creates prompt sessions and assigns prompt UUID when missing", async () => {
    const service = new SessionService(sessionStore as never);

    const created = await service.createPromptSession("user-1", {
      name: "Prompt Session",
      prompt: {
        input: "raw prompt",
        output: "optimized prompt",
      },
    });

    expect(created.id).toContain("session_");
    expect(created.prompt?.uuid).toEqual(expect.any(String));
    expect(created.promptUuid).toBe(created.prompt?.uuid);
    expect(sessionStore.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", name: "Prompt Session" }),
    );
  });

  it("updates existing session when create is called with a known prompt UUID", async () => {
    const existing = buildRecord({
      id: "existing-1",
      name: "Existing",
      prompt: {
        uuid: "prompt-uuid-1",
        input: "old in",
        output: "old out",
      },
      promptUuid: "prompt-uuid-1",
    });
    sessionStore.findByPromptUuid.mockResolvedValue(existing);
    sessionStore.get.mockResolvedValue(existing);

    const service = new SessionService(sessionStore as never);
    const result = await service.createPromptSession("user-1", {
      name: "Updated Name",
      prompt: {
        uuid: "prompt-uuid-1",
        input: "new in",
        output: "new out",
      },
    });

    expect(result.id).toBe("existing-1");
    expect(sessionStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "existing-1",
        name: "Updated Name",
        prompt: expect.objectContaining({ input: "new in", output: "new out" }),
      }),
    );
  });

  it("updates status lifecycle fields", async () => {
    const current = buildRecord({ id: "session-1", status: "active" });
    sessionStore.get.mockResolvedValue(current);

    const service = new SessionService(sessionStore as never);
    const updated = await service.updateSession("session-1", {
      status: "completed",
      name: "Done Session",
    });

    expect(updated.status).toBe("completed");
    expect(updated.name).toBe("Done Session");
    expect(sessionStore.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "session-1", status: "completed" }),
    );
  });

  it("blocks user-scoped updates when session is owned by a different user", async () => {
    const current = buildRecord({
      id: "session-1",
      userId: "owner-user",
      status: "active",
    });
    sessionStore.get.mockResolvedValue(current);

    const service = new SessionService(sessionStore as never);
    await expect(
      service.updateSessionForUser("request-user", "session-1", {
        name: "Should not update",
      }),
    ).rejects.toBeInstanceOf(SessionAccessDeniedError);

    expect(sessionStore.save).not.toHaveBeenCalled();
  });

  it("throws a not-found error for user-scoped delete when session is missing", async () => {
    sessionStore.get.mockResolvedValue(null);

    const service = new SessionService(sessionStore as never);
    await expect(
      service.deleteSessionForUser("user-1", "missing-session"),
    ).rejects.toBeInstanceOf(SessionNotFoundError);

    expect(sessionStore.delete).not.toHaveBeenCalled();
  });

  it("filters session listing by includeContinuity/includePrompt flags", async () => {
    const promptOnly = buildRecord({
      id: "prompt-only",
      prompt: { input: "in", output: "out" },
    });
    const continuityOnly = buildRecord({
      id: "continuity-only",
      continuity: buildContinuity(),
    });
    const both = buildRecord({
      id: "both",
      prompt: { input: "in", output: "out" },
      continuity: buildContinuity({ id: "both" }),
    });
    sessionStore.findByUser.mockResolvedValue([
      promptOnly,
      continuityOnly,
      both,
    ]);

    const service = new SessionService(sessionStore as never);

    const noContinuity = await service.listSessions("user-1", {
      includePrompt: true,
      includeContinuity: false,
    });
    const noPrompt = await service.listSessions("user-1", {
      includePrompt: false,
      includeContinuity: true,
    });

    expect(noContinuity.map((s) => s.id)).toEqual(["prompt-only", "both"]);
    expect(noPrompt.map((s) => s.id)).toEqual(["continuity-only", "both"]);
  });

  it("updates highlights and appends version entries", async () => {
    const current = buildRecord({
      id: "session-1",
      prompt: {
        input: "input",
        output: "output",
      },
    });
    sessionStore.get.mockResolvedValue(current);

    const service = new SessionService(sessionStore as never);
    const updated = await service.updateHighlights("session-1", {
      highlightCache: { spans: [{ start: 0, end: 4 }] },
      versionEntry: { timestamp: "2026-02-11T00:00:00.000Z" },
    });

    expect(updated.prompt?.highlightCache).toEqual({
      spans: [{ start: 0, end: 4 }],
    });
    expect(updated.prompt?.versions).toHaveLength(1);
    expect(updated.prompt?.versions?.[0]?.timestamp).toBe(
      "2026-02-11T00:00:00.000Z",
    );
  });

  it("preserves immutable media fields when versions are updated", async () => {
    const current = buildRecord({
      id: "session-1",
      prompt: {
        input: "input",
        output: "output",
        versions: [
          {
            versionId: "v1",
            signature: "sig",
            prompt: "prompt",
            timestamp: "2026-02-11T00:00:00.000Z",
            preview: {
              generatedAt: "2026-02-11T00:00:00.000Z",
              imageUrl: "https://example.com/old.png",
              storagePath: "users/user-1/previews/images/original.webp",
              assetId: "asset-old",
            },
          },
        ],
      },
    });
    sessionStore.get.mockResolvedValue(current);

    const service = new SessionService(sessionStore as never);
    const updated = await service.updateVersions("session-1", {
      versions: [
        {
          versionId: "v1",
          signature: "sig",
          prompt: "prompt",
          timestamp: "2026-02-11T00:01:00.000Z",
          preview: {
            generatedAt: "2026-02-11T00:01:00.000Z",
            imageUrl: "https://example.com/new.png",
            storagePath: "users/user-1/previews/images/overwritten.webp",
            assetId: "asset-new",
          },
        },
      ],
    });

    expect(updated.prompt?.versions?.[0]?.preview?.storagePath).toBe(
      "users/user-1/previews/images/original.webp",
    );
    expect(updated.prompt?.versions?.[0]?.preview?.assetId).toBe("asset-old");
  });

  it("maps continuity sessions to DTO with ISO date fields", () => {
    const service = new SessionService(sessionStore as never);
    const dto = service.toDto(
      buildRecord({
        continuity: buildContinuity(),
      }),
    );

    expect(dto.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(dto.continuity?.primaryStyleReference?.extractedAt).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    expect(dto.continuity?.shots[0]?.createdAt).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    expect(dto.continuity?.shots[0]?.frameBridge?.extractedAt).toBe(
      "2026-01-01T00:00:05.000Z",
    );
  });

  describe("video job cascade on delete", () => {
    it("invokes cancelJobsForSession before deleting the session record", async () => {
      sessionStore.get.mockResolvedValue(buildRecord());
      const cancelJobsForSession = vi.fn().mockResolvedValue(2);
      const cascade = { cancelJobsForSession };
      const service = new SessionService(sessionStore as never, cascade);

      await service.deleteSessionForUser("user-1", "session-1");

      expect(cancelJobsForSession).toHaveBeenCalledWith("session-1");
      expect(sessionStore.delete).toHaveBeenCalledWith("session-1");
    });

    it("proceeds with session delete even when cascade throws (non-fatal)", async () => {
      sessionStore.get.mockResolvedValue(buildRecord());
      const cancelJobsForSession = vi
        .fn()
        .mockRejectedValue(new Error("firestore unavailable"));
      const cascade = { cancelJobsForSession };
      const service = new SessionService(sessionStore as never, cascade);

      await expect(
        service.deleteSessionForUser("user-1", "session-1"),
      ).resolves.toBeUndefined();
      expect(sessionStore.delete).toHaveBeenCalledWith("session-1");
    });

    it("is a no-op when no cascade dependency is injected (backward-compat)", async () => {
      sessionStore.get.mockResolvedValue(buildRecord());
      const service = new SessionService(sessionStore as never);

      await service.deleteSessionForUser("user-1", "session-1");

      expect(sessionStore.delete).toHaveBeenCalledWith("session-1");
    });
  });

  describe("appendGenerationToVersion (ISSUE-12: server-authoritative persistence)", () => {
    const gen = (
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
      id: "gen-1",
      tier: "draft",
      model: "flux-kontext",
      prompt: "astronaut on mars",
      status: "completed",
      mediaUrls: ["https://example.com/frame-1.png"],
      ...overrides,
    });

    it("appends a generation to an existing version's generations array", async () => {
      const existing = buildRecord({
        prompt: {
          input: "raw prompt",
          output: "optimized prompt",
          versions: [
            {
              versionId: "v-1",
              signature: "sig",
              prompt: "optimized prompt",
              timestamp: "2026-04-22T00:00:00.000Z",
              generations: [],
            },
          ],
        },
      });
      sessionStore.get.mockResolvedValue(existing);

      const service = new SessionService(sessionStore as never);
      await service.appendGenerationToVersion(
        "user-1",
        "session-1",
        "v-1",
        gen(),
      );

      expect(sessionStore.save).toHaveBeenCalledTimes(1);
      const saved = sessionStore.save.mock.calls[0]![0] as SessionRecord;
      expect(saved.prompt?.versions).toHaveLength(1);
      expect(saved.prompt?.versions?.[0]?.generations).toHaveLength(1);
      expect(saved.prompt?.versions?.[0]?.generations?.[0]).toMatchObject({
        id: "gen-1",
        status: "completed",
      });
    });

    it("preserves existing generations when appending (no clobbering prior media)", async () => {
      const priorGen = gen({ id: "gen-0", mediaUrls: ["https://prior.png"] });
      const existing = buildRecord({
        prompt: {
          input: "raw",
          output: "optimized",
          versions: [
            {
              versionId: "v-1",
              signature: "sig",
              prompt: "optimized",
              timestamp: "2026-04-22T00:00:00.000Z",
              generations: [priorGen],
            },
          ],
        },
      });
      sessionStore.get.mockResolvedValue(existing);

      const service = new SessionService(sessionStore as never);
      await service.appendGenerationToVersion(
        "user-1",
        "session-1",
        "v-1",
        gen({ id: "gen-new" }),
      );

      const saved = sessionStore.save.mock.calls[0]![0] as SessionRecord;
      const generations = saved.prompt?.versions?.[0]?.generations ?? [];
      expect(generations).toHaveLength(2);
      expect((generations[0] as { id: string }).id).toBe("gen-0");
      expect((generations[1] as { id: string }).id).toBe("gen-new");
    });

    it("creates the target version in place when it does not yet exist (draft transition)", async () => {
      const existing = buildRecord({
        prompt: {
          input: "raw",
          output: "optimized",
          versions: [],
        },
      });
      sessionStore.get.mockResolvedValue(existing);

      const service = new SessionService(sessionStore as never);
      await service.appendGenerationToVersion(
        "user-1",
        "session-1",
        "v-new",
        gen(),
      );

      const saved = sessionStore.save.mock.calls[0]![0] as SessionRecord;
      expect(saved.prompt?.versions).toHaveLength(1);
      expect(saved.prompt?.versions?.[0]?.versionId).toBe("v-new");
      expect(saved.prompt?.versions?.[0]?.generations).toHaveLength(1);
    });

    it("blocks the append when session is owned by a different user", async () => {
      const existing = buildRecord({
        userId: "other-user",
        prompt: { input: "", output: "", versions: [] },
      });
      sessionStore.get.mockResolvedValue(existing);

      const service = new SessionService(sessionStore as never);
      await expect(
        service.appendGenerationToVersion("user-1", "session-1", "v-1", gen()),
      ).rejects.toBeInstanceOf(SessionAccessDeniedError);
      expect(sessionStore.save).not.toHaveBeenCalled();
    });

    it("rejects with SessionNotFoundError when session does not exist", async () => {
      sessionStore.get.mockResolvedValue(null);

      const service = new SessionService(sessionStore as never);
      await expect(
        service.appendGenerationToVersion(
          "user-1",
          "missing-session",
          "v-1",
          gen(),
        ),
      ).rejects.toBeInstanceOf(SessionNotFoundError);
      expect(sessionStore.save).not.toHaveBeenCalled();
    });

    it("is idempotent by generation id — a retry for the same job upserts rather than duplicates", async () => {
      const existing = buildRecord({
        prompt: {
          input: "raw",
          output: "optimized",
          versions: [
            {
              versionId: "v-1",
              signature: "sig",
              prompt: "optimized",
              timestamp: "2026-04-22T00:00:00.000Z",
              generations: [gen({ id: "job-7", status: "completed" })],
            },
          ],
        },
      });
      sessionStore.get.mockResolvedValue(existing);

      const service = new SessionService(sessionStore as never);
      await service.appendGenerationToVersion(
        "user-1",
        "session-1",
        "v-1",
        gen({ id: "job-7", mediaUrls: ["https://new.png"] }),
      );

      const saved = sessionStore.save.mock.calls[0]![0] as SessionRecord;
      const generations = saved.prompt?.versions?.[0]?.generations ?? [];
      expect(generations).toHaveLength(1);
      expect((generations[0] as { id: string }).id).toBe("job-7");
      expect((generations[0] as { mediaUrls: string[] }).mediaUrls).toEqual([
        "https://new.png",
      ]);
    });
  });

  describe("archiveGeneration (M5 leaf-only removal, ADR-0012)", () => {
    const recordWith = (
      generations: Array<Record<string, unknown>>,
    ): SessionRecord =>
      buildRecord({
        prompt: {
          input: "in",
          output: "out",
          versions: [
            {
              versionId: "v-1",
              signature: "sig",
              prompt: "p",
              timestamp: "2026-07-07T00:00:00.000Z",
              generations,
            },
          ],
        },
      });

    it("archives a leaf generation that no record names as ancestor", async () => {
      sessionStore.get.mockResolvedValue(
        recordWith([
          { id: "pic-1", mediaType: "image", ancestorGenerationId: null },
        ]),
      );
      const service = new SessionService(sessionStore as never);

      await service.archiveGeneration("user-1", "session-1", "pic-1");

      const saved = sessionStore.save.mock.calls[0]![0] as SessionRecord;
      expect(saved.prompt?.versions?.[0]?.generations?.[0]).toMatchObject({
        id: "pic-1",
        archived: true,
      });
    });

    it("refuses to archive a generation another record names as ancestor", async () => {
      sessionStore.get.mockResolvedValue(
        recordWith([
          { id: "pic-1", mediaType: "image", ancestorGenerationId: null },
          { id: "clip-1", mediaType: "video", ancestorGenerationId: "pic-1" },
        ]),
      );
      const service = new SessionService(sessionStore as never);

      await expect(
        service.archiveGeneration("user-1", "session-1", "pic-1"),
      ).rejects.toBeInstanceOf(GenerationNotRemovableError);
      expect(sessionStore.save).not.toHaveBeenCalled();
    });

    it("archives the childless clip but not its still-parenting picture", async () => {
      sessionStore.get.mockResolvedValue(
        recordWith([
          { id: "pic-1", mediaType: "image", ancestorGenerationId: null },
          { id: "clip-1", mediaType: "video", ancestorGenerationId: "pic-1" },
        ]),
      );
      const service = new SessionService(sessionStore as never);

      await service.archiveGeneration("user-1", "session-1", "clip-1");

      const saved = sessionStore.save.mock.calls[0]![0] as SessionRecord;
      const gens = saved.prompt?.versions?.[0]?.generations ?? [];
      expect(gens.find((g) => g.id === "clip-1")).toMatchObject({
        archived: true,
      });
      expect(gens.find((g) => g.id === "pic-1")?.archived).toBeUndefined();
    });

    it("throws when the generation id is absent from the session", async () => {
      sessionStore.get.mockResolvedValue(recordWith([]));
      const service = new SessionService(sessionStore as never);

      await expect(
        service.archiveGeneration("user-1", "session-1", "missing"),
      ).rejects.toBeInstanceOf(GenerationNotFoundError);
      expect(sessionStore.save).not.toHaveBeenCalled();
    });

    it("ignores an already-archived record when deciding leaf status", async () => {
      // An archived clip is gone from the space, so its former parent is now a
      // leaf and may be removed.
      sessionStore.get.mockResolvedValue(
        recordWith([
          { id: "pic-1", mediaType: "image", ancestorGenerationId: null },
          {
            id: "clip-1",
            mediaType: "video",
            ancestorGenerationId: "pic-1",
            archived: true,
          },
        ]),
      );
      const service = new SessionService(sessionStore as never);

      await service.archiveGeneration("user-1", "session-1", "pic-1");

      const saved = sessionStore.save.mock.calls[0]![0] as SessionRecord;
      expect(saved.prompt?.versions?.[0]?.generations?.[0]).toMatchObject({
        id: "pic-1",
        archived: true,
      });
    });
  });
});
