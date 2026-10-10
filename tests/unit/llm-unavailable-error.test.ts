import { describe, it, expect } from "vitest";
import { LLMUnavailableError } from "@services/ai-model/LLMUnavailableError";

describe("LLMUnavailableError", () => {
  it("returns HTTP 503 status", () => {
    const error = new LLMUnavailableError("No providers");

    expect(error.getHttpStatus()).toBe(503);
  });

  it("serializes to structured JSON with code and user-safe message", () => {
    const error = new LLMUnavailableError("raw internal detail");
    const json = error.toJSON();

    expect(json).toEqual({
      name: "LLMUnavailableError",
      code: "LLM_UNAVAILABLE",
      message:
        "AI services are temporarily unavailable. Please try again in a moment.",
    });
  });
});
