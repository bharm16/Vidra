import {
  SketchFrameRefusalSchema,
  type SketchFrameRefusal,
} from "@shared/schemas/sketch.schemas";

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

/**
 * The relay refused this frame before dispatching it (issue #84) — a spent
 * daily allowance or a budget it could not read. Carried as its own error type
 * so the generation loop can pause on the first and retry the second, which a
 * message string alone could never tell apart.
 */
export class SketchFrameRefused extends Error {
  constructor(public readonly refusal: SketchFrameRefusal) {
    super(refusal.detail);
    this.name = "SketchFrameRefused";
  }
}

/**
 * An admission refusal is recognised by its `reason`, never by its status:
 * the relay's burst lane answers 429 too, and that one IS an ordinary
 * transient failure.
 */
function readRefusal(body: string): SketchFrameRefusal | undefined {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return undefined;
  }
  const parsed = SketchFrameRefusalSchema.safeParse(payload);
  return parsed.success ? parsed.data : undefined;
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
    const body = await response.text();
    const refusal = readRefusal(body);
    if (refusal !== undefined) {
      throw new SketchFrameRefused(refusal);
    }
    throw new Error(explainFailure(response.status, body));
  }
  return response.json() as Promise<unknown>;
};
