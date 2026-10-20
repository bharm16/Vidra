import type { Router } from "express";
import { logger } from "@infrastructure/Logger";
import type { ApiResponse } from "@shared/types/api";
import { asyncHandler } from "@middleware/asyncHandler";
import { validateRequest } from "@middleware/validateRequest";
import { suggestionSchema } from "@config/schemas";
import { countSuggestions } from "./utils";
import type { EnhancementService } from "@services/enhancement/EnhancementService";

interface EnhancementSuggestionsDeps {
  enhancementService: Pick<EnhancementService, "getEnhancementSuggestions">;
}

export function registerEnhancementSuggestionsRoute(
  router: Router,
  { enhancementService }: EnhancementSuggestionsDeps,
): void {
  router.post(
    "/enhancement/suggestions",
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
        });

        const suggestionCount = countSuggestions(result);

        logger.info("Enhancement suggestions request completed", {
          operation,
          requestId,
          duration: Date.now() - startTime,
          suggestionCount,
          fromCache: result.fromCache ?? false,
          category: highlightedCategory,
        });

        res.json({
          success: true,
          data: result,
        } satisfies ApiResponse<typeof result>);
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
