import { beforeEach, describe, expect, it, vi } from "vitest";

const { capabilitiesForMock } = vi.hoisted(() => ({
  capabilitiesForMock: vi.fn(),
}));

vi.mock("@utils/provider/ProviderDetector", () => ({
  capabilitiesFor: capabilitiesForMock,
}));

vi.mock("@llm/span-labeling/schemas/SpanLabelingSchema", () => ({
  OPENAI_SPAN_LABELING_JSON_SCHEMA: {
    name: "openai-span",
    strict: true,
    type: "object",
  },
  GROQ_SPAN_LABELING_JSON_SCHEMA: { name: "groq-span", type: "object" },
}));

vi.mock("@llm/span-labeling/schemas/GeminiSchema", () => ({
  GEMINI_JSON_SCHEMA: { name: "gemini-span", type: "object" },
}));

import { buildCapabilityOptions } from "../schemas/types";
import { getVideoOptimizationSchema } from "../schemas/videoOptimization";

describe("provider schema factories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buildCapabilityOptions applies fallback operation and provider mapping", () => {
    const options = buildCapabilityOptions(
      { provider: "groq", model: "m1" },
      "fallback_op",
    );

    expect(options).toEqual({
      operation: "fallback_op",
      model: "m1",
      client: "groq",
    });
  });

  it("returns an object-wrapper schema for video optimization", () => {
    // The enhancement and custom-suggestion cases moved to
    // services/enhancement/providers/__tests__ when those factories became a
    // profile table; video optimization still resolves via capabilities.
    capabilitiesForMock.mockReturnValue({
      provider: "groq",
      capabilities: { strictJsonSchema: false },
    });

    const video = getVideoOptimizationSchema();

    expect(video.type).toBe("object");
    expect(video.required).toContain("technical_specs");
  });
});
