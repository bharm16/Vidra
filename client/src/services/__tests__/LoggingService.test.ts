import { afterEach, describe, expect, it, vi } from "vitest";

async function loadLogger(
  env: Record<string, string>,
): Promise<(typeof import("../LoggingService"))["logger"]> {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  return (await import("../LoggingService")).logger;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("LoggingService", () => {
  it("writes nothing outside development unless debug logging is on", async () => {
    const logger = await loadLogger({ MODE: "production", VITE_DEBUG_LOGGING: "" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    logger.error("hidden");

    expect(error).not.toHaveBeenCalled();
  });

  it("skips levels below VITE_LOG_LEVEL", async () => {
    const logger = await loadLogger({ VITE_DEBUG_LOGGING: "true", VITE_LOG_LEVEL: "warn" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    logger.debug("debug");
    logger.info("info");
    logger.warn("warn", { attempt: 2 });

    expect(log).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("warn", { attempt: 2 });
  });

  it("prefixes a child's messages with its context and keeps error details", async () => {
    const logger = await loadLogger({ VITE_DEBUG_LOGGING: "true", VITE_LOG_LEVEL: "debug" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    logger.child("Upload").error("Failed", new TypeError("bad file"), { size: 3 });

    expect(error).toHaveBeenCalledWith(
      "[Upload] Failed",
      expect.objectContaining({ errorName: "TypeError", errorMessage: "bad file", size: 3 }),
    );
  });
});
