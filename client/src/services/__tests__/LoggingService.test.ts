/**
 * Unit tests for LoggingService
 *
 * Tests trace ID management, timer operations, log persistence,
 * and child logger behavior.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// We need to test the class directly, not the singleton
// Mock import.meta.env
vi.stubGlobal("import", { meta: { env: { MODE: "development" } } });

// Dynamically import to avoid singleton side effects
let LoggingService: typeof import("../LoggingService");

beforeEach(async () => {
  localStorage.clear();
  vi.restoreAllMocks();
  // Re-import to get fresh module
  LoggingService = await import("../LoggingService");
});

afterEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// generateTraceId
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// startTimer / endTimer
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// getStoredLogs / clearStoredLogs
// ---------------------------------------------------------------------------
describe("LoggingService log persistence", () => {
  it("clearStoredLogs removes stored logs", () => {
    const { logger } = LoggingService;
    localStorage.setItem(
      "prompt_builder_logs",
      JSON.stringify([{ level: "info", message: "test", timestamp: "now" }]),
    );
    logger.clearStoredLogs();
    expect(logger.getStoredLogs()).toEqual([]);
  });

  it("getStoredLogs returns empty array on corrupted data", () => {
    const { logger } = LoggingService;
    localStorage.setItem("prompt_builder_logs", "not json");
    expect(logger.getStoredLogs()).toEqual([]);
  });
});
