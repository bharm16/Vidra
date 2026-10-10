import { describe, expect, it, vi } from "vitest";
import { PromptContext } from "@/utils/PromptContext/PromptContext";

vi.mock("@/services/LoggingService", () => ({
  logger: { child: () => ({ warn: vi.fn() }) },
}));

describe("Saved prompt context", () => {
  it("preserves historical direction and metadata through storage serialization", () => {
    const context = new PromptContext(
      {
        subject: "Cat",
        action: "sitting on a windowsill",
        location: "kitchen",
      },
      {
        format: "detailed",
        technicalParams: { fps: 24 },
        validationScore: 22,
        history: [{ field: "location", replacement: "kitchen" }],
      },
    );
    const persisted = JSON.parse(JSON.stringify(context.toJSON()));
    const restored = PromptContext.fromJSON(persisted);

    expect(restored?.toJSON()).toMatchObject({
      elements: context.elements,
      metadata: context.metadata,
    });
  });
});
