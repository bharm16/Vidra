/**
 * Public clip sharing (ADR-0010 site-scope D8).
 *
 * A share is an opt-in, denormalized snapshot of ONE clip: its durable storage
 * path (resolved to a fresh view URL on read) plus the paired description. The
 * public read endpoint returns only this — never user-scoped session data — so
 * a clip is public only after an explicit Share action mints a random shareId.
 */
import { z } from "zod";

/** The public payload served at GET /api/public/share/:shareId. */
export const PublicClipDtoSchema = z.object({
  videoUrl: z.string().url(),
  description: z.string(),
  model: z.string().nullable(),
  createdAt: z.string(),
});
export type PublicClipDto = z.infer<typeof PublicClipDtoSchema>;

/** The authed mint request: which clip to share (session + generation). */
export const CreateShareRequestSchema = z.object({
  sessionId: z.string().min(1),
  generationId: z.string().min(1),
});
export type CreateShareRequest = z.infer<typeof CreateShareRequestSchema>;

/** The mint response: the opaque, unguessable share id. */
export const CreateShareResponseSchema = z.object({
  shareId: z.string().min(1),
});
export type CreateShareResponse = z.infer<typeof CreateShareResponseSchema>;
