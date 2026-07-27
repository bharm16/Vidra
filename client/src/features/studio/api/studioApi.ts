/**
 * Fetch wrappers for /api/studio (thin, Zod-validated, Firebase-authed —
 * same seam pattern as the realtime sketch's falI2i.ts).
 */

import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";
import { storageApi } from "@/api/storageApi";
import { z } from "zod";
import {
  RunTurnResponseSchema,
  StudioAttachmentSchema,
  StudioModelInfoSchema,
  StudioProjectSchema,
  StudioTurnSchema,
  type RunTurnResponse,
  type StudioAttachment,
  type StudioModelInfo,
  type StudioProject,
  type StudioTurn,
} from "./schemas";

const BASE = "/api/studio";

async function request<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  init?: RequestInit,
): Promise<z.infer<T>> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(await buildFirebaseAuthHeaders()),
      ...init?.headers,
    },
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      body !== null &&
      typeof body === "object" &&
      typeof (body as Record<string, unknown>).error === "string"
        ? ((body as Record<string, unknown>).error as string)
        : `Studio request failed (${response.status})`;
    const error = new Error(detail) as Error & { statusCode?: number };
    error.statusCode = response.status;
    throw error;
  }

  const parsed = z
    .object({ success: z.literal(true), data: schema })
    .parse(body) as { success: true; data: z.infer<T> };
  return parsed.data;
}

export async function createStudioProject(
  title?: string,
): Promise<StudioProject> {
  return request("/projects", StudioProjectSchema, {
    method: "POST",
    body: JSON.stringify(title ? { title } : {}),
  });
}

export async function listStudioProjects(): Promise<StudioProject[]> {
  return request("/projects", z.array(StudioProjectSchema));
}

export async function getStudioProject(
  projectId: string,
): Promise<StudioProject> {
  return request(`/projects/${projectId}`, StudioProjectSchema);
}

export async function updateStudioProject(
  projectId: string,
  patch: {
    title?: string;
    /**
     * A roster slug. Typed as a plain string because the server owns the
     * roster: a model registered after this client shipped is offered in
     * the picker and must therefore be pinnable, not just parseable.
     * StudioModelSlugSchema still names the set this client ships knowing.
     */
    pinnedModel?: string | null;
    selectedImageId?: string | null;
  },
): Promise<StudioProject> {
  return request(`/projects/${projectId}`, StudioProjectSchema, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteStudioProject(projectId: string): Promise<void> {
  await request(`/projects/${projectId}`, z.object({ deleted: z.boolean() }), {
    method: "DELETE",
  });
}

export interface RunTurnStreamHooks {
  /** A new LLM attempt began — clear any streamed thinking text. */
  onThinkingStart?: () => void;
  /** The next characters of the assistant's thinking, in order. */
  onThinkingDelta?: (delta: string) => void;
}

const StreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("thinking-start") }),
  z.object({ type: z.literal("thinking"), delta: z.string() }),
  z.object({
    type: z.literal("accepted"),
    turnId: z.string(),
    decision: z.unknown(),
  }),
  z.object({
    type: z.literal("error"),
    error: z.string(),
    statusCode: z.number().optional(),
  }),
]);

/**
 * S-12: register an already-uploaded reference image on the project. The
 * bytes go to GCS first via storageApi.getUploadUrl + a direct PUT; this
 * records the storagePath so the conversation can reference it by id.
 */
export async function registerStudioAttachment(
  projectId: string,
  input: { storagePath: string; filename: string },
): Promise<StudioAttachment> {
  return request(`/projects/${projectId}/attachments`, StudioAttachmentSchema, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** storageApi returns the grant untyped — validate it like any other wire. */
const UploadGrantSchema = z.object({
  uploadUrl: z.string(),
  storagePath: z.string(),
  maxSizeBytes: z.number(),
});

/**
 * S-12, the whole move behind one seam: grant a signed URL, PUT the bytes
 * straight to GCS (house upload pattern), then register the storagePath on
 * the project so the conversation can reference it by id.
 */
export async function uploadStudioAttachment(
  projectId: string,
  file: File,
): Promise<StudioAttachment> {
  const grant = UploadGrantSchema.parse(
    await storageApi.getUploadUrl("preview-image", file.type),
  );
  const put = await fetch(grant.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
      // The V4 signature covers these extension headers — the PUT must
      // send them verbatim (create-only + size ceiling), or GCS 400s.
      "x-goog-if-generation-match": "0",
      "x-goog-content-length-range": `0,${grant.maxSizeBytes}`,
    },
    body: file,
  });
  if (!put.ok) {
    throw new Error(`Upload failed (${put.status})`);
  }
  return registerStudioAttachment(projectId, {
    storagePath: grant.storagePath,
    filename: file.name,
  });
}

/**
 * Run a turn. The route streams NDJSON: `thinking` deltas in realtime as
 * the LLM emits them, then one terminal `accepted` (decision final, image
 * calls still running — poll getStudioTurn) or `error` event. Errors
 * before the stream starts arrive as plain JSON and throw like every
 * other wrapper.
 */
export async function runStudioTurn(
  projectId: string,
  message: string,
  hooks?: RunTurnStreamHooks,
  attachmentIds?: readonly string[],
): Promise<RunTurnResponse> {
  const response = await fetch(`${BASE}/projects/${projectId}/turns`, {
    method: "POST",
    body: JSON.stringify({
      message,
      ...(attachmentIds && attachmentIds.length > 0
        ? { attachmentIds: [...attachmentIds] }
        : {}),
    }),
    headers: {
      "Content-Type": "application/json",
      ...(await buildFirebaseAuthHeaders()),
    },
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("ndjson")) {
    // Pre-stream failure (auth, 404, bad body) — plain JSON error shape.
    const body: unknown = await response.json().catch(() => null);
    const detail =
      body !== null &&
      typeof body === "object" &&
      typeof (body as Record<string, unknown>).error === "string"
        ? ((body as Record<string, unknown>).error as string)
        : `Studio request failed (${response.status})`;
    const error = new Error(detail) as Error & { statusCode?: number };
    error.statusCode = response.status;
    throw error;
  }
  if (!response.body) {
    throw new Error("Studio turn stream had no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  const handleLine = (line: string): RunTurnResponse | null => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const event = StreamEventSchema.parse(JSON.parse(trimmed));
    switch (event.type) {
      case "thinking-start":
        hooks?.onThinkingStart?.();
        return null;
      case "thinking":
        hooks?.onThinkingDelta?.(event.delta);
        return null;
      case "accepted":
        return RunTurnResponseSchema.parse({
          turnId: event.turnId,
          decision: event.decision,
        });
      case "error": {
        const error = new Error(event.error) as Error & {
          statusCode?: number;
        };
        if (event.statusCode !== undefined) error.statusCode = event.statusCode;
        throw error;
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    buffered += done ? "" : decoder.decode(value, { stream: true });
    let newlineIndex = buffered.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffered.slice(0, newlineIndex);
      buffered = buffered.slice(newlineIndex + 1);
      const accepted = handleLine(line);
      if (accepted) return accepted;
      newlineIndex = buffered.indexOf("\n");
    }
    if (done) {
      const accepted = handleLine(buffered);
      if (accepted) return accepted;
      throw new Error("Studio turn stream ended without a decision");
    }
  }
}

export async function getStudioTurn(
  projectId: string,
  turnId: string,
): Promise<StudioTurn> {
  return request(`/projects/${projectId}/turns/${turnId}`, StudioTurnSchema);
}

/** Full thread for project reopen, oldest first. */
export async function listStudioTurns(
  projectId: string,
): Promise<StudioTurn[]> {
  return request(`/projects/${projectId}/turns`, z.array(StudioTurnSchema));
}

export async function getStudioModels(): Promise<StudioModelInfo[]> {
  return request("/models", z.array(StudioModelInfoSchema));
}
