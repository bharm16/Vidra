/**
 * Unit tests for PredictiveCacheService
 *
 * Tests pattern tracking, prediction generation, similarity calculation,
 * history management, and pre-warm flow.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PredictiveCacheService } from "../PredictiveCacheService";

describe("PredictiveCacheService", () => {
  let service: PredictiveCacheService;
  const originalRequestIdleCallback = globalThis.requestIdleCallback;

  beforeEach(() => {
    service = new PredictiveCacheService({
      enabled: true,
      maxHistorySize: 10,
      minFrequency: 2,
      predictionWindow: 5,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalRequestIdleCallback === undefined) {
      delete (
        globalThis as { requestIdleCallback?: typeof requestIdleCallback }
      ).requestIdleCallback;
      return;
    }

    globalThis.requestIdleCallback = originalRequestIdleCallback;
  });

  // ---------------------------------------------------------------------------
  // Disabled service - error/guard cases
  // ---------------------------------------------------------------------------
  describe("when disabled", () => {
    it("does not record requests", () => {
      const disabled = new PredictiveCacheService({ enabled: false });
      disabled.recordRequest({ text: "test" });
      expect(disabled.getStats().totalRequests).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // recordRequest
  // ---------------------------------------------------------------------------
  describe("recordRequest", () => {
    it("limits history to maxHistorySize", () => {
      for (let i = 0; i < 15; i++) {
        service.recordRequest({ text: `prompt ${i}` });
      }
      expect(service.getStats().historySize).toBe(10);
    });
  });

  // ---------------------------------------------------------------------------
  // getPredictions
  // ---------------------------------------------------------------------------
  describe("getPredictions", () => {
    it("returns empty when history has fewer than 2 entries", () => {
      service.recordRequest({ text: "only one" });
      expect(service.getPredictions()).toEqual([]);
    });

    it("returns frequent patterns when frequency meets minFrequency", () => {
      service.recordRequest({ text: "repeated prompt" });
      service.recordRequest({ text: "other prompt" });
      service.recordRequest({ text: "repeated prompt" });
      const predictions = service.getPredictions();
      const frequentPrediction = predictions.find(
        (p) => p.text === "repeated prompt",
      );
      expect(frequentPrediction).toBeDefined();
      expect(frequentPrediction?.reason).toBe("frequent_pattern");
    });

    it("does not return patterns below minFrequency as frequent_pattern", () => {
      service.recordRequest({ text: "one time prompt" });
      service.recordRequest({ text: "another one time" });
      const predictions = service.getPredictions();
      const frequentPredictions = predictions.filter(
        (p) => p.reason === "frequent_pattern",
      );
      expect(frequentPredictions).toHaveLength(0);
    });

    it("returns at most 5 predictions", () => {
      for (let i = 0; i < 20; i++) {
        service.recordRequest({ text: `pattern ${i % 5}` });
        service.recordRequest({ text: `pattern ${i % 5}` });
      }
      expect(service.getPredictions().length).toBeLessThanOrEqual(5);
    });

    it("returns similar_pattern prediction for highly similar recent text", () => {
      const similarService = new PredictiveCacheService({
        enabled: true,
        minFrequency: 10,
      });

      similarService.recordRequest({
        text: "bright red apple on wooden table",
      });
      similarService.recordRequest({
        text: "bright red apple on wooden table now",
      });

      const predictions = similarService.getPredictions();
      expect(predictions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            text: "bright red apple on wooden table",
            reason: "similar_pattern",
          }),
        ]),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // recordPredictionHit
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // getStats
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // clear
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // preWarmCache
  // ---------------------------------------------------------------------------
  describe("preWarmCache", () => {
    it("does not call fetchFunction when no predictions exist", async () => {
      const fetchFn = vi.fn();
      await service.preWarmCache(fetchFn);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("uses timeout fallback when requestIdleCallback is unavailable", async () => {
      vi.useFakeTimers();
      delete (
        globalThis as { requestIdleCallback?: typeof requestIdleCallback }
      ).requestIdleCallback;

      const fetchFn = vi.fn().mockResolvedValue({});
      service.recordRequest({ text: "fallback idle" });
      service.recordRequest({ text: "other" });
      service.recordRequest({ text: "fallback idle" });

      const preWarmPromise = service.preWarmCache(fetchFn);
      await vi.advanceTimersByTimeAsync(1000);
      await preWarmPromise;

      expect(fetchFn).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });
});
