import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";
import { FAL_I2I_PATH } from "../config/constants";

/**
 * Frame seam for the realtime sketch (ADR-0016 as amended): each sketch
 * frame is one HTTP POST through our server relay, which holds FAL_KEY and
 * pins the model. AbortSignal gives the loop true cancellation — something
 * the retired realtime WebSocket never had.
 */

export interface SketchFramePayload {
  prompt: string;
  image_url: string;
  strength: number;
  num_inference_steps: number;
  seed: number;
}

export type SendSketchFrame = (
  payload: SketchFramePayload,
  signal: AbortSignal,
) => Promise<unknown>;

export const sendSketchFrame: SendSketchFrame = async (payload, signal) => {
  const response = await fetch(FAL_I2I_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await buildFirebaseAuthHeaders()),
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`frame failed (${response.status}): ${body.slice(0, 140)}`);
  }
  return response.json() as Promise<unknown>;
};
