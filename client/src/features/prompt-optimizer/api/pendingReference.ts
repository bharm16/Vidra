import { z } from "zod";
import { apiClient } from "@/services/ApiClient";
import { UploadPreviewImageResponseSchema } from "@/features/preview/api/schemas";
import type { UploadPreviewImageResponse } from "@/features/preview/api/previewApi";

export const PendingReferenceSchema = z
  .object({
    storagePath: z.string().min(1).max(500),
    sessionId: z.string().min(1).max(200).nullable(),
    attachmentState: z.enum(["pending", "failed"]).optional(),
    attempt: z
      .object({
        sessionId: z.string().min(1).max(200),
        promptVersionId: z.string().min(1).max(200),
        admissionKey: z.string().min(1).max(200),
      })
      .optional(),
  })
  .strict();
export type PendingReference = z.infer<typeof PendingReferenceSchema>;

export async function admitPendingReference(
  reference: PendingReference & {
    attempt: NonNullable<PendingReference["attempt"]>;
  },
): Promise<UploadPreviewImageResponse> {
  const response = await apiClient.post("/preview/upload/admit-reference", {
    storagePath: reference.storagePath,
    ...reference.attempt,
  });
  return UploadPreviewImageResponseSchema.parse(response);
}
