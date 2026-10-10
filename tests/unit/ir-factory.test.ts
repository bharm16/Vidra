import { describe, it, expect } from "vitest";
import { createEmptyIR } from "@services/video-prompt-analysis/services/analysis/IrFactory";

describe("IrFactory - createEmptyIR", () => {
  describe("core behavior", () => {
    it("returns independent instances (no shared references)", () => {
      const ir1 = createEmptyIR("first");
      const ir2 = createEmptyIR("second");
      ir1.subjects.push({ text: "test", attributes: [] });
      expect(ir2.subjects).toEqual([]);
    });
  });
});
