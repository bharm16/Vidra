import { z } from "zod";

/**
 * Anti-corruption boundary for fal realtime results
 * (spec: docs/superpowers/specs/2026-07-09-realtime-sketch-spike-design.md).
 * Unknown fields are stripped; a result with no usable image is malformed and
 * becomes a sticky lastError, never a blank live output. Field names are
 * pinned live by scripts/spikes/fal-lightning-realtime-smoke.ts.
 */
export const FalRealtimeResultSchema = z.object({
  images: z
    .array(
      z.object({
        url: z.string().min(1),
        width: z.number().optional(),
        height: z.number().optional(),
      }),
    )
    .min(1),
  timings: z.object({ inference: z.number().optional() }).optional(),
  seed: z.number().optional(),
  request_id: z.string().optional(),
});

export type FalRealtimeResult = z.infer<typeof FalRealtimeResultSchema>;
