import { z } from "zod";

/**
 * Anti-corruption boundary for fal i2i sync results
 * (spec: docs/superpowers/specs/2026-07-09-realtime-sketch-spike-design.md).
 * Unknown fields are stripped; a result with no usable image is malformed and
 * becomes a sticky lastError, never a blank live output. Wire shape pinned by
 * live HTTP probes: sync_mode returns the image as a data-URI in
 * images[0].url.
 */
export const FalI2iResultSchema = z.object({
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
});

export type FalI2iResult = z.infer<typeof FalI2iResultSchema>;
