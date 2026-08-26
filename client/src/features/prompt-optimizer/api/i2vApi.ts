import { apiClient } from "@/services/ApiClient";
import type { ImageObservation } from "../types/i2v";
import { z } from "zod";

export interface ImageObservationRequest {
  image: string;
  skipCache?: boolean;
  sourcePrompt?: string;
}

export interface ImageObservationResponse {
  success: boolean;
  observation?: ImageObservation;
  error?: string;
  cached: boolean;
  usedFastPath: boolean;
  durationMs: number;
}

const ImageObservationSchema = z
  .object({
    imageHash: z.string().optional(),
    subject: z.object({
      type: z.string(),
      description: z.string(),
      position: z.string(),
      confidence: z.number().optional(),
    }),
    framing: z.object({
      shotType: z.string(),
      angle: z.string(),
      confidence: z.number().optional(),
    }),
    lighting: z.object({
      quality: z.string(),
      timeOfDay: z.string(),
      confidence: z.number().optional(),
    }),
    motion: z.object({
      recommended: z.array(z.string()),
      risky: z.array(z.string()),
      risks: z
        .array(
          z.object({
            movement: z.string(),
            reason: z.string(),
          }),
        )
        .optional(),
    }),
    confidence: z.number().optional(),
  })
  .passthrough();

const ImageObservationResponseSchema = z
  .object({
    success: z.boolean(),
    observation: ImageObservationSchema.optional(),
    error: z.string().optional(),
    cached: z.boolean(),
    usedFastPath: z.boolean(),
    durationMs: z.number(),
  })
  .passthrough();

export interface ImageObservationFetchOptions {
  signal?: AbortSignal;
}

export async function observeImage(
  payload: ImageObservationRequest,
  options: ImageObservationFetchOptions = {},
): Promise<ImageObservationResponse> {
  const response = await apiClient.rawRequest("/enhancement/observe-image", {
    method: "POST",
    body: payload,
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (!response.ok) {
    throw new Error(`Failed to observe image: ${response.status}`);
  }

  const responsePayload = (await response.json()) as unknown;
  return ImageObservationResponseSchema.parse(
    responsePayload,
  ) as ImageObservationResponse;
}

export const i2vApi = {
  observeImage,
};
