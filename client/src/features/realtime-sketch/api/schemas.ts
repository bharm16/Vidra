import { z } from "zod";

/**
 * Anti-corruption boundary for fal realtime results
 * (spec: docs/superpowers/specs/2026-07-09-realtime-sketch-spike-design.md).
 * Unknown fields are stripped; a result with no usable image is malformed and
 * becomes a sticky lastError, never a blank live output. Field names pinned
 * live by scripts/spikes/fal-lightning-realtime-smoke.ts: over the realtime
 * msgpack socket the image arrives as raw JPEG bytes in images[0].content —
 * not a url.
 */
export const FalRealtimeResultSchema = z.object({
  images: z
    .array(
      z.object({
        content: z.instanceof(Uint8Array),
        width: z.number().optional(),
        height: z.number().optional(),
        content_type: z.string().optional(),
      }),
    )
    .min(1),
  timings: z.object({ inference: z.number().optional() }).optional(),
  seed: z.number().optional(),
  request_id: z.string().optional(),
});

export type FalRealtimeResult = z.infer<typeof FalRealtimeResultSchema>;
