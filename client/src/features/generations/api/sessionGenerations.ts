import { z } from "zod";
import { apiClient } from "@/services/ApiClient";
import {
  SessionPromptVersionEntrySchema,
  TakeOriginSchema,
} from "@shared/schemas/session.schemas";
import { normalizePersistedGeneration } from "../utils/normalizePersistedGeneration";
import type { Generation } from "../types";

const SavedSessionSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string(),
    userId: z.string(),
    prompt: z.object({ versions: z.array(SessionPromptVersionEntrySchema) }),
  }),
});

export interface OwnedSessionGeneration {
  generation: Generation;
  promptVersionId: string;
  origin?: z.infer<typeof TakeOriginSchema>;
}

/** Read back the exact saved take; never restore the session's working settings. */
export async function readOwnedSessionGeneration(
  creatorId: string,
  sessionId: string,
  generationId: string,
): Promise<OwnedSessionGeneration> {
  const response = SavedSessionSchema.parse(
    await apiClient.get(`/sessions/${encodeURIComponent(sessionId)}`),
  );
  if (response.data.id !== sessionId || response.data.userId !== creatorId)
    throw new Error("The saved take does not belong to this session");
  const version = response.data.prompt.versions.find((entry) =>
    entry.generations?.some((take) => take.id === generationId),
  );
  const record = version?.generations?.find((take) => take.id === generationId);
  if (!version || !record)
    throw new Error("The take has not reached its original words-version");
  const take = normalizePersistedGeneration(record);
  if (!take) throw new Error("The saved take could not be read");
  return {
    generation: take,
    promptVersionId: version.versionId,
    ...(record.origin ? { origin: record.origin } : {}),
  };
}

export async function readSavedSketchTake(
  creatorId: string,
  sessionId: string,
  promptVersionId: string,
  generationId: string,
): Promise<Generation> {
  const saved = await readOwnedSessionGeneration(
    creatorId,
    sessionId,
    generationId,
  );
  if (saved.promptVersionId !== promptVersionId || saved.origin !== "sketchpad")
    throw new Error("The picture has not reached its original words-version");
  return saved.generation;
}
