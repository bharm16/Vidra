import express, { type Router } from "express";
import { asyncHandler } from "@middleware/asyncHandler";
import { logger } from "@infrastructure/Logger";
import type { ApiResponse } from "@shared/types/api";
import {
  getCapabilities,
  listModels,
  listProviders,
  resolveModelId,
  resolveProviderForModel,
} from "@services/capabilities";

/** Cache-Control for deterministic, user-agnostic capability data. */
const CACHE_1H = "public, max-age=3600";
const CACHE_1D = "public, max-age=86400";

export function createCapabilitiesRoutes(): Router {
  const router = express.Router();

  router.get(
    "/providers",
    asyncHandler(async (_req, res) => {
      res.setHeader("Cache-Control", CACHE_1D);
      const data = { providers: listProviders() };
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    }),
  );

  router.get(
    "/registry",
    asyncHandler(async (_req, res) => {
      const { getCapabilitiesRegistry } = await import(
        "@services/capabilities"
      );
      res.setHeader("Cache-Control", CACHE_1D);
      const data = getCapabilitiesRegistry();
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    }),
  );

  router.get(
    "/models",
    asyncHandler(async (req, res) => {
      const provider =
        typeof req.query.provider === "string" ? req.query.provider : "";
      if (!provider) {
        res.status(400).json({
          success: false,
          error: "provider is required",
        } satisfies ApiResponse<never>);
        return;
      }
      res.setHeader("Cache-Control", CACHE_1D);
      const data = { provider, models: listModels(provider) };
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    }),
  );

  router.get(
    "/capabilities",
    asyncHandler(async (req, res) => {
      const requestedProvider =
        typeof req.query.provider === "string" && req.query.provider.trim()
          ? req.query.provider.trim()
          : "generic";
      const model =
        typeof req.query.model === "string" && req.query.model.trim()
          ? req.query.model.trim()
          : "auto";

      const resolvedModel = resolveModelId(model) ?? model;
      const modelCandidates =
        resolvedModel === model ? [model] : [model, resolvedModel];
      const getSchema = (provider: string) =>
        modelCandidates
          .map((candidateModel) => getCapabilities(provider, candidateModel))
          .find((candidate): candidate is NonNullable<typeof candidate> =>
            Boolean(candidate),
          ) ?? null;

      let schema = getSchema(requestedProvider);
      let resolvedProvider: string | null = null;

      if (!schema && requestedProvider === "generic" && model !== "auto") {
        resolvedProvider = resolveProviderForModel(resolvedModel);
        if (resolvedProvider) {
          schema = getSchema(resolvedProvider);
        }
      }

      if (!schema) {
        logger.warn("Capabilities schema not found", {
          provider: requestedProvider,
          model,
          resolvedModel,
          resolvedProvider,
        });
        res.status(404).json({
          success: false,
          error: "Capabilities not found",
          details: `provider=${requestedProvider}; model=${model}; resolvedModel=${resolvedModel}; resolvedProvider=${resolvedProvider ?? "none"}`,
        } satisfies ApiResponse<never>);
        return;
      }

      res.setHeader("Cache-Control", CACHE_1H);
      res.json({
        success: true,
        data: schema,
      } satisfies ApiResponse<typeof schema>);
    }),
  );

  return router;
}
