import { describe, expect, it } from "vitest";
import {
  classifyError,
  normalizeErrorMessage,
  withStage,
  type StageAwareError,
  type ClassifyErrorInput,
} from "../classifyError";

const makeJob = (
  overrides?: Partial<ClassifyErrorInput>,
): ClassifyErrorInput => ({
  request: {
    prompt: "test prompt",
    options: { model: "sora-2" },
  },
  attempts: 1,
  ...overrides,
});

const makeStageError = (
  message: string,
  stage: StageAwareError["stage"] = "generation",
): StageAwareError => withStage(new Error(message), stage);

describe("classifyError", () => {
  it("classifies persistence errors as storage/retryable", () => {
    const result = classifyError(
      makeStageError("disk full", "persistence"),
      makeJob(),
    );
    expect(result).toMatchObject({
      category: "storage",
      code: "VIDEO_JOB_STORAGE_FAILED",
      retryable: true,
      stage: "persistence",
    });
  });

  it("regression: classifyError timeout keywords map to retryable", () => {
    for (const keyword of ["timeout", "timed out", "ETIMEDOUT"]) {
      const result = classifyError(
        makeStageError(`Request ${keyword} after 300s`, "generation"),
        makeJob(),
      );
      expect(result.category).toBe("timeout");
      expect(result.code).toBe("VIDEO_JOB_TIMEOUT");
      expect(result.retryable).toBe(true);
    }
  });

  it("classifies rate-limit and availability errors as provider/retryable", () => {
    for (const keyword of ["rate limit", "429", "unavailable", "temporary"]) {
      const result = classifyError(
        makeStageError(`Provider returned ${keyword}`, "generation"),
        makeJob(),
      );
      expect(result.category).toBe("provider");
      expect(result.code).toBe("VIDEO_JOB_PROVIDER_RETRYABLE");
      expect(result.retryable).toBe(true);
    }
  });

  it("classifies validation errors as non-retryable", () => {
    for (const keyword of [
      "invalid",
      "unsupported",
      "validation",
      "bad request",
    ]) {
      const result = classifyError(
        makeStageError(`Input ${keyword}`, "generation"),
        makeJob(),
      );
      expect(result.category).toBe("validation");
      expect(result.code).toBe("VIDEO_JOB_VALIDATION_FAILED");
      expect(result.retryable).toBe(false);
    }
  });

  it("classifies generic generation errors as provider/retryable", () => {
    const result = classifyError(
      makeStageError("Something went wrong", "generation"),
      makeJob(),
    );
    expect(result).toMatchObject({
      category: "provider",
      code: "VIDEO_JOB_PROVIDER_FAILED",
      retryable: true,
      stage: "generation",
    });
  });

  it("classifies unknown-stage errors as infrastructure/retryable", () => {
    const result = classifyError(
      makeStageError("Unexpected failure", "unknown"),
      makeJob(),
    );
    expect(result).toMatchObject({
      category: "infrastructure",
      code: "VIDEO_JOB_INFRA_FAILED",
      retryable: true,
    });
  });

  it("includes provider from model option", () => {
    const result = classifyError(
      makeStageError("error", "generation"),
      makeJob({ request: { prompt: "p", options: { model: "kling-1.6" } } }),
    );
    expect(result.provider).toBe("kling-1.6");
  });

  it("omits provider when model is not a string", () => {
    const result = classifyError(
      makeStageError("error", "generation"),
      makeJob({ request: { prompt: "p", options: {} } }),
    );
    expect(result.provider).toBeUndefined();
  });

  it("includes attempt count from job", () => {
    const result = classifyError(
      makeStageError("error", "generation"),
      makeJob({ attempts: 3 }),
    );
    expect(result.attempt).toBe(3);
  });
});

describe("normalizeErrorMessage", () => {
  it("extracts message from Error instances", () => {
    expect(normalizeErrorMessage(new Error("test"))).toBe("test");
  });

  it("converts non-Error values to string", () => {
    expect(normalizeErrorMessage("raw string")).toBe("raw string");
    expect(normalizeErrorMessage(42)).toBe("42");
    expect(normalizeErrorMessage(null)).toBe("null");
  });
});

describe("withStage", () => {
  it("adds stage to Error instances", () => {
    const original = new Error("test");
    const staged = withStage(original, "generation");
    expect(staged.stage).toBe("generation");
    expect(staged.message).toBe("test");
    expect(staged).toBe(original);
  });

  it("wraps non-Error values in Error with stage", () => {
    const staged = withStage("string error", "persistence");
    expect(staged).toBeInstanceOf(Error);
    expect(staged.stage).toBe("persistence");
    expect(staged.message).toBe("string error");
  });
});
