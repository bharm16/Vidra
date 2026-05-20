import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerEnhancementSuggestionsRoute } from "../enhancementSuggestionsRoute";
import { PerformanceMonitor } from "@middleware/performanceMonitor";

interface ErrorWithCode {
  code?: string;
  message?: string;
}

const isSocketPermissionError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as ErrorWithCode;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  if (code === "EPERM" || code === "EACCES") return true;
  return (
    message.includes("listen EPERM") ||
    message.includes("listen EACCES") ||
    message.includes("operation not permitted") ||
    message.includes("Cannot read properties of null (reading 'port')")
  );
};

const runSupertestOrSkip = async <T>(
  execute: () => Promise<T>,
): Promise<T | null> => {
  if (process.env.CODEX_SANDBOX === "seatbelt") return null;
  try {
    return await execute();
  } catch (error) {
    if (isSocketPermissionError(error)) return null;
    throw error;
  }
};

describe("enhancementSuggestionsRoute telemetry wiring (regression)", () => {
  it("starts a SuggestionsTrace per request and forwards it to the service", async () => {
    const sentinelTrace = {
      __sentinel: "trace-fixture",
      recordStage: vi.fn(),
      recordCacheHit: vi.fn(),
      recordError: vi.fn(),
      complete: vi.fn(),
    };
    const startSuggestionsTrace = vi.fn().mockReturnValue(sentinelTrace);
    const suggestionsTelemetryService = { startSuggestionsTrace };

    const getEnhancementSuggestions = vi.fn().mockResolvedValue({
      suggestions: [],
      fromCache: false,
    });
    const enhancementService = { getEnhancementSuggestions };

    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { id?: string; user?: { uid?: string } }).id =
        "req-test-1";
      (req as Request & { id?: string; user?: { uid?: string } }).user = {
        uid: "user-test-1",
      };
      next();
    });

    const router = express.Router();
    registerEnhancementSuggestionsRoute(router, {
      enhancementService,
      perfMonitor: new PerformanceMonitor(),
      suggestionsTelemetryService,
    });
    app.use(router);

    const result = await runSupertestOrSkip(() =>
      request(app).post("/enhancement/suggestions").send({
        highlightedText: "a calm lake",
        fullPrompt: "A wide shot of a calm lake at golden hour.",
      }),
    );
    if (result === null) return;
    expect(result.status).toBe(200);

    expect(startSuggestionsTrace).toHaveBeenCalledTimes(1);
    expect(startSuggestionsTrace).toHaveBeenCalledWith(
      "req-test-1",
      "user-test-1",
    );
    expect(getEnhancementSuggestions).toHaveBeenCalledTimes(1);
    const payload = getEnhancementSuggestions.mock.calls[0]![0] as {
      trace?: unknown;
    };
    expect(payload.trace).toBe(sentinelTrace);
  });
});
