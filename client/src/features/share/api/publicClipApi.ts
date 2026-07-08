import { z } from "zod";
import {
  PublicClipDtoSchema,
  type PublicClipDto,
} from "@shared/schemas/share.schemas";

/**
 * Public clip fetch (ADR-0010 site-scope D8). Unauthenticated by design — the
 * /share page is a logged-out growth surface, so this hits the public endpoint
 * directly and validates the envelope at the wire.
 */
const EnvelopeSchema = z.object({
  success: z.literal(true),
  data: PublicClipDtoSchema,
});

/** Resolves the clip, or null when the share id is unknown (404). */
export async function fetchPublicClip(
  shareId: string,
): Promise<PublicClipDto | null> {
  const res = await fetch(`/api/public/share/${encodeURIComponent(shareId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load clip (${res.status})`);
  const parsed = EnvelopeSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("Malformed clip response");
  return parsed.data.data;
}
