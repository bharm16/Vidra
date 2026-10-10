/**
 * Property-based tests for SuggestionRequestManager
 *
 * Tests the following correctness properties:
 * - Property 1: Cancellation Prevents State Updates
 * - Property 2: Deduplication Prevents Redundant Requests
 * - Property 4: Debounce Coalesces Rapid Selections
 *
 * @module SuggestionRequestManager.property.test
 */

/**
 * Property-based tests for SuggestionRequestManager
 *
 * Tests the following correctness properties:
 * - Property 1: Cancellation Prevents State Updates
 * - Property 2: Deduplication Prevents Redundant Requests
 * - Property 4: Debounce Coalesces Rapid Selections
 *
 * @module SuggestionRequestManager.property.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

import { SuggestionRequestManager } from "@features/prompt-optimizer/utils/SuggestionRequestManager";
import { CancellationError } from "@features/prompt-optimizer/utils/signalUtils";

describe("SuggestionRequestManager Property Tests", () => {
  /**
   * Property 1: Cancellation Prevents State Updates
   *
   * For any in-flight suggestion request that is cancelled (due to a new selection),
   * the cancelled request's response SHALL never update the suggestions state,
   * regardless of when the response arrives.
   *
   * **Feature: ai-suggestions-fixes, Property 1: Cancellation Prevents State Updates**
   * **Validates: Requirements 1.1, 1.2, 1.3**
   */
  describe("Property 1: Cancellation Prevents State Updates", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("cancelled requests should throw CancellationError and not resolve with data", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate two distinct non-empty strings
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter((s) => s.trim().length > 0),
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter((s) => s.trim().length > 0),
          async (text1, text2) => {
            // Ensure texts are different
            const firstText = text1;
            const secondText = text1 === text2 ? text2 + "_diff" : text2;

            const manager = new SuggestionRequestManager({
              debounceMs: 10,
              timeoutMs: 5000,
            });
            const stateUpdates: string[] = [];
            let firstRequestCompleted = false;

            // First request - will be cancelled when second request starts
            const firstPromise = manager
              .scheduleRequest(firstText, async (signal) => {
                // Simulate async work that takes longer than debounce
                await new Promise((resolve) => setTimeout(resolve, 50));
                // Only update state if not aborted
                if (!signal.aborted) {
                  stateUpdates.push(`result_for_${firstText}`);
                  firstRequestCompleted = true;
                }
                return `result_for_${firstText}`;
              })
              .catch((e) => {
                if (e instanceof CancellationError) {
                  return "CANCELLED";
                }
                throw e;
              });

            // Advance past first debounce to start the request
            await vi.advanceTimersByTimeAsync(15);

            // Second request - this should cancel the first
            const secondPromise = manager
              .scheduleRequest(secondText, async () => {
                stateUpdates.push(`result_for_${secondText}`);
                return `result_for_${secondText}`;
              })
              .catch((e) => {
                if (e instanceof CancellationError) {
                  return "CANCELLED";
                }
                throw e;
              });

            // Advance timers to complete everything
            await vi.advanceTimersByTimeAsync(100);

            const firstResult = await firstPromise;
            const secondResult = await secondPromise;

            // First request should have been cancelled
            expect(firstResult).toBe("CANCELLED");

            // Second request should succeed
            expect(secondResult).toBe(`result_for_${secondText}`);

            // Only the second request's state update should have occurred
            expect(stateUpdates).toContain(`result_for_${secondText}`);

            // First request should NOT have completed (it was cancelled)
            expect(firstRequestCompleted).toBe(false);

            manager.dispose();
          },
        ),
        { numRuns: 100 },
      );
    });

    it("cancellation during debounce should prevent request execution", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter((s) => s.trim().length > 0),
          async (text) => {
            const manager = new SuggestionRequestManager({
              debounceMs: 100,
              timeoutMs: 5000,
            });
            let requestExecuted = false;

            const promise = manager
              .scheduleRequest(text, async () => {
                requestExecuted = true;
                return "result";
              })
              .catch((e) => {
                if (e instanceof CancellationError) {
                  return "CANCELLED";
                }
                throw e;
              });

            // Cancel before debounce completes (at 50ms, debounce is 100ms)
            await vi.advanceTimersByTimeAsync(50);
            manager.cancelCurrentRequest();

            // Advance past debounce
            await vi.advanceTimersByTimeAsync(100);

            const result = await promise;

            // Request should be cancelled
            expect(result).toBe("CANCELLED");

            // Request function should never have been called
            expect(requestExecuted).toBe(false);

            manager.dispose();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 2: Deduplication Prevents Redundant Requests
   *
   * For any highlighted text that is currently being fetched, subsequent requests
   * for the same text SHALL be skipped. For any different highlighted text,
   * a new request SHALL be allowed to proceed (after cancelling the previous).
   *
   * **Feature: ai-suggestions-fixes, Property 2: Deduplication Prevents Redundant Requests**
   * **Validates: Requirements 2.1, 2.3**
   */
  describe("Property 2: Deduplication Prevents Redundant Requests", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("isRequestInFlight returns true for same dedupKey during request", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .string({ minLength: 1, maxLength: 100 })
            .filter((s) => s.trim().length > 0),
          async (dedupKey) => {
            const manager = new SuggestionRequestManager({
              debounceMs: 10,
              timeoutMs: 5000,
            });

            // Start a request
            const promise = manager
              .scheduleRequest(dedupKey, async () => {
                return "result";
              })
              .catch(() => null);

            // Immediately after scheduling, the dedup key should be set
            expect(manager.isRequestInFlight(dedupKey)).toBe(true);

            // Different key should return false
            expect(manager.isRequestInFlight(dedupKey + "_different")).toBe(
              false,
            );

            // Complete the request
            await vi.advanceTimersByTimeAsync(20);
            await promise;

            // After completion, should no longer be in-flight
            expect(manager.isRequestInFlight(dedupKey)).toBe(false);

            manager.dispose();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 4: Debounce Coalesces Rapid Selections (Trailing Edge)
   *
   * For any sequence of N text selections within a 150ms window, exactly one
   * API request SHALL be made (for the last selection), after the 150ms debounce
   * window closes. All intermediate selections SHALL be discarded.
   *
   * **Feature: ai-suggestions-fixes, Property 4: Debounce Coalesces Rapid Selections**
   * **Validates: Requirements 4.1, 4.2**
   */
  describe("Property 4: Debounce Coalesces Rapid Selections", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("rapid selections within debounce window result in single request for last selection", async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate array of 2-10 unique non-empty strings
          fc
            .uniqueArray(
              fc
                .string({ minLength: 1, maxLength: 20 })
                .filter((s) => s.trim().length > 0),
              { minLength: 2, maxLength: 10 },
            )
            .filter((arr) => arr.length >= 2),
          fc.integer({ min: 50, max: 200 }),
          async (uniqueSelections, debounceMs) => {
            const manager = new SuggestionRequestManager({
              debounceMs,
              timeoutMs: 5000,
            });
            const executedSelections: string[] = [];

            // Schedule all selections rapidly (within debounce window)
            const promises: Promise<string | null>[] = [];
            for (const selection of uniqueSelections) {
              promises.push(
                manager
                  .scheduleRequest(selection, async () => {
                    executedSelections.push(selection);
                    return selection;
                  })
                  .catch((e) => {
                    if (e instanceof CancellationError) return null;
                    throw e;
                  }),
              );
              // Small delay but still within debounce window (1ms between each)
              await vi.advanceTimersByTimeAsync(1);
            }

            // Advance past debounce to trigger the final request
            await vi.advanceTimersByTimeAsync(debounceMs + 10);
            await Promise.all(promises);

            // Only the last selection should have been executed
            const lastSelection = uniqueSelections[uniqueSelections.length - 1];
            expect(executedSelections).toEqual([lastSelection]);

            manager.dispose();
          },
        ),
        { numRuns: 100 },
      );
    });

    it("selections after debounce window trigger new requests", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .string({ minLength: 1, maxLength: 30 })
            .filter((s) => s.trim().length > 0),
          fc
            .string({ minLength: 1, maxLength: 30 })
            .filter((s) => s.trim().length > 0),
          async (firstSelection, secondSelection) => {
            const debounceMs = 50;
            const manager = new SuggestionRequestManager({
              debounceMs,
              timeoutMs: 5000,
            });
            const executedSelections: string[] = [];

            // First selection
            const firstPromise = manager
              .scheduleRequest(firstSelection, async () => {
                executedSelections.push(firstSelection);
                return firstSelection;
              })
              .catch((e) => {
                if (e instanceof CancellationError) return null;
                throw e;
              });

            // Wait for debounce to complete and request to execute
            await vi.advanceTimersByTimeAsync(debounceMs + 10);
            await firstPromise;

            // Second selection after debounce window
            const secondPromise = manager
              .scheduleRequest(secondSelection, async () => {
                executedSelections.push(secondSelection);
                return secondSelection;
              })
              .catch((e) => {
                if (e instanceof CancellationError) return null;
                throw e;
              });

            await vi.advanceTimersByTimeAsync(debounceMs + 10);
            await secondPromise;

            // Both selections should have executed (they were in separate debounce windows)
            expect(executedSelections).toContain(firstSelection);
            expect(executedSelections).toContain(secondSelection);
            expect(executedSelections.length).toBe(2);

            manager.dispose();
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
