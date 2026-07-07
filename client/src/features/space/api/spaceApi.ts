import { z } from "zod";
import { apiClient } from "@/services/ApiClient";

/**
 * Space API — mutations on the lineage network (ADR-0012 / ADR-0013).
 */

const ArchiveGenerationResponseSchema = z.object({ success: z.boolean() });

/**
 * Soft-remove a generation node from the space (M5 leaf-only removal). The
 * server enforces the leaf-only rule and returns 409 for a node that still has
 * a live descendant, which surfaces here as a rejected promise. Callers refetch
 * the session so the space re-renders without the archived node.
 */
export async function archiveGeneration(
  sessionId: string,
  generationId: string,
): Promise<void> {
  const payload = (await apiClient.post(
    `/sessions/${encodeURIComponent(sessionId)}/generations/${encodeURIComponent(
      generationId,
    )}/archive`,
    {},
  )) as unknown;
  ArchiveGenerationResponseSchema.parse(payload);
}
