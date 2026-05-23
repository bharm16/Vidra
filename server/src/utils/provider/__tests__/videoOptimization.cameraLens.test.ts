import { describe, expect, it } from "vitest";

import { getVideoOptimizationSchema } from "../schemas/videoOptimization.js";

describe("videoOptimization schema — camera_lens", () => {
  it("includes camera_lens in OpenAI strict schema properties with nullable string type", () => {
    const schema = getVideoOptimizationSchema({
      operation: "optimize_standard",
      provider: "openai",
      model: "gpt-4o-2024-08-06",
    });

    expect(schema.properties).toBeDefined();
    const cameraLens = schema.properties?.camera_lens;
    expect(cameraLens).toBeDefined();
    expect(cameraLens?.type).toEqual(["string", "null"]);
    const description = cameraLens?.description ?? "";
    expect(typeof description).toBe("string");
    expect(description.toLowerCase()).toContain("aperture");
  });

  it("includes camera_lens in OpenAI strict schema required array (strict-mode requirement)", () => {
    const schema = getVideoOptimizationSchema({
      operation: "optimize_standard",
      provider: "openai",
      model: "gpt-4o-2024-08-06",
    });
    expect(schema.required).toContain("camera_lens");
  });

  it("includes camera_lens in Groq schema properties (optional, NOT in required)", () => {
    const schema = getVideoOptimizationSchema({
      operation: "optimize_standard",
      provider: "groq",
      model: "qwen-2.5-32b",
    });
    const cameraLens = schema.properties?.camera_lens;
    expect(cameraLens).toBeDefined();
    expect(cameraLens?.type).toEqual(["string", "null"]);
    // Groq treats required as advisory (Sub-project B finding); slot stays
    // optional so json_object mode tolerates omission cleanly.
    expect(schema.required).not.toContain("camera_lens");
  });
});
