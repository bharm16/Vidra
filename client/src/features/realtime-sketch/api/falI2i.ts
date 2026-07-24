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

/**
 * Both fal and our own error middleware report failures as JSON with the
 * human-readable cause in `detail` / `message`. The live editor shows this
 * text to the creator, so unwrap it here — the anti-corruption layer — rather
 * than putting a raw JSON envelope on the product surface.
 */
function explainFailure(status: number, body: string): string {
  let detail = body.slice(0, 200);
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed !== null && typeof parsed === "object") {
      const fields = parsed as Record<string, unknown>;
      const stated = fields.detail ?? fields.message ?? fields.error;
      if (typeof stated === "string" && stated.length > 0) {
        detail = stated;
      }
    }
  } catch {
    // Not JSON (a proxy's HTML error page, say) — the raw prefix stands.
  }
  return `frame failed (${status}): ${detail}`;
}

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
    throw new Error(explainFailure(response.status, await response.text()));
  }
  return response.json() as Promise<unknown>;
};
