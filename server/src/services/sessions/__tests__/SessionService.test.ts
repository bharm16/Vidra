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
  TakeFactsConflictError,
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
    /**
     * The store's transactional read-modify-write. The double models its
     * contract — the mutator runs against the current document and its result
     * is the write — so assertions on `save` below keep meaning "this verb
     * wrote". What the real transaction adds is serialisation under
     * contention, which the concurrency suite models with its own store.
     */
    mutate: vi.fn(
      async (
        sessionId: string,
        mutator: (current: SessionRecord) => SessionRecord,
      ): Promise<SessionRecord | null> => {
        const current = (await sessionStore.get(
          sessionId,
        )) as SessionRecord | null;
        if (!current) return null;
        const next = mutator(current);
        await sessionStore.save(next);
        return next;
      },
    ),
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
    const updated = await service.updateSessionForUser("user-1", "session-1", {
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
    const updated = await service.updateHighlightsForUser(
      "user-1",
      "session-1",
      {
        highlightCache: { spans: [{ start: 0, end: 4 }] },
        versionEntry: { timestamp: "2026-02-11T00:00:00.000Z" },
      },
    );

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
    const updated = await service.updateVersionsForUser("user-1", "session-1", {
      versions: [
        {
          versionId: "v1",
          signature: "sig",
          prompt: "prompt",
          timestamp: "2026-02-11T00:01:00.000Z",
          firstFrame: {
            generatedAt: "2026-02-11T00:01:00.000Z",
            imageUrl: "https://example.com/new.png",
            storagePath: "users/user-1/previews/images/overwritten.webp",
            assetId: "asset-new",
          },
        },
      ],
    });

    expect(updated.prompt?.versions?.[0]?.firstFrame?.storagePath).toBe(
      "users/user-1/previews/images/original.webp",
    );
    expect(updated.prompt?.versions?.[0]?.firstFrame?.assetId).toBe(
      "asset-old",
    );
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

  describe("concurrent writers keep every take (ADR-0022 decision 6)", () => {
    /**
     * A store double that models the two things the real store does and
     * nothing else: `save` replaces the document wholesale (Firestore merges
     * at the top level, so an incoming `prompt` replaces the stored one,
     * `versions` array and all), and `mutate` runs its read-modify-write
     * atomically against the current document.
     *
     * Read-then-save was never safe here, and the transaction around it did
     * not help: the payload was built from a snapshot taken BEFORE the
     * transaction opened, so the transaction only chose create-vs-merge. With
     * `save` as the only writer, the two appends below interleave their reads
     * and the later write erases the earlier take. Serialising the whole
     * read-modify-write is the fix, and it is what this double exercises.
     */
    const createConcurrentStore = (initial: SessionRecord) => {
      let doc: SessionRecord = structuredClone(initial);
      let tail: Promise<unknown> = Promise.resolve();

      return {
        get: vi.fn(
          async (sessionId: string): Promise<SessionRecord | null> =>
            doc.id === sessionId ? structuredClone(doc) : null,
        ),
        save: vi.fn(async (record: SessionRecord): Promise<void> => {
          doc = structuredClone(record);
        }),
        mutate: vi.fn(
          async (
            sessionId: string,
            mutator: (current: SessionRecord) => SessionRecord,
          ): Promise<SessionRecord | null> => {
            const run = tail.then(async () => {
              if (doc.id !== sessionId) return null;
              const next = mutator(structuredClone(doc));
              doc = structuredClone(next);
              return structuredClone(next);
            });
            tail = run.catch(() => undefined);
            return run;
          },
        ),
        findByPromptUuid: vi.fn(async () => null),
        delete: vi.fn(async () => undefined),
        current: (): SessionRecord => structuredClone(doc),
      };
    };

    const seeded = (): SessionRecord =>
      buildRecord({
        prompt: {
          input: "raw",
          output: "optimized",
          versions: [
            {
              versionId: "v-1",
              signature: "sig",
              prompt: "optimized",
              timestamp: "2026-09-17T00:00:00.000Z",
              generations: [],
            },
          ],
        },
      });

    const take = (id: string): Record<string, unknown> => ({
      id,
      mediaType: "image",
      status: "completed",
      prompt: "astronaut on mars",
      promptVersionId: "v-1",
      mediaUrls: [`https://example.com/${id}.png`],
    });

    const idsIn = (store: ReturnType<typeof createConcurrentStore>): string[] =>
      (store.current().prompt?.versions?.[0]?.generations ?? []).map(
        (generation) => (generation as { id: string }).id,
      );

    const generationsById = (
      store: ReturnType<typeof createConcurrentStore>,
    ): Map<string, Record<string, unknown>> =>
      new Map(
        (store.current().prompt?.versions?.[0]?.generations ?? []).map(
          (generation) => [
            (generation as { id: string }).id,
            generation as Record<string, unknown>,
          ],
        ),
      );

    // Seed with one already-persisted leaf take, so a concurrent writer has a
    // take to race against (a rename to preserve, a node to archive).
    const seededWithLeaf = (id: string): SessionRecord =>
      buildRecord({
        prompt: {
          input: "raw",
          output: "optimized",
          versions: [
            {
              versionId: "v-1",
              signature: "sig",
              prompt: "optimized",
              timestamp: "2026-09-17T00:00:00.000Z",
              generations: [take(id) as never],
            },
          ],
        },
      });

    it("keeps both takes when two different appends run concurrently", async () => {
      const store = createConcurrentStore(seeded());
      const service = new SessionService(store as never);

      await Promise.all([
        service.appendGenerationToVersion(
          "user-1",
          "session-1",
          "v-1",
          take("pic-a"),
        ),
        service.appendGenerationToVersion(
          "user-1",
          "session-1",
          "v-1",
          take("pic-b"),
        ),
      ]);

      expect(idsIn(store).sort()).toEqual(["pic-a", "pic-b"]);
    });

    it("creates no duplicate when the same append is repeated concurrently", async () => {
      const store = createConcurrentStore(seeded());
      const service = new SessionService(store as never);

      await Promise.all([
        service.appendGenerationToVersion(
          "user-1",
          "session-1",
          "v-1",
          take("pic-a"),
        ),
        service.appendGenerationToVersion(
          "user-1",
          "session-1",
          "v-1",
          take("pic-a"),
        ),
      ]);

      expect(idsIn(store)).toEqual(["pic-a"]);
    });

    it("a stale client versions update cannot erase a server-attached take", async () => {
      const store = createConcurrentStore(seeded());
      const service = new SessionService(store as never);

      // The client PATCHes its ENTIRE versions array, built from a read taken
      // before the server attached anything. Whichever of these lands second
      // used to win outright.
      const staleVersions = [
        {
          versionId: "v-1",
          signature: "sig",
          prompt: "optimized",
          timestamp: "2026-09-17T00:00:00.000Z",
          generations: [take("client-take")],
        },
      ];

      await Promise.all([
        service.updateVersionsForUser("user-1", "session-1", {
          versions: staleVersions as never,
        }),
        service.appendGenerationToVersion(
          "user-1",
          "session-1",
          "v-1",
          take("server-take"),
        ),
      ]);

      expect(idsIn(store).sort()).toEqual(["client-take", "server-take"]);
    });

    it("keeps a concurrently appended take when a rename lands", async () => {
      const store = createConcurrentStore(seeded());
      const service = new SessionService(store as never);

      await Promise.all([
        service.appendGenerationToVersion(
          "user-1",
          "session-1",
          "v-1",
          take("pic-a"),
        ),
        service.updateSessionForUser("user-1", "session-1", {
          name: "Renamed while a take was landing",
        }),
      ]);

      expect(idsIn(store)).toEqual(["pic-a"]);
      expect(store.current().name).toBe("Renamed while a take was landing");
      // Both writers took the transactional path; neither built its payload
      // from a prior read and wrote it back through the clobbering save.
      expect(store.save).not.toHaveBeenCalled();
    });

    it("keeps a concurrently appended take when a highlights update lands", async () => {
      const store = createConcurrentStore(seeded());
      const service = new SessionService(store as never);

      await Promise.all([
        service.appendGenerationToVersion(
          "user-1",
          "session-1",
          "v-1",
          take("pic-a"),
        ),
        service.updateHighlightsForUser("user-1", "session-1", {
          highlightCache: { spans: [{ start: 0, end: 4 }] },
        }),
      ]);

      expect(idsIn(store)).toEqual(["pic-a"]);
      expect(store.current().prompt?.highlightCache).toEqual({
        spans: [{ start: 0, end: 4 }],
      });
      expect(store.save).not.toHaveBeenCalled();
    });

    it("keeps a concurrently appended take when the first frame is armed", async () => {
      const store = createConcurrentStore(seeded());
      const service = new SessionService(store as never);

      // First-frame arming is a prompt update (it sets the version's keyframe);
      // it used to build its whole prompt from a read taken before the append.
      const keyframe = {
        id: "kf-1",
        url: "https://example.com/frame.png",
        storagePath: "users/user-1/frames/kf-1.webp",
        assetId: "kf-asset",
      };

      await Promise.all([
        service.appendGenerationToVersion(
          "user-1",
          "session-1",
          "v-1",
          take("pic-a"),
        ),
        service.updatePromptForUser("user-1", "session-1", {
          keyframes: [keyframe],
        }),
      ]);

      expect(idsIn(store)).toEqual(["pic-a"]);
      expect(store.current().prompt?.keyframes).toEqual([keyframe]);
      expect(store.save).not.toHaveBeenCalled();
    });

    it("keeps a concurrently appended take when another take is archived", async () => {
      const store = createConcurrentStore(seededWithLeaf("pic-0"));
      const service = new SessionService(store as never);

      await Promise.all([
        service.appendGenerationToVersion(
          "user-1",
          "session-1",
          "v-1",
          take("pic-a"),
        ),
        service.archiveGeneration("user-1", "session-1", "pic-0"),
      ]);

      const byId = generationsById(store);
      expect(byId.has("pic-a")).toBe(true);
      expect(byId.get("pic-a")?.archived).toBeUndefined();
      expect(byId.get("pic-0")?.archived).toBe(true);
      expect(store.save).not.toHaveBeenCalled();
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

  describe("server-owned take facts are immutable across client doors (issue #112)", () => {
    const storedTake = (): Record<string, unknown> => ({
      id: "take-1",
      mediaType: "image",
      prompt: "an astronaut on mars",
      status: "completed",
      completedAt: "2026-09-17T00:00:00.000Z",
      mediaUrls: ["https://signed.example.com/old.webp?token=old"],
      mediaAssetIds: ["users/user-1/gen/orig.webp"],
      storagePath: "users/user-1/gen/orig.webp",
      ancestorGenerationId: "pic-0",
      origin: "upload",
      productionProvenance: { state: "unknown" },
      sourceInputs: [
        {
          kind: "upload",
          assetId: "a1",
          storagePath: "users/user-1/gen/orig.webp",
        },
      ],
    });

    const withTake = (generation: Record<string, unknown>): SessionRecord =>
      buildRecord({
        prompt: {
          input: "in",
          output: "out",
          versions: [
            {
              versionId: "v-1",
              signature: "sig",
              prompt: "p",
              timestamp: "2026-09-17T00:00:00.000Z",
              generations: [generation],
            },
          ],
        },
      });

    const savedGeneration = (): Record<string, unknown> => {
      const saved = sessionStore.save.mock.calls[0]![0] as SessionRecord;
      return (saved.prompt?.versions?.[0]?.generations?.[0] ?? {}) as Record<
        string,
        unknown
      >;
    };

    // AC 1 — a stale versions PATCH that omits a server-owned fact leaves it
    // intact, one field at a time.
    it.each([
      "origin",
      "productionProvenance",
      "sourceInputs",
      "ancestorGenerationId",
      "archived",
    ])(
      "a stale versions PATCH that omits %s leaves it intact",
      async (field) => {
        const stored = { ...storedTake(), archived: true } as Record<
          string,
          unknown
        >;
        sessionStore.get.mockResolvedValue(withTake(stored));
        const stale = { ...storedTake(), archived: true } as Record<
          string,
          unknown
        >;
        delete stale[field];

        const service = new SessionService(sessionStore as never);
        await service.updateVersionsForUser("user-1", "session-1", {
          versions: [
            {
              versionId: "v-1",
              signature: "sig",
              prompt: "p",
              timestamp: "2026-09-17T00:01:00.000Z",
              generations: [stale],
            },
          ] as never,
        });

        expect(savedGeneration()[field]).toEqual(stored[field]);
      },
    );

    // AC 2 — an empty versions array does not clear history.
    it("a versions PATCH with an empty array does not clear history", async () => {
      sessionStore.get.mockResolvedValue(withTake(storedTake()));

      const service = new SessionService(sessionStore as never);
      const updated = await service.updateVersionsForUser(
        "user-1",
        "session-1",
        { versions: [] },
      );

      expect(updated.prompt?.versions).toHaveLength(1);
      expect(updated.prompt?.versions?.[0]?.versionId).toBe("v-1");
      expect(updated.prompt?.versions?.[0]?.generations?.[0]).toMatchObject({
        id: "take-1",
      });
    });

    // AC 3 — a general session update cannot alter a server-owned take fact.
    it("a general session update cannot alter a server-owned take fact", async () => {
      sessionStore.get.mockResolvedValue(withTake(storedTake()));

      const service = new SessionService(sessionStore as never);
      await service.updateSessionForUser("user-1", "session-1", {
        prompt: {
          versions: [
            {
              versionId: "v-1",
              signature: "sig",
              prompt: "p",
              timestamp: "2026-09-17T00:01:00.000Z",
              generations: [
                {
                  ...storedTake(),
                  origin: "generated",
                  productionProvenance: {
                    state: "known",
                    instruction: "hijack",
                    model: null,
                  },
                },
              ],
            },
          ],
        } as never,
      });

      const gen = savedGeneration();
      expect(gen.origin).toBe("upload");
      expect(gen.productionProvenance).toEqual({ state: "unknown" });
    });

    // AC 3 — a first-frame arming update touches only what it owns.
    it("a first-frame arming update touches only what it owns", async () => {
      const stored = storedTake();
      sessionStore.get.mockResolvedValue(withTake(stored));

      const service = new SessionService(sessionStore as never);
      await service.updateVersionsForUser("user-1", "session-1", {
        versions: [
          {
            versionId: "v-1",
            signature: "sig",
            prompt: "p",
            timestamp: "2026-09-17T00:01:00.000Z",
            firstFrame: {
              generatedAt: "2026-09-17T00:02:00.000Z",
              imageUrl: "https://signed.example.com/frame.webp?token=new",
              storagePath: "users/user-1/frames/v1.webp",
              assetId: "frame-asset",
            },
            // The client re-sends the take alongside the newly armed frame, with
            // a refreshed signed url.
            generations: [
              {
                ...stored,
                mediaUrls: [
                  "https://signed.example.com/refreshed.webp?token=new",
                ],
              },
            ],
          },
        ] as never,
      });

      const saved = sessionStore.save.mock.calls[0]![0] as SessionRecord;
      expect(saved.prompt?.versions?.[0]?.firstFrame?.storagePath).toBe(
        "users/user-1/frames/v1.webp",
      );
      const gen = saved.prompt?.versions?.[0]?.generations?.[0] as Record<
        string,
        unknown
      >;
      expect(gen.storagePath).toBe("users/user-1/gen/orig.webp");
      expect(gen.mediaAssetIds).toEqual(["users/user-1/gen/orig.webp"]);
      expect(gen.origin).toBe("upload");
    });

    // AC 3 (the bug fix) — a stale save cannot resurrect an archived take.
    it("a stale versions PATCH cannot resurrect an archived take", async () => {
      const archived = { ...storedTake(), archived: true };
      sessionStore.get.mockResolvedValue(withTake(archived));

      // The client read the take before it was archived, so its payload omits
      // the flag entirely.
      const stale = { ...storedTake() } as Record<string, unknown>;
      delete stale.archived;

      const service = new SessionService(sessionStore as never);
      await service.updateVersionsForUser("user-1", "session-1", {
        versions: [
          {
            versionId: "v-1",
            signature: "sig",
            prompt: "p",
            timestamp: "2026-09-17T00:01:00.000Z",
            generations: [stale],
          },
        ] as never,
      });

      expect(savedGeneration().archived).toBe(true);
    });

    // AC 5 — a legacy record with missing facts round-trips unchanged.
    it("a legacy record with missing facts round-trips unchanged and reads as unknown", async () => {
      const legacy = {
        id: "legacy-1",
        mediaType: "image",
        prompt: "old",
        status: "completed",
        mediaUrls: ["https://x/y.png"],
      };
      sessionStore.get.mockResolvedValue(withTake(legacy));

      const service = new SessionService(sessionStore as never);
      await service.updateVersionsForUser("user-1", "session-1", {
        versions: [
          {
            versionId: "v-1",
            signature: "sig",
            prompt: "p",
            timestamp: "2026-09-17T00:01:00.000Z",
            generations: [{ ...legacy }],
          },
        ] as never,
      });

      const gen = savedGeneration();
      expect("origin" in gen).toBe(false);
      expect("productionProvenance" in gen).toBe(false);
      expect(gen).toEqual(legacy);
    });

    // AC 4 — the attachment-retry door validates identity and provenance.
    describe("attachment retry (ADR-0022 decision 6)", () => {
      it("rejects a retry that alters an established take's provenance", async () => {
        sessionStore.get.mockResolvedValue(withTake(storedTake()));

        const service = new SessionService(sessionStore as never);
        await expect(
          service.appendGenerationToVersion("user-1", "session-1", "v-1", {
            ...storedTake(),
            origin: "generated",
            productionProvenance: {
              state: "known",
              instruction: "forged",
              model: null,
            },
          }),
        ).rejects.toBeInstanceOf(TakeFactsConflictError);
        expect(sessionStore.save).not.toHaveBeenCalled();
      });

      it("rejects a retry that writes foreign media under an established identity", async () => {
        sessionStore.get.mockResolvedValue(withTake(storedTake()));

        const service = new SessionService(sessionStore as never);
        await expect(
          service.appendGenerationToVersion("user-1", "session-1", "v-1", {
            ...storedTake(),
            mediaAssetIds: ["users/attacker/gen/evil.webp"],
            storagePath: "users/attacker/gen/evil.webp",
          }),
        ).rejects.toBeInstanceOf(TakeFactsConflictError);
        expect(sessionStore.save).not.toHaveBeenCalled();
      });

      it("accepts a retry that faithfully re-sends the established take's record", async () => {
        sessionStore.get.mockResolvedValue(withTake(storedTake()));

        const service = new SessionService(sessionStore as never);
        const updated = await service.appendGenerationToVersion(
          "user-1",
          "session-1",
          "v-1",
          storedTake(),
        );

        const generations = updated.prompt?.versions?.[0]?.generations ?? [];
        expect(generations).toHaveLength(1);
        expect((generations[0] as Record<string, unknown>).origin).toBe(
          "upload",
        );
        expect(
          (generations[0] as Record<string, unknown>).productionProvenance,
        ).toEqual({ state: "unknown" });
      });
    });
  });
});
