import { describe, expect, it, vi } from "vitest";
import { PromptContext } from "../PromptContext";

describe("PromptContext", () => {
  it("serializes and deserializes context data via toJSON/fromJSON", () => {
    vi.spyOn(Date, "now").mockReturnValue(1735689600000);

    const original = new PromptContext(
      {
        subject: "Hero",
        location: "City street",
      },
      {
        format: "concise",
        technicalParams: { fps: 24 },
        validationScore: 0.9,
        history: [{ version: 1 }],
      },
    );

    const serialized = original.toJSON();
    const restored = PromptContext.fromJSON(serialized);

    expect(serialized).toEqual({
      version: "1.0.0",
      createdAt: 1735689600000,
      elements: expect.objectContaining({
        subject: "Hero",
        location: "City street",
      }),
      metadata: expect.objectContaining({
        format: "concise",
        technicalParams: { fps: 24 },
        validationScore: 0.9,
      }),
    });

    expect(restored).not.toBeNull();
    expect(restored?.elements).toEqual(original.elements);
    expect(restored?.metadata).toEqual(original.metadata);
    expect(PromptContext.fromJSON(null)).toBeNull();
  });
});
