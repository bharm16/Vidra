import type { Request, Response } from "express";
import { logger } from "@infrastructure/Logger";
import type { ApiResponse } from "@shared/types/api";
import { extractUserId } from "@utils/requestHelpers";
import type { SuggestionsServices } from "./serviceFactory";
import {
  validateCompareRequest,
  validateEvaluateRequest,
  validateSingleEvaluationRequest,
} from "./validators";
import { loadRubrics } from "./rubrics";

export interface SuggestionsHandlers {
  evaluate: (req: Request, res: Response) => Promise<Response | void>;
  evaluateSingle: (req: Request, res: Response) => Promise<Response | void>;
  compare: (req: Request, res: Response) => Promise<Response | void>;
  getRubrics: (req: Request, res: Response) => Response | void;
}

export function createSuggestionsHandlers({
  llmJudge,
}: SuggestionsServices): SuggestionsHandlers {
  return {
    async evaluate(req, res) {
      const startTime = performance.now();
      const validation = validateEvaluateRequest(req.body);

      if (!validation.ok) {
        return res.status(validation.status).json({
          success: false,
          error: validation.error,
          details: validation.message,
        } satisfies ApiResponse<never>);
      }

      const { suggestions, context, rubric } = validation.data;
      const resolvedRubric =
        rubric === "general" || rubric === "video" ? rubric : undefined;
      const operation = "evaluateSuggestions";
      const requestId = req.id;
      const userId = extractUserId(req);

      logger.debug("Starting operation.", {
        operation,
        requestId,
        userId,
        suggestionCount: suggestions.length,
        rubric: resolvedRubric || "auto-detect",
        isVideoPrompt: context.isVideoPrompt,
      });

      const evaluation = await llmJudge.evaluateSuggestions({
        suggestions,
        context,
        ...(resolvedRubric ? { rubricType: resolvedRubric } : {}),
      });

      const responseTime = Math.round(performance.now() - startTime);

      logger.info("Operation completed.", {
        operation,
        requestId,
        userId,
        duration: responseTime,
        overallScore: evaluation.overallScore,
      });

      const data = { evaluation, responseTime };
      return res.json({ success: true, data } satisfies ApiResponse<
        typeof data
      >);
    },

    async evaluateSingle(req, res) {
      const startTime = performance.now();
      const operation = "evaluateSingleSuggestion";
      const requestId = req.id;
      const userId = extractUserId(req);

      const validation = validateSingleEvaluationRequest(req.body);
      if (!validation.ok) {
        return res.status(validation.status).json({
          success: false,
          error: validation.error,
          details: validation.message,
        } satisfies ApiResponse<never>);
      }

      const { suggestion, context, rubric } = validation.data;
      const resolvedRubric =
        rubric === "general" || rubric === "video" ? rubric : undefined;

      logger.debug("Starting operation.", {
        operation,
        requestId,
        userId,
        suggestionLength: suggestion.length,
        rubric: resolvedRubric || "auto-detect",
      });

      const evaluation = await llmJudge.evaluateSingleSuggestion(
        suggestion,
        context,
        resolvedRubric,
      );

      const responseTime = Math.round(performance.now() - startTime);

      logger.info("Operation completed.", {
        operation,
        requestId,
        userId,
        duration: responseTime,
        overallScore: evaluation.overallScore,
      });

      const data = { evaluation, responseTime };
      return res.json({ success: true, data } satisfies ApiResponse<
        typeof data
      >);
    },

    async compare(req, res) {
      const startTime = performance.now();
      const operation = "compareSuggestionSets";
      const requestId = req.id;

      const validation = validateCompareRequest(req.body);
      if (!validation.ok) {
        return res.status(validation.status).json({
          success: false,
          error: validation.error,
          details: validation.message,
        } satisfies ApiResponse<never>);
      }

      const { setA, setB, context, rubric } = validation.data;
      const resolvedRubric =
        rubric === "general" || rubric === "video" ? rubric : undefined;

      logger.debug("Starting operation.", {
        operation,
        requestId,
        setACount: setA.length,
        setBCount: setB.length,
      });

      const comparison = await llmJudge.compareSuggestionSets(
        setA,
        setB,
        context,
        resolvedRubric,
      );

      const responseTime = Math.round(performance.now() - startTime);

      logger.info("Operation completed.", {
        operation,
        requestId,
        duration: responseTime,
        winner: comparison.winner,
        scoreDifference: comparison.scoreDifference,
      });

      const data = { comparison, responseTime };
      return res.json({ success: true, data } satisfies ApiResponse<
        typeof data
      >);
    },

    getRubrics(req, res) {
      const requestId = req.id;
      const operation = "getRubrics";

      logger.debug("Rubrics request received", {
        operation,
        requestId,
      });

      const rubrics = loadRubrics();

      const data = { rubrics };
      return res.json({ success: true, data } satisfies ApiResponse<
        typeof data
      >);
    },
  };
}
