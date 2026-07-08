import { describe, expect, it, vi } from "vitest";
import { FrameVerificationService } from "../FrameVerificationService";
import type { SpanVerdictService } from "../services/SpanVerdictService";
import type { FrameVerificationSpan, SpanVerdict } from "../types";

const SPAN: FrameVerificationSpan = {
  text: "sunlit studio",
  category: "environment.location",
};

const VERDICT: SpanVerdict = {
  span: SPAN,
  verdict: "present",
  confidence: 0.9,
};

const createJudgeStub = (): {
  spanVerdictService: SpanVerdictService;
  judgeMock: ReturnType<typeof vi.fn>;
} => {
  const judgeMock = vi.fn().mockResolvedValue({
    verdicts: [VERDICT],
    model: "gpt-4o-mini",
  });
  return {
    spanVerdictService: { judge: judgeMock } as unknown as SpanVerdictService,
    judgeMock,
  };
};

describe("FrameVerificationService", () => {
  it("delegates to the span verdict service and reports timing", async () => {
    const { spanVerdictService, judgeMock } = createJudgeStub();
    const service = new FrameVerificationService(spanVerdictService);

    const result = await service.verify({
      image: "data:image/png;base64,Zg==",
      spans: [SPAN],
    });

    expect(judgeMock).toHaveBeenCalledWith("data:image/png;base64,Zg==", [
      SPAN,
    ]);
    expect(result.verdicts).toEqual([VERDICT]);
    expect(result.model).toBe("gpt-4o-mini");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("rejects requests without an image", async () => {
    const { spanVerdictService } = createJudgeStub();
    const service = new FrameVerificationService(spanVerdictService);

    await expect(service.verify({ image: "", spans: [SPAN] })).rejects.toThrow(
      "requires an image",
    );
  });

  it("rejects requests without spans", async () => {
    const { spanVerdictService } = createJudgeStub();
    const service = new FrameVerificationService(spanVerdictService);

    await expect(
      service.verify({ image: "data:image/png;base64,Zg==", spans: [] }),
    ).rejects.toThrow("at least one span");
  });
});
