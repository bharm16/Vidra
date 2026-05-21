import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { emitMock, shutdownMock, judgeMock, fetchEventsMock, fetchScoredMock } =
  vi.hoisted(() => ({
    emitMock: vi.fn(),
    shutdownMock: vi.fn(async () => undefined),
    judgeMock: vi.fn(),
    fetchEventsMock: vi.fn(),
    fetchScoredMock: vi.fn(),
  }));

vi.mock("../../evaluation/posthog-emitter.js", () => ({
  createEvalEmitter: () => ({ emit: emitMock, shutdown: shutdownMock }),
  resolveDistinctId: () => "test",
}));

vi.mock("../judge-client.js", () => ({
  runJudge: judgeMock,
  JUDGE_MODEL_NAME: "gpt-4o-2024-08-06",
}));

vi.mock("../posthog-query-client.js", () => ({
  createPostHogQueryClient: () => ({
    fetchEventsToScore: fetchEventsMock,
    fetchAlreadyScoredIds: fetchScoredMock,
  }),
}));

import { runJudgeForSurface } from "../run-judge.js";

describe("run-judge orchestrator", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    emitMock.mockReset();
    shutdownMock.mockClear();
    judgeMock.mockReset();
    fetchEventsMock.mockReset();
    fetchScoredMock.mockReset();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("emits a quality.scored event for a judgeable optimize event", async () => {
    fetchEventsMock.mockResolvedValue([
      {
        uuid: "e1",
        event: "optimize.completed",
        properties: {
          inputPrompt: "wide shot",
          outputPrompt: "Wide shot, ginger cat, soft side light",
          targetModel: "sora",
          mode: "creative",
          hasContext: false,
          hasShotPlan: false,
          useConstitutionalAI: false,
          source: "synthetic",
        },
      },
    ]);
    fetchScoredMock.mockResolvedValue(new Set());
    judgeMock.mockResolvedValue({
      dimensions: {
        fidelity: 5,
        detailEnrichment: 4,
        coherence: 4,
        constraintCompliance: 5,
        brevityDiscipline: 4,
      },
      reasoning: "ok",
      tokensIn: 800,
      tokensOut: 100,
      costUsd: 0.003,
    });

    await runJudgeForSurface("optimize", { hoursBack: 24, userSampleRate: 1 });

    expect(emitMock).toHaveBeenCalledOnce();
    const args = emitMock.mock.calls[0][0];
    expect(args.event).toBe("quality.scored");
    expect(args.properties.scoredEvent).toBe("optimize.completed");
    expect(args.properties.scoredEventId).toBe("e1");
    expect(args.properties.surface).toBe("optimize");
    expect(args.properties.totalScore).toBe(22);
    expect(args.properties.judgeModel).toBe("gpt-4o-2024-08-06");
    expect(args.properties.source).toBe("synthetic");
  });

  it("skips already-scored events (idempotency)", async () => {
    fetchEventsMock.mockResolvedValue([
      {
        uuid: "e1",
        event: "optimize.completed",
        properties: {
          inputPrompt: "x",
          outputPrompt: "y",
          source: "synthetic",
        },
      },
    ]);
    fetchScoredMock.mockResolvedValue(new Set(["e1"]));

    await runJudgeForSurface("optimize", { hoursBack: 24, userSampleRate: 1 });

    expect(judgeMock).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("skips non-judgeable events (empty output)", async () => {
    fetchEventsMock.mockResolvedValue([
      {
        uuid: "e1",
        event: "optimize.completed",
        properties: {
          inputPrompt: "x",
          outputPrompt: null,
          source: "synthetic",
        },
      },
    ]);
    fetchScoredMock.mockResolvedValue(new Set());

    await runJudgeForSurface("optimize", { hoursBack: 24, userSampleRate: 1 });

    expect(judgeMock).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("does not throw when the judge call fails (best-effort)", async () => {
    fetchEventsMock.mockResolvedValue([
      {
        uuid: "e1",
        event: "optimize.completed",
        properties: {
          inputPrompt: "x",
          outputPrompt: "y",
          source: "synthetic",
        },
      },
    ]);
    fetchScoredMock.mockResolvedValue(new Set());
    judgeMock.mockRejectedValue(new Error("openai 500"));

    await expect(
      runJudgeForSurface("optimize", { hoursBack: 24, userSampleRate: 1 }),
    ).resolves.not.toThrow();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("emits accounting summary log when fetched > 0", async () => {
    fetchEventsMock.mockResolvedValue([
      {
        uuid: "e1",
        event: "optimize.completed",
        properties: {
          inputPrompt: "x",
          outputPrompt: "y",
          source: "synthetic",
        },
      },
      {
        uuid: "e2",
        event: "optimize.completed",
        properties: {
          inputPrompt: "x",
          outputPrompt: null,
          source: "synthetic",
        },
      },
      {
        uuid: "e3",
        event: "optimize.completed",
        properties: {
          inputPrompt: "x",
          outputPrompt: "y",
          source: "synthetic",
        },
      },
    ]);
    fetchScoredMock.mockResolvedValue(new Set(["e1"]));
    judgeMock.mockResolvedValue({
      dimensions: {
        fidelity: 5,
        detailEnrichment: 4,
        coherence: 4,
        constraintCompliance: 5,
        brevityDiscipline: 4,
      },
      reasoning: "ok",
      tokensIn: 800,
      tokensOut: 100,
      costUsd: 0.003,
    });

    await runJudgeForSurface("optimize", {
      hoursBack: 24,
      userSampleRate: 1,
    });

    const accountingLines = logSpy.mock.calls
      .map((args) => String(args[0]))
      .filter((line) => line.startsWith("[quality-judge] optimize:"));
    expect(accountingLines.length).toBeGreaterThanOrEqual(1);
    const accountingLine = accountingLines[accountingLines.length - 1];
    expect(accountingLine).toBe(
      "[quality-judge] optimize: 3 fetched, 1 scored, 1 already-scored, 1 non-judgeable, 0 failed.",
    );
  });
});
