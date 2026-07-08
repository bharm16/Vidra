import { z } from "zod";
import { apiClient } from "@/services/ApiClient";
import {
  CreateShareResponseSchema,
  type CreateShareRequest,
} from "@shared/schemas/share.schemas";

/**
 * Mint a public share for one owned clip (ADR-0010 site-scope D8). Authed —
 * the server verifies ownership and returns an opaque shareId; the caller
 * builds the /share/:shareId URL.
 */
const EnvelopeSchema = z.object({
  success: z.literal(true),
  data: CreateShareResponseSchema,
});

export async function createShare(req: CreateShareRequest): Promise<string> {
  const payload = (await apiClient.post("/share", req)) as unknown;
  return EnvelopeSchema.parse(payload).data.shareId;
}
