import { z } from "zod";

const PublicSpanSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  category: z.string().min(1),
  confidence: z.number().min(0).max(1),
  text: z.string().optional(),
}).refine(span => span.end > span.start);

/** Version 2 distinguishes provisional progress, authoritative completion and failure. */
export const SpanLabelStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("span"), span: PublicSpanSchema }),
  z.object({ type: z.literal("complete"), result: z.object({ spans: z.array(PublicSpanSchema).max(80), meta: z.record(z.string(), z.unknown()).nullable() }) }),
  z.object({ type: z.literal("error"), error: z.string(), message: z.string().optional(), partialCount: z.number().int().nonnegative().optional() }),
]);
