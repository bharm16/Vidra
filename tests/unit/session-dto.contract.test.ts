import { describe, expect, it } from "vitest";

import {
  SessionDtoSchema,
  SessionContinuityShotSchema,
  SessionPromptVersionEntrySchema,
  SessionPromptVersionFirstFrameSchema,
  SessionContinuitySchema,
  SessionPromptSchema,
} from "#shared/schemas/session.schemas";

describe("SessionDto contract", () => {
  it("accepts a minimal active session", () => {
    const result = SessionDtoSchema.safeParse({
      id: "session-1",
      userId: "user-1",
      status: "active",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a session with prompt data", () => {
    const result = SessionDtoSchema.safeParse({
      id: "session-2",
      userId: "user-1",
      name: "My video project",
      status: "active",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-02T00:00:00Z",
      prompt: {
        input: "A cinematic dolly shot through a neon alley",
        output:
          "Optimized: A cinematic dolly-in through a rain-slicked neon alley at midnight",
        score: 18.5,
        mode: "video",
        targetModel: "sora-2",
        generationParams: { fps: 24, duration_s: 6 },
        versions: [
          {
            versionId: "v1",
            signature: "abc123",
            prompt: "A cinematic dolly shot through a neon alley",
            timestamp: "2025-01-01T00:00:00Z",
          },
        ],
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts a session with null prompt fields", () => {
    const result = SessionDtoSchema.safeParse({
      id: "session-3",
      userId: "user-1",
      status: "completed",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
      prompt: {
        input: "test",
        output: "test",
        title: null,
        score: null,
        targetModel: null,
        generationParams: null,
        keyframes: null,
        brainstormContext: null,
        highlightCache: null,
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects sessions with invalid status", () => {
    const result = SessionDtoSchema.safeParse({
      id: "session-bad",
      userId: "user-1",
      status: "deleted",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    });

    expect(result.success).toBe(false);
  });

  it("rejects sessions missing required fields", () => {
    expect(SessionDtoSchema.safeParse({ id: "x" }).success).toBe(false);
    expect(SessionDtoSchema.safeParse({ id: "x", userId: "y" }).success).toBe(
      false,
    );
  });

  it("allows unknown additional properties (forward-compatible)", () => {
    const result = SessionDtoSchema.safeParse({
      id: "session-fc",
      userId: "user-1",
      status: "active",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
      futureField: "some-value",
    });

    expect(result.success).toBe(true);
  });
});

describe("SessionPrompt contract", () => {
  it("requires input and output", () => {
    expect(SessionPromptSchema.safeParse({}).success).toBe(false);
    expect(SessionPromptSchema.safeParse({ input: "x" }).success).toBe(false);
    expect(
      SessionPromptSchema.safeParse({ input: "x", output: "y" }).success,
    ).toBe(true);
  });
});

describe("SessionPromptVersionPreview contract", () => {
  it("accepts a minimal preview with only generatedAt", () => {
    const result = SessionPromptVersionFirstFrameSchema.safeParse({
      generatedAt: "2025-01-01T00:00:00Z",
    });

    expect(result.success).toBe(true);
  });

  it("accepts preview with null fields (server sends null, not undefined)", () => {
    const result = SessionPromptVersionFirstFrameSchema.safeParse({
      generatedAt: "2025-01-01T00:00:00Z",
      imageUrl: null,
      aspectRatio: null,
      storagePath: null,
      assetId: null,
      viewUrlExpiresAt: null,
    });

    expect(result.success).toBe(true);
  });

  it("accepts preview with populated fields", () => {
    const result = SessionPromptVersionFirstFrameSchema.safeParse({
      generatedAt: "2025-01-01T00:00:00Z",
      imageUrl: "https://storage.example.com/preview.png",
      aspectRatio: "16:9",
      storagePath: "previews/session-1/v1.png",
      assetId: "asset-123",
      viewUrlExpiresAt: "2025-01-02T00:00:00Z",
    });

    expect(result.success).toBe(true);
  });
});

describe("SessionPromptVersionEntry contract", () => {
  it("accepts a minimal version entry", () => {
    const result = SessionPromptVersionEntrySchema.safeParse({
      versionId: "v1",
      signature: "abc",
      prompt: "A cinematic scene",
      timestamp: "2025-01-01T00:00:00Z",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a version entry with all optional fields", () => {
    const result = SessionPromptVersionEntrySchema.safeParse({
      versionId: "v2",
      label: "Refined",
      signature: "def456",
      prompt: "A cinematic dolly-in through a neon alley",
      timestamp: "2025-01-01T01:00:00Z",
      highlights: { subject: [0, 15] },
      editCount: 3,
      edits: [
        { timestamp: "2025-01-01T00:30:00Z", delta: 5, source: "manual" },
      ],
      preview: {
        generatedAt: "2025-01-01T01:05:00Z",
        imageUrl: "https://example.com/img.png",
      },
      video: { generatedAt: "2025-01-01T01:10:00Z", model: "sora-2" },
      generations: [{ id: "gen-1", status: "completed" }],
    });

    expect(result.success).toBe(true);
  });

  it("rejects version entries missing required fields", () => {
    expect(
      SessionPromptVersionEntrySchema.safeParse({ versionId: "v1" }).success,
    ).toBe(false);
  });
});

describe("SessionContinuityShot contract", () => {
  const minimalShot = {
    id: "shot-1",
    sessionId: "session-1",
    sequenceIndex: 0,
    userPrompt: "A woman walks down the street",
    continuityMode: "frame-bridge" as const,
    styleStrength: 0.8,
    styleReferenceId: null,
    modelId: "kling-1.6",
    status: "draft" as const,
    createdAt: "2025-01-01T00:00:00Z",
  };

  it("accepts a minimal draft shot", () => {
    expect(SessionContinuityShotSchema.safeParse(minimalShot).success).toBe(
      true,
    );
  });

  it("accepts a completed shot with all optional fields", () => {
    const result = SessionContinuityShotSchema.safeParse({
      ...minimalShot,
      status: "completed",
      generationMode: "continuity",
      styleReference: {
        id: "sr-1",
        frameUrl: "https://example.com/frame.png",
        frameTimestamp: 0,
        resolution: { width: 1920, height: 1080 },
        aspectRatio: "16:9",
      },
      camera: { yaw: 10, pitch: -5, roll: 0, dolly: 0.3 },
      seedInfo: {
        seed: 42,
        provider: "kling",
        modelId: "kling-1.6",
        extractedAt: "2025-01-01T00:00:00Z",
      },
      styleScore: 0.92,
      identityScore: 0.88,
      qualityScore: 0.95,
      retryCount: 0,
      generatedAt: "2025-01-01T00:05:00Z",
      videoAssetId: "va-1",
      previewAssetId: "pa-1",
    });

    expect(result.success).toBe(true);
  });

  it("rejects shots with invalid status", () => {
    expect(
      SessionContinuityShotSchema.safeParse({
        ...minimalShot,
        status: "pending",
      }).success,
    ).toBe(false);
  });

  it("rejects shots with invalid continuity mode", () => {
    expect(
      SessionContinuityShotSchema.safeParse({
        ...minimalShot,
        continuityMode: "invalid",
      }).success,
    ).toBe(false);
  });
});

describe("SessionContinuity contract", () => {
  it("accepts continuity with null primaryStyleReference and sceneProxy", () => {
    const result = SessionContinuitySchema.safeParse({
      shots: [],
      primaryStyleReference: null,
      sceneProxy: null,
      settings: {
        generationMode: "continuity",
        defaultContinuityMode: "frame-bridge",
        defaultStyleStrength: 0.8,
        defaultModel: "kling-1.6",
        autoExtractFrameBridge: true,
        useCharacterConsistency: false,
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts continuity with omitted optional fields (undefined)", () => {
    const result = SessionContinuitySchema.safeParse({
      shots: [],
      settings: {
        generationMode: "standard",
        defaultContinuityMode: "none",
        defaultStyleStrength: 0.5,
        defaultModel: "sora-2",
        autoExtractFrameBridge: false,
        useCharacterConsistency: false,
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects continuity with invalid generation mode", () => {
    const result = SessionContinuitySchema.safeParse({
      shots: [],
      settings: {
        generationMode: "parallel",
        defaultContinuityMode: "none",
        defaultStyleStrength: 0.5,
        defaultModel: "sora-2",
        autoExtractFrameBridge: false,
        useCharacterConsistency: false,
      },
    });

    expect(result.success).toBe(false);
  });
});
