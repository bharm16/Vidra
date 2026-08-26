import { z } from "zod";
import type { Asset, AssetListResponse } from "@shared/types/asset";
import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";
import { apiClient } from "@/services/ApiClient";
import {
  AssetSchema,
  AssetListResponseSchema,
  AssetSuggestionSchema,
  AssetImageUploadResponseSchema,
  AssetForGenerationSchema,
  ResolvedPromptSchema,
  TriggerValidationSchema,
} from "./schemas";

import { ApiSuccessResponseSchema } from "@shared/schemas/api.schemas";

const API_BASE = "/api/assets";

async function handleError(
  response: Response,
  fallback: string,
): Promise<never> {
  try {
    const payload = await response.json();
    throw new Error(payload.error || payload.message || fallback);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(fallback);
  }
}

/**
 * Shared plumbing for the JSON asset endpoints. Routes through the apiClient
 * seam — Firebase auth headers, the telemetry-source header, the 401 →
 * sign-in-and-retry transport, backoff, and timeout — while preserving the
 * cookie credentials and the per-endpoint fallback message, then unwraps the
 * `{ success, data }` envelope. `endpoint` is relative to `/assets`.
 */
async function assetRequest<T extends z.ZodTypeAny>(
  endpoint: string,
  schema: T,
  fallback: string,
  init: { method?: string; body?: unknown } = {},
): Promise<z.infer<T>> {
  const response = await apiClient.rawRequest(`/assets${endpoint}`, {
    method: init.method ?? "GET",
    body: init.body,
    fetchOptions: { credentials: "include" },
  });
  if (!response.ok) {
    return handleError(response, fallback);
  }
  const payload = await response.json();
  // The generic ApiSuccessResponseSchema wrapper loses the precise `data` type
  // through `.passthrough()`, so re-assert it at this boundary (same as the
  // shared apiRequest helper).
  return ApiSuccessResponseSchema(schema).parse(payload).data as z.infer<T>;
}

/** Envelope-less variant for endpoints whose success is just a 2xx status. */
async function assetRequestOk(
  endpoint: string,
  fallback: string,
  method: string,
): Promise<boolean> {
  const response = await apiClient.rawRequest(`/assets${endpoint}`, {
    method,
    fetchOptions: { credentials: "include" },
  });
  if (!response.ok) {
    return handleError(response, fallback);
  }
  return true;
}

export const assetApi = {
  list: (type: string | null = null): Promise<AssetListResponse> =>
    assetRequest(
      type ? `?type=${type}` : "",
      AssetListResponseSchema,
      "Failed to fetch assets",
    ),

  get: (assetId: string): Promise<Asset> =>
    assetRequest(`/${assetId}`, AssetSchema, "Failed to fetch asset"),

  create: (data: {
    type: string;
    trigger: string;
    name: string;
    textDefinition?: string;
    negativePrompt?: string;
  }): Promise<Asset> =>
    assetRequest("", AssetSchema, "Failed to create asset", {
      method: "POST",
      body: data,
    }),

  update: (
    assetId: string,
    data: {
      trigger?: string;
      name?: string;
      textDefinition?: string;
      negativePrompt?: string;
    },
  ): Promise<Asset> =>
    assetRequest(`/${assetId}`, AssetSchema, "Failed to update asset", {
      method: "PATCH",
      body: data,
    }),

  delete: (assetId: string): Promise<boolean> =>
    assetRequestOk(`/${assetId}`, "Failed to delete asset", "DELETE"),

  getSuggestions: (query: string) =>
    assetRequest(
      `/suggestions?q=${encodeURIComponent(query)}`,
      AssetSuggestionSchema.array(),
      "Failed to get suggestions",
    ),

  resolve: (prompt: string) =>
    assetRequest("/resolve", ResolvedPromptSchema, "Failed to resolve prompt", {
      method: "POST",
      body: { prompt },
    }),

  validate: (prompt: string) =>
    assetRequest(
      "/validate",
      TriggerValidationSchema,
      "Failed to validate triggers",
      { method: "POST", body: { prompt } },
    ),

  // FormData upload stays on hand-rolled fetch: the shared apiClient forces
  // `Content-Type: application/json` on every request, which would clobber the
  // multipart boundary. This one endpoint remains direct until the client
  // learns to skip Content-Type for FormData bodies.
  async addImage(
    assetId: string,
    file: File,
    metadata: Record<string, string | undefined> = {},
  ) {
    const formData = new FormData();
    formData.append("image", file);
    Object.entries(metadata).forEach(([key, value]) => {
      if (value) {
        formData.append(key, value);
      }
    });

    const authHeaders = await buildFirebaseAuthHeaders();
    const response = await fetch(`${API_BASE}/${assetId}/images`, {
      method: "POST",
      headers: authHeaders,
      credentials: "include",
      body: formData,
    });
    if (!response.ok) {
      return await handleError(response, "Failed to upload image");
    }
    const payload = await response.json();
    return ApiSuccessResponseSchema(AssetImageUploadResponseSchema).parse(
      payload,
    ).data;
  },

  deleteImage: (assetId: string, imageId: string): Promise<boolean> =>
    assetRequestOk(
      `/${assetId}/images/${imageId}`,
      "Failed to delete image",
      "DELETE",
    ),

  setPrimaryImage: (assetId: string, imageId: string): Promise<Asset> =>
    assetRequest(
      `/${assetId}/images/${imageId}/primary`,
      AssetSchema,
      "Failed to set primary image",
      { method: "PATCH" },
    ),

  getForGeneration: (assetId: string) =>
    assetRequest(
      `/${assetId}/for-generation`,
      AssetForGenerationSchema,
      "Asset not ready for generation",
    ),
};

export default assetApi;
