import type { Application } from "express";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { configureServices, initializeServices } from "@config/services.config";
import { createApp } from "@server/app";
import type { ContinuitySession } from "@services/continuity/types";

const TEST_API_KEY = "phase2-continuity-key";
const TEST_USER_ID = `api-key:${TEST_API_KEY}`;

const waitFor = async (
  condition: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> => {
  const timeoutMs = options.timeoutMs ?? 2_000;
  const intervalMs = options.intervalMs ?? 20;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Timed out waiting for condition");
};

const createDeferred = <T>() => {
  let resolveFn: ((value: T | PromiseLike<T>) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolveFn = resolve;
  });
  return {
    promise,
    resolve: (value: T) => {
      if (!resolveFn) {
        throw new Error("Deferred resolver was not initialized");
      }
      resolveFn(value);
    },
  };
};

const buildFrameBridge = () => ({
  id: "frame-1",
  sourceVideoId: "video-0",
  sourceShotId: "shot-0",
  frameUrl: "https://example.com/frame.png",
  framePosition: "last" as const,
  frameTimestamp: 3.5,
  resolution: { width: 1280, height: 720 },
  aspectRatio: "16:9" as const,
  extractedAt: new Date("2026-01-01T00:00:05.000Z"),
});

const buildSession = (): ContinuitySession => ({
  id: "session-1",
  userId: TEST_USER_ID,
  name: "Continuity session",
  primaryStyleReference: {
    id: "style-1",
    sourceVideoId: "video-0",
    sourceFrameIndex: 0,
    frameUrl: "https://example.com/style.png",
    frameTimestamp: 0,
    resolution: { width: 1920, height: 1080 },
    aspectRatio: "16:9",
    extractedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  shots: [
    {
      id: "shot-0",
      sessionId: "session-1",
      sequenceIndex: 0,
      userPrompt: "Previous shot",
      generationMode: "standard",
      continuityMode: "frame-bridge",
      styleStrength: 0.6,
      styleReferenceId: null,
      modelId: "sora2",
      status: "completed",
      videoAssetId: "video-0",
      frameBridge: buildFrameBridge(),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      generatedAt: new Date("2026-01-01T00:00:02.000Z"),
    },
    {
      id: "shot-1",
      sessionId: "session-1",
      sequenceIndex: 1,
      userPrompt: "Target shot",
      generationMode: "standard",
      continuityMode: "frame-bridge",
      styleStrength: 0.6,
      styleReferenceId: null,
      modelId: "sora2",
      status: "draft",
      createdAt: new Date("2026-01-01T00:00:03.000Z"),
    },
  ],
  defaultSettings: {
    generationMode: "standard",
    defaultContinuityMode: "frame-bridge",
    defaultStyleStrength: 0.6,
    defaultModel: "sora2",
    autoExtractFrameBridge: false,
    useCharacterConsistency: false,
    maxRetries: 1,
    qualityThresholds: {
      style: 0.75,
      identity: 0.6,
    },
  },
  status: "active",
  version: 1,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
});

describe("Continuity stream routes (full-stack integration)", () => {
  let app: Application;
  let previousAllowedApiKeys: string | undefined;
  let previousPort: string | undefined;

  let sessionStoreState: Map<string, ContinuitySession>;

  const continuitySessionStoreMock = {
    get: vi.fn(),
    save: vi.fn(),
    saveWithVersion: vi.fn(),
    findByUser: vi.fn(),
    delete: vi.fn(),
  };

  const videoGenerationServiceMock = {
    getVideoUrl: vi.fn(),
    generateVideo: vi.fn(),
  };

  const frameBridgeServiceMock = {
    extractBridgeFrame: vi.fn(),
    extractRepresentativeFrame: vi.fn(),
  };

  const gradingServiceMock = {
    matchPalette: vi.fn(),
    matchImagePalette: vi.fn(),
  };

  const qualityGateServiceMock = {
    evaluate: vi.fn(),
  };

  const sceneProxyServiceMock = {
    renderFromProxy: vi.fn(),
    createProxyFromVideo: vi.fn(),
  };

  const assetServiceMock = {
    getAssetForGeneration: vi.fn(),
  };

  const userCreditServiceMock = {
    reserveCredits: vi.fn(),
    refundCredits: vi.fn(),
    hasCredits: vi.fn(),
  };

  beforeAll(async () => {
    previousAllowedApiKeys = process.env.ALLOWED_API_KEYS;
    previousPort = process.env.PORT;

    process.env.ALLOWED_API_KEYS = TEST_API_KEY;
    process.env.PORT = "0";

    const container = await configureServices();
    container.registerValue(
      "continuitySessionStore",
      continuitySessionStoreMock,
    );
    container.registerValue(
      "videoGenerationService",
      videoGenerationServiceMock,
    );
    container.registerValue("frameBridgeService", frameBridgeServiceMock);
    container.registerValue("gradingService", gradingServiceMock);
    container.registerValue("qualityGateService", qualityGateServiceMock);
    container.registerValue("sceneProxyService", sceneProxyServiceMock);
    container.registerValue("assetService", assetServiceMock);
    container.registerValue("userCreditService", userCreditServiceMock);

    await initializeServices(container);
    app = createApp(container);
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStoreState = new Map([
      ["session-1", structuredClone(buildSession())],
    ]);

    continuitySessionStoreMock.get.mockImplementation(
      async (sessionId: string) => {
        const session = sessionStoreState.get(sessionId);
        return session ? structuredClone(session) : null;
      },
    );
    continuitySessionStoreMock.save.mockImplementation(
      async (session: ContinuitySession) => {
        sessionStoreState.set(session.id, structuredClone(session));
      },
    );
    continuitySessionStoreMock.saveWithVersion.mockImplementation(
      async (session: ContinuitySession, expectedVersion: number) => {
        const nextVersion = expectedVersion + 1;
        sessionStoreState.set(
          session.id,
          structuredClone({ ...session, version: nextVersion }),
        );
        return nextVersion;
      },
    );
    continuitySessionStoreMock.findByUser.mockImplementation(
      async (userId: string) =>
        Array.from(sessionStoreState.values())
          .filter((session) => session.userId === userId)
          .map((session) => structuredClone(session)),
    );
    continuitySessionStoreMock.delete.mockImplementation(
      async (sessionId: string) => {
        sessionStoreState.delete(sessionId);
      },
    );

    videoGenerationServiceMock.getVideoUrl.mockResolvedValue(
      "https://example.com/video-0.mp4",
    );
    videoGenerationServiceMock.generateVideo.mockResolvedValue({
      assetId: "video-asset-1",
      videoUrl: "https://example.com/generated.mp4",
    });

    frameBridgeServiceMock.extractBridgeFrame.mockResolvedValue(
      buildFrameBridge(),
    );
    frameBridgeServiceMock.extractRepresentativeFrame.mockResolvedValue(
      buildFrameBridge(),
    );

    gradingServiceMock.matchPalette.mockResolvedValue({
      applied: false,
      assetId: undefined,
      videoUrl: undefined,
    });
    gradingServiceMock.matchImagePalette.mockResolvedValue({
      applied: false,
      imageUrl: undefined,
    });

    qualityGateServiceMock.evaluate.mockResolvedValue({
      passed: true,
      styleScore: 0.88,
      identityScore: 0.81,
    });

    assetServiceMock.getAssetForGeneration.mockResolvedValue({
      primaryImageUrl: "https://example.com/character.png",
    });

    userCreditServiceMock.reserveCredits.mockResolvedValue(true);
    userCreditServiceMock.refundCredits.mockResolvedValue(true);
    userCreditServiceMock.hasCredits.mockResolvedValue(true);
  });

  afterAll(() => {
    if (previousAllowedApiKeys === undefined) {
      delete process.env.ALLOWED_API_KEYS;
    } else {
      process.env.ALLOWED_API_KEYS = previousAllowedApiKeys;
    }

    if (previousPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = previousPort;
    }
  });

  it("GET /api/sessions/:sessionId/shots/:shotId/status returns status payload fields", async () => {
    const session = sessionStoreState.get("session-1");
    if (!session) {
      throw new Error("Missing seeded session state");
    }
    const shot = session.shots.find((candidate) => candidate.id === "shot-1");
    if (!shot) {
      throw new Error("Missing seeded shot");
    }
    shot.status = "completed";
    shot.continuityMechanismUsed = "frame-bridge";
    shot.styleScore = 0.91;
    shot.identityScore = 0.87;
    shot.styleDegraded = false;
    delete shot.styleDegradedReason;
    shot.generatedKeyframeUrl = "https://example.com/keyframe.png";
    shot.frameBridge = buildFrameBridge();
    shot.retryCount = 1;
    delete shot.error;
    sessionStoreState.set(session.id, structuredClone(session));

    const response = await request(app)
      .get("/api/sessions/session-1/shots/shot-1/status")
      .set("x-api-key", TEST_API_KEY);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        shotId: "shot-1",
        status: "completed",
        continuityMechanismUsed: "frame-bridge",
        styleScore: 0.91,
        identityScore: 0.87,
        styleDegraded: false,
        styleDegradedReason: null,
        generatedKeyframeUrl: "https://example.com/keyframe.png",
        frameBridgeUrl: "https://example.com/frame.png",
        retryCount: 1,
        error: null,
      },
    });
  });

  it("GET /api/sessions/:sessionId/shots/:shotId/status returns 404 for unknown shot", async () => {
    const response = await request(app)
      .get("/api/sessions/session-1/shots/unknown-shot/status")
      .set("x-api-key", TEST_API_KEY);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: "Shot not found",
    });
  });

  it("returns persisted intermediate status while generation is in-flight", async () => {
    const deferredVideo = createDeferred<{
      assetId: string;
      videoUrl: string;
    }>();
    videoGenerationServiceMock.generateVideo.mockImplementation(
      () => deferredVideo.promise,
    );

    const streamPromise = request(app)
      .post("/api/sessions/session-1/shots/shot-1/generate-stream")
      .set("x-api-key", TEST_API_KEY)
      .set("Accept", "text/event-stream")
      .send({})
      .then((response) => response);

    try {
      await waitFor(() => {
        const session = sessionStoreState.get("session-1");
        const shot = session?.shots.find(
          (candidate) => candidate.id === "shot-1",
        );
        return shot?.status === "generating-video";
      });

      const statusResponse = await request(app)
        .get("/api/sessions/session-1/shots/shot-1/status")
        .set("x-api-key", TEST_API_KEY);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.data.status).toBe("generating-video");
    } finally {
      deferredVideo.resolve({
        assetId: "video-asset-1",
        videoUrl: "https://example.com/generated.mp4",
      });
      await streamPromise;
    }
  });
});
