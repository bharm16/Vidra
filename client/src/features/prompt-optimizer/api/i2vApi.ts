import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";
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
  fetchImpl?: typeof fetch;
}

export async function observeImage(
  payload: ImageObservationRequest,
  options: ImageObservationFetchOptions = {},
): Promise<ImageObservationResponse> {
  const fetchFn =
    options.fetchImpl || (typeof fetch !== "undefined" ? fetch : undefined);
  if (!fetchFn) {
    throw new Error("Fetch is not available in this environment.");
  }

  const authHeaders = await buildFirebaseAuthHeaders();
  const response = await fetchFn("/api/enhancement/observe-image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify(payload),
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
