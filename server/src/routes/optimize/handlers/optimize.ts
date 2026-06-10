import type { Request, Response } from "express";
import { logger } from "@infrastructure/Logger";
import { extractUserId } from "@utils/requestHelpers";
import { normalizeGenerationParams } from "@routes/optimize/normalizeGenerationParams";
import type { OptimizeTelemetryService } from "@services/observability/OptimizeTelemetryService";
import type { PromptOptimizationServiceContract } from "../types";
import { promptSchema } from "@config/schemas/promptSchemas";
// Response wire format defined in shared/schemas/optimization.schemas.ts —
// client validates against OptimizeResponseSchema at the fetch boundary.
import {
  normalizeContext,
  normalizeLockedSpans,
  normalizeTargetModel,
} from "./requestNormalization";

export const createOptimizeHandler =
  (
    promptOptimizationService: PromptOptimizationServiceContract,
    optimizeTelemetryService: OptimizeTelemetryService,
  ) =>
  async (req: Request, res: Response): Promise<Response | void> => {
    const startTime = Date.now();
    const requestId = req.id || "unknown";
    const userId = extractUserId(req);
    const operation = "optimize";
    const trace = optimizeTelemetryService.startOptimizeTrace(
      requestId,
      userId,
    );

    const parsed = promptSchema.safeParse(req.body);
    if (!parsed.success) {
      logger.warn("Optimize request validation failed", {
        operation,
        requestId,
        userId,
        issues: parsed.error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
      return res.status(400).json({
        success: false,
        error: "Invalid request",
        details: parsed.error.issues,
      });
    }

    const {
      prompt,
      mode,
      targetModel,
      context,
      brainstormContext,
      generationParams,
      skipCache,
      lockedSpans,
      startImage,
      sourcePrompt,
    } = parsed.data;
    const normalizedTargetModel = normalizeTargetModel(targetModel);
    const normalizedContext = normalizeContext(context);
    const normalizedLockedSpans = normalizeLockedSpans(lockedSpans);
    if (
      typeof targetModel === "string" &&
      normalizedTargetModel &&
      targetModel.trim().toLowerCase() !== normalizedTargetModel
    ) {
      logger.warn("Deprecated targetModel alias normalized", {
        operation,
        requestId,
        userId,
        requestedTargetModel: targetModel,
        normalizedTargetModel,
      });
    }

    const { normalizedGenerationParams, error } = normalizeGenerationParams({
      generationParams,
      operation,
      requestId,
      ...(normalizedTargetModel ? { targetModel: normalizedTargetModel } : {}),
      ...(userId ? { userId } : {}),
    });
    if (error) {
      return res
        .status(error.status)
        .json({ success: false, error: error.error, details: error.details });
    }

    logger.info("Optimize request received", {
      operation,
      requestId,
      userId,
      promptLength: prompt?.length || 0,
      mode,
      targetModel: normalizedTargetModel,
      hasContext: !!normalizedContext,
      hasBrainstormContext: !!brainstormContext,
      generationParamCount: generationParams
        ? Object.keys(generationParams).length
        : 0,
      skipCache: !!skipCache,
      lockedSpanCount: normalizedLockedSpans.length,
      hasStartImage: typeof startImage === "string" && startImage.length > 0,
    });

    const requestAbortController = new AbortController();
    const abortInFlight = (): void => {
      if (!requestAbortController.signal.aborted) {
        requestAbortController.abort();
      }
    };

    // Do NOT listen on req "close": since Node 16, IncomingMessage emits
    // "close" once the request has been fully consumed (express.json reads
    // the body before this handler runs), not when the client disconnects —
    // wiring abort to it killed every request milliseconds in. Disconnects
    // are detected via res "close" while the response is still unwritten.
    const abortIfDisconnected = (): void => {
      if (!res.writableEnded) {
        abortInFlight();
      }
    };

    req.once("aborted", abortInFlight);
    res.once("close", abortIfDisconnected);
    res.once("finish", abortInFlight);

    try {
      const optimizeRequest = {
        prompt,
        mode,
        context: normalizedContext,
        brainstormContext: brainstormContext ?? null,
        generationParams: normalizedGenerationParams,
        skipCache,
        lockedSpans: normalizedLockedSpans,
        ...(normalizedTargetModel
          ? { targetModel: normalizedTargetModel }
          : {}),
        ...(typeof startImage === "string" && startImage.length > 0
          ? { startImage }
          : {}),
        ...(typeof sourcePrompt === "string" && sourcePrompt.length > 0
          ? { sourcePrompt }
          : {}),
        signal: requestAbortController.signal,
        trace,
      };
      const result = await promptOptimizationService.optimize(optimizeRequest);

      if (res.headersSent || res.writableEnded) {
        logger.warn(
          "Optimize request completed after response already closed; skipping payload write",
          {
            operation,
            requestId,
            userId,
            duration: Date.now() - startTime,
          },
        );
        return;
      }

      logger.info("Optimize request completed", {
        operation,
        requestId,
        userId,
        duration: Date.now() - startTime,
        inputLength: prompt?.length || 0,
        outputLength: result.prompt?.length || 0,
      });

      const responseMetadata = {
        ...(result.metadata || {}),
        ...(normalizedTargetModel
          ? { normalizedModelId: normalizedTargetModel }
          : {}),
        intentLockPassed:
          typeof result.metadata?.intentLockPassed === "boolean"
            ? result.metadata.intentLockPassed
            : true,
      };

      const responsePayload = {
        prompt: result.prompt,
        optimizedPrompt: result.prompt,
        ...(result.artifactKey ? { artifactKey: result.artifactKey } : {}),
        ...(result.compilation ? { compilation: result.compilation } : {}),
        metadata: responseMetadata,
      };

      res.setHeader("X-Response-Version", "2");
      return res.json({
        success: true,
        // DEPRECATED: `data` envelope duplicates top-level fields.
        // Clients should read top-level fields directly (prompt, metadata, etc.).
        // This wrapper will be removed in a future version.
        data: responsePayload,
        ...responsePayload,
      });
    } catch (error: unknown) {
      if (res.headersSent || res.writableEnded) {
        logger.warn(
          "Optimize request failed after response already closed; suppressing rethrow",
          {
            operation,
            requestId,
            userId,
            duration: Date.now() - startTime,
          },
        );
        return;
      }

      const errorInstance =
        error instanceof Error ? error : new Error(String(error));
      logger.error("Optimize request failed", errorInstance, {
        operation,
        requestId,
        userId,
        duration: Date.now() - startTime,
        promptLength: prompt?.length || 0,
      });
      throw error;
    } finally {
      req.removeListener("aborted", abortInFlight);
      res.removeListener("close", abortIfDisconnected);
      res.removeListener("finish", abortInFlight);
    }
  };
