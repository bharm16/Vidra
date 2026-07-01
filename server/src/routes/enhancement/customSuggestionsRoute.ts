import type { Router } from "express";
import { logger } from "@infrastructure/Logger";
import { asyncHandler } from "@middleware/asyncHandler";
import { validateRequest } from "@middleware/validateRequest";
import { customSuggestionSchema } from "@config/schemas";
import type { EnhancementService } from "@services/enhancement/EnhancementService";

interface CustomSuggestionsDeps {
  enhancementService: Pick<EnhancementService, "getCustomSuggestions">;
}

export function registerCustomSuggestionsRoute(
  router: Router,
  { enhancementService }: CustomSuggestionsDeps,
): void {
  router.post(
    "/enhancement/custom-suggestions",
    validateRequest(customSuggestionSchema),
    asyncHandler(async (req, res) => {
      const startTime = Date.now();
      const requestId = req.id || "unknown";
      const operation = "get-custom-suggestions";

      const {
        highlightedText,
        customRequest,
        fullPrompt,
        contextBefore,
        contextAfter,
        metadata,
      } = req.body;

      logger.info("Custom suggestions request received", {
        operation,
        requestId,
        highlightedTextLength: highlightedText?.length || 0,
        customRequestLength: customRequest?.length || 0,
        fullPromptLength: fullPrompt?.length || 0,
      });

      try {
        const result = await enhancementService.getCustomSuggestions({
          highlightedText,
          customRequest,
          fullPrompt,
          contextBefore,
          contextAfter,
          metadata,
        });

        logger.info("Custom suggestions request completed", {
          operation,
          requestId,
          duration: Date.now() - startTime,
          suggestionCount: result.suggestions?.length || 0,
        });

        res.json(result);
      } catch (error) {
        logger.error(
          "Custom suggestions request failed",
          error instanceof Error ? error : new Error(String(error)),
          {
            operation,
            requestId,
            duration: Date.now() - startTime,
          },
        );
        throw error;
      }
    }),
  );
}
