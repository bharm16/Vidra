import { apiRequest } from "@/services/apiRequest";
import {
  CreateShareResponseSchema,
  type CreateShareRequest,
} from "@shared/schemas/share.schemas";

/**
 * Mint a public share for one owned clip (ADR-0010 site-scope D8). Authed —
 * the server verifies ownership and returns an opaque shareId; the caller
 * builds the /share/:shareId URL.
 */
export async function createShare(req: CreateShareRequest): Promise<string> {
  const data = await apiRequest("/share", CreateShareResponseSchema, {
    method: "POST",
    body: req,
  });
  return data.shareId;
}
