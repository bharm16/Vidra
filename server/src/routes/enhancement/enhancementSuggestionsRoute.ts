import type { Router } from "express";
import { logger } from "@infrastructure/Logger";
import { asyncHandler } from "@middleware/asyncHandler";
import { validateRequest } from "@middleware/validateRequest";
import { PerformanceMonitor } from "@middleware/performanceMonitor";
import { suggestionSchema } from "@config/schemas";
import { extractUserId } from "@utils/requestHelpers";
import { countSuggestions } from "./utils";
import type {
  SuggestionsTelemetryService,
  SuggestionsTrace,
} from "@services/observability/SuggestionsTelemetryService";

interface EnhancementSuggestionsResult {
  suggestions?: unknown[];
  fromCache?: boolean;
  [key: string]: unknown;
}

interface EnhancementSuggestionsDeps {
  enhancementService: {
    getEnhancementSuggestions: (
      payload: Record<string, unknown> & { trace?: SuggestionsTrace },
    ) => Promise<EnhancementSuggestionsResult>;
  };
  perfMonitor: PerformanceMonitor;
  suggestionsTelemetryService: Pick<
    SuggestionsTelemetryService,
    "startSuggestionsTrace"
  >;
}

export function registerEnhancementSuggestionsRoute(
  router: Router,
  {
    enhancementService,
    perfMonitor,
    suggestionsTelemetryService,
  }: EnhancementSuggestionsDeps,
): void {
  router.post(
    "/enhancement/suggestions",
    perfMonitor.trackRequest.bind(perfMonitor),
    validateRequest(suggestionSchema),
    asyncHandler(async (req, res) => {
      const startTime = Date.now();
      const requestId = req.id || "unknown";
      const operation = "get-enhancement-suggestions";

      const {
        highlightedText,
        contextBefore,
        contextAfter,
        fullPrompt,
        originalUserPrompt,
        brainstormContext,
        highlightedCategory,
        highlightedCategoryConfidence,
        highlightedPhrase,
        allLabeledSpans,
        nearbySpans,
        editHistory,
      } = req.body;
      const debugHeader = req.headers["x-debug"];
      const debugRequested = Array.isArray(debugHeader)
        ? debugHeader.includes("true")
        : debugHeader === "true";
      const debug = debugRequested && process.env.NODE_ENV !== "production";

      logger.info("Enhancement suggestions request received", {
        operation,
        requestId,
        highlightedTextLength: highlightedText?.length || 0,
        fullPromptLength: fullPrompt?.length || 0,
        highlightedCategory,
        highlightedCategoryConfidence,
        hasBrainstormContext: !!brainstormContext,
        spanCount: allLabeledSpans?.length || 0,
      });

      if (req.perfMonitor) {
        req.perfMonitor.start("service_call");
      }

      const userIdRaw = extractUserId(req);
      const userId = userIdRaw === "anonymous" ? null : userIdRaw;
      const trace = suggestionsTelemetryService.startSuggestionsTrace(
        requestId,
        userId,
      );

      try {
        const result = await enhancementService.getEnhancementSuggestions({
          highlightedText,
          contextBefore,
          contextAfter,
          fullPrompt,
          originalUserPrompt,
          brainstormContext,
          highlightedCategory,
          highlightedCategoryConfidence,
          highlightedPhrase,
          allLabeledSpans,
          nearbySpans,
          editHistory,
          debug,
          trace,
        });

        const suggestionCount = countSuggestions(result.suggestions);

        if (req.perfMonitor) {
          req.perfMonitor.end("service_call");
          req.perfMonitor.addMetadata("cacheHit", result.fromCache || false);
          req.perfMonitor.addMetadata("suggestionCount", suggestionCount);
          req.perfMonitor.addMetadata(
            "category",
            highlightedCategory || "unknown",
          );
        }

        logger.info("Enhancement suggestions request completed", {
          operation,
          requestId,
          duration: Date.now() - startTime,
          suggestionCount,
          fromCache: result.fromCache || false,
          category: highlightedCategory,
        });

        res.json(result);
      } catch (error) {
        logger.error(
          "Enhancement suggestions request failed",
          error instanceof Error ? error : new Error(String(error)),
          {
            operation,
            requestId,
            duration: Date.now() - startTime,
            highlightedCategory,
          },
        );
        throw error;
      }
    }),
  );
}
