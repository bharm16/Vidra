import type { Router } from "express";
import { logger } from "@infrastructure/Logger";
import type { ApiResponse } from "@shared/types/api";
import { asyncHandler } from "@middleware/asyncHandler";
import { validateRequest } from "@middleware/validateRequest";
import { sceneChangeSchema } from "@config/schemas";
import type { SceneChangeDetectionService } from "@services/enhancement/services/SceneChangeDetectionService";

interface SceneChangeDeps {
  sceneDetectionService: Pick<SceneChangeDetectionService, "detectSceneChange">;
}

export function registerSceneChangeRoute(
  router: Router,
  { sceneDetectionService }: SceneChangeDeps,
): void {
  router.post(
    "/enhancement/scene-change",
    validateRequest(sceneChangeSchema),
    asyncHandler(async (req, res) => {
      const startTime = Date.now();
      const requestId = req.id || "unknown";
      const operation = "detect-scene-change";

      const {
        changedField,
        newValue,
        oldValue,
        fullPrompt,
        affectedFields,
        sectionHeading,
        sectionContext,
      } = req.body;

      logger.info("Scene change detection request received", {
        operation,
        requestId,
        changedField,
        hasNewValue: !!newValue,
        hasOldValue: !!oldValue,
        affectedFieldCount: affectedFields?.length || 0,
      });

      try {
        const result = await sceneDetectionService.detectSceneChange({
          changedField,
          newValue,
          oldValue,
          fullPrompt,
          affectedFields,
          sectionHeading,
          sectionContext,
        });

        logger.info("Scene change detection request completed", {
          operation,
          requestId,
          duration: Date.now() - startTime,
          isSceneChange: result?.isSceneChange || false,
        });

        res.json({
          success: true,
          data: result,
        } satisfies ApiResponse<typeof result>);
      } catch (error) {
        logger.error(
          "Scene change detection request failed",
          error instanceof Error ? error : new Error(String(error)),
          {
            operation,
            requestId,
            duration: Date.now() - startTime,
            changedField,
          },
        );
        throw error;
      }
    }),
  );
}
