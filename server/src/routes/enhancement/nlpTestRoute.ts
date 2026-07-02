import type { Router } from "express";
import { logger } from "@infrastructure/Logger";
import type { ApiResponse } from "@shared/types/api";
import { asyncHandler } from "@middleware/asyncHandler";
import { extractSemanticSpans } from "@llm/span-labeling/nlp/NlpSpanService";

export function registerNlpTestRoute(router: Router): void {
  router.get(
    "/enhancement/test-nlp",
    asyncHandler(async (req, res) => {
      const startTime = Date.now();
      const requestId = req.id || "unknown";
      const operation = "test-nlp";

      const { prompt } = req.query;
      const promptValue = Array.isArray(prompt) ? prompt[0] : prompt;

      logger.debug("NLP test request received", {
        operation,
        requestId,
        hasPrompt: !!prompt,
      });

      if (typeof promptValue !== "string" || promptValue.trim().length === 0) {
        logger.warn("NLP test request missing prompt parameter", {
          operation,
          requestId,
        });
        return res
          .status(400)
          .json({ error: "prompt query parameter is required" });
      }

      try {
        const result = await extractSemanticSpans(promptValue);

        logger.info("NLP test request completed", {
          operation,
          requestId,
          duration: Date.now() - startTime,
          spanCount: result?.spans?.length || 0,
        });

        return res.json({
          success: true,
          data: result,
        } satisfies ApiResponse<typeof result>);
      } catch (error) {
        logger.error(
          "NLP test request failed",
          error instanceof Error ? error : new Error(String(error)),
          {
            operation,
            requestId,
            duration: Date.now() - startTime,
            promptLength: promptValue.length,
          },
        );
        throw error;
      }
    }),
  );
}
