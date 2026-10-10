import { describe, expect, it } from "vitest";

import {
  CancellationError,
  combineSignals,
  isCancellationError,
} from "@features/prompt-optimizer/utils/signalUtils";

describe("signalUtils", () => {
  describe("isCancellationError", () => {
    it("returns true for CancellationError instances", () => {
      const error = new CancellationError();
      expect(isCancellationError(error)).toBe(true);
    });

    it("returns false for regular Error instances", () => {
      const error = new Error("Regular error");
      expect(isCancellationError(error)).toBe(false);
    });

    it("returns false for non-error values", () => {
      expect(isCancellationError(null)).toBe(false);
      expect(isCancellationError(undefined)).toBe(false);
      expect(isCancellationError("string")).toBe(false);
      expect(isCancellationError(42)).toBe(false);
    });

    it("returns true for error-like objects with isCancellation flag", () => {
      const errorLike = Object.assign(new Error("test"), {
        isCancellation: true,
      });
      expect(isCancellationError(errorLike)).toBe(true);
    });
  });

  describe("combineSignals", () => {
    it("returns a signal that aborts when first input signal aborts", () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      const combined = combineSignals(controller1.signal, controller2.signal);

      expect(combined.aborted).toBe(false);

      controller1.abort("reason1");

      expect(combined.aborted).toBe(true);
      expect(combined.reason).toBe("reason1");
    });

    it("handles pre-aborted signals by returning already aborted signal", () => {
      const controller1 = new AbortController();
      controller1.abort("pre-aborted");

      const controller2 = new AbortController();

      const combined = combineSignals(controller1.signal, controller2.signal);

      expect(combined.aborted).toBe(true);
      expect(combined.reason).toBe("pre-aborted");
    });

    it("works with multiple signals (more than two)", () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();
      const controller3 = new AbortController();

      const combined = combineSignals(
        controller1.signal,
        controller2.signal,
        controller3.signal,
      );

      expect(combined.aborted).toBe(false);

      controller3.abort("third");

      expect(combined.aborted).toBe(true);
      expect(combined.reason).toBe("third");
    });

    it("only aborts once even if multiple signals abort", () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      const combined = combineSignals(controller1.signal, controller2.signal);

      controller1.abort("first");
      controller2.abort("second");

      expect(combined.aborted).toBe(true);
      expect(combined.reason).toBe("first");
    });
  });
});
