import type { Router } from "express";
import { logger } from "@infrastructure/Logger";
import { asyncHandler } from "@middleware/asyncHandler";
import { validateRequest } from "@middleware/validateRequest";
import { PerformanceMonitor } from "@middleware/performanceMonitor";
import { coherenceCheckSchema } from "@config/schemas";
import type { CoherenceCheckResult } from "@shared/types/coherence";

interface CoherenceCheckDeps {
  promptCoherenceService: {
    checkCoherence: (
      payload: Record<string, unknown>,
    ) => Promise<CoherenceCheckResult>;
  };
  perfMonitor: PerformanceMonitor;
}

export function registerCoherenceCheckRoute(
  router: Router,
  { promptCoherenceService, perfMonitor }: CoherenceCheckDeps,
): void {
  router.post(
    "/enhancement/prompt-coherence",
    perfMonitor.trackRequest.bind(perfMonitor),
    validateRequest(coherenceCheckSchema),
    asyncHandler(async (req, res) => {
      const startTime = Date.now();
      const requestId = req.id || "unknown";
      const operation = "check-prompt-coherence";

      const { beforePrompt, afterPrompt, appliedChange, spans } = req.body;

      logger.info("Coherence check request received", {
        operation,
        requestId,
        beforeLength: beforePrompt?.length || 0,
        afterLength: afterPrompt?.length || 0,
        spanCount: spans?.length || 0,
        appliedSpanId: appliedChange?.spanId || null,
      });

      if (req.perfMonitor) {
        req.perfMonitor.start("service_call");
      }

      try {
        const result = await promptCoherenceService.checkCoherence({
          beforePrompt,
          afterPrompt,
          appliedChange,
          spans,
        });

        if (req.perfMonitor) {
          req.perfMonitor.end("service_call");
          req.perfMonitor.addMetadata(
            "conflictCount",
            result?.conflicts?.length || 0,
          );
          req.perfMonitor.addMetadata(
            "harmonizationCount",
            result?.harmonizations?.length || 0,
          );
        }

        logger.info("Coherence check request completed", {
          operation,
          requestId,
          duration: Date.now() - startTime,
          conflictCount: result?.conflicts?.length || 0,
          harmonizationCount: result?.harmonizations?.length || 0,
        });

        res.json(result);
      } catch (error) {
        logger.error(
          "Coherence check request failed",
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
