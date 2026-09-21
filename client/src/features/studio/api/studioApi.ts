/**
 * Fetch wrappers for /api/studio (thin, Zod-validated, Firebase-authed —
 * same seam pattern as the realtime sketch's falI2i.ts).
 */

import { apiClient } from "@/services/ApiClient";
import { storageApi } from "@/api/storageApi";
import { z } from "zod";
import {
  StudioUseInSessionResultSchema,
  type StudioTurnSubmission,
  type StudioUseInSessionResult,
} from "@shared/schemas/studio.schemas";
import {
  RunTurnResponseSchema,
  StudioAttachmentSchema,
  StudioModelInfoSchema,
  StudioProjectSchema,
  StudioTurnSchema,
  StudioUnresolvedReturnSchema,
  type RunTurnResponse,
  type StudioAttachment,
  type StudioModelInfo,
  type StudioProject,
  type StudioTurn,
  type StudioUnresolvedReturn,
} from "./schemas";

async function request<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  init?: RequestInit,
): Promise<z.infer<T>> {
  // Routes through the shared apiClient seam (Firebase auth headers, the
  // telemetry-source header, the 401 → sign-in-and-retry transport, backoff).
  // The bespoke error handling below — statusCode enrichment, graceful non-JSON
  // body — is a caller contract (useStudioProject reads err.statusCode), so this
  // uses rawRequest rather than the generic apiRequest helper.
  const response = await apiClient.rawRequest(`/studio${path}`, {
    method: init?.method ?? "GET",
    body: init?.body,
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

/**
 * "Refine in the studio" (ADR-0022 decision 4): birth a project from a session
 * picture. The server reads the take out of the session — which is where the
 * words-version lives — so the creator names only the session and the take.
 * Invoking twice for the same take returns the same project.
 */
export async function createStudioProjectFromSessionPicture(input: {
  sessionId: string;
  generationId: string;
}): Promise<StudioProject> {
  return request("/projects/from-session-picture", StudioProjectSchema, {
    method: "POST",
    body: JSON.stringify(input),
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
  submission: StudioTurnSubmission,
  hooks?: RunTurnStreamHooks,
  attachmentIds?: readonly string[],
): Promise<RunTurnResponse> {
  // Streams NDJSON, so it opts out of the shared client's request timeout
  // (stream: true) — otherwise the timeout signal would abort the turn
  // mid-stream. Auth + telemetry-source headers still come from the seam.
  //
  // The submission identity and captured selection/pin ride in this body (#115).
  // They are built once here, so the auth transport's single POST re-send after
  // a 401 sign-in re-sends the SAME identity and converges on one turn rather
  // than a second paid decision. `null` is an explicit "no selection"/"Auto"
  // captured at submit time, so a change in another tab cannot alter this turn.
  const response = await apiClient.rawRequest(
    `/studio/projects/${projectId}/turns`,
    {
      method: "POST",
      body: JSON.stringify({
        message,
        submissionId: submission.submissionId,
        selectedImageId: submission.selectedImageId ?? null,
        pinnedModel: submission.pinnedModel ?? null,
        ...(attachmentIds && attachmentIds.length > 0
          ? { attachmentIds: [...attachmentIds] }
          : {}),
      }),
      stream: true,
    },
  );

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

/**
 * The 409 that is not an error — ADR-0022 decision 4.
 *
 * `reason` is the discriminator, not the status code: the same status also
 * carries "already being added", and the two must never be confused. A gone
 * origin session is a question for the creator, so it is parsed into an
 * outcome rather than thrown as a failure.
 */
const MissingOriginSessionSchema = z.object({
  reason: z.literal("origin-session-missing"),
  sessionId: z.string(),
  error: z.string(),
});

/**
 * The other 409 that is a question, not an error (issue #131). A session this
 * return would mint needs its associated words confirmed by the creator —
 * never the edit instruction or transform label. `suggestion` prefills the
 * field when a from-scratch generate's prompt exists; it is absent for an edit
 * or transform, where the creator's own words are required.
 */
const NeedsConfirmedWordsSchema = z.object({
  reason: z.literal("needs-confirmed-words"),
  suggestion: z.string().optional(),
  error: z.string(),
});

export type UseInSessionOutcome =
  | { state: "returned"; result: StudioUseInSessionResult }
  | { state: "origin-session-missing"; sessionId: string; message: string }
  | {
      state: "needs-confirmed-words";
      suggestion?: string;
      message: string;
    }
  | { state: "error"; message: string };

/**
 * "Use this in the session" (ADR-0022 decision 4): a studio image returns to a
 * session as a picture take, armed as its first frame.
 *
 * The destination is never sent — the project's own origin is what decides it.
 * Pressing twice for the same image yields one take, so a retry after a lost
 * response is safe without a client-held key.
 */
export async function returnStudioImageToSession(
  projectId: string,
  imageId: string,
  options?: { onMissingOriginSession?: "new-session"; confirmedWords?: string },
): Promise<UseInSessionOutcome> {
  const response = await apiClient.rawRequest(
    `/studio/projects/${projectId}/images/${imageId}/use-in-session`,
    {
      method: "POST",
      body: JSON.stringify({
        ...(options?.onMissingOriginSession
          ? { onMissingOriginSession: options.onMissingOriginSession }
          : {}),
        ...(options?.confirmedWords
          ? { confirmedWords: options.confirmedWords }
          : {}),
      }),
    },
  );

  const body: unknown = await response.json().catch(() => null);

  if (response.ok) {
    const parsed = z
      .object({
        success: z.literal(true),
        data: StudioUseInSessionResultSchema,
      })
      .parse(body);
    return { state: "returned", result: parsed.data };
  }

  const choice = MissingOriginSessionSchema.safeParse(body);
  if (choice.success) {
    return {
      state: "origin-session-missing",
      sessionId: choice.data.sessionId,
      message: choice.data.error,
    };
  }

  const needsWords = NeedsConfirmedWordsSchema.safeParse(body);
  if (needsWords.success) {
    return {
      state: "needs-confirmed-words",
      ...(needsWords.data.suggestion !== undefined
        ? { suggestion: needsWords.data.suggestion }
        : {}),
      message: needsWords.data.error,
    };
  }

  const detail =
    body !== null &&
    typeof body === "object" &&
    typeof (body as Record<string, unknown>).error === "string"
      ? ((body as Record<string, unknown>).error as string)
      : `Studio request failed (${response.status})`;
  return { state: "error", message: detail };
}

export async function getStudioModels(): Promise<StudioModelInfo[]> {
  return request("/models", z.array(StudioModelInfoSchema));
}

/**
 * Recovery after refresh (ADR-0022 decision 6, issue #135): the project's
 * pictures whose return was admitted but never attached, read from the
 * server's own receipts. Validated at the wire like every other studio
 * response — an unresolved return the client cannot parse must not be shown,
 * and must not be silently shown as saved either.
 */
export async function fetchUnresolvedStudioReturns(
  projectId: string,
): Promise<StudioUnresolvedReturn[]> {
  return request(
    `/projects/${projectId}/unresolved-returns`,
    z.object({ returns: z.array(StudioUnresolvedReturnSchema) }),
  ).then((data) => data.returns);
}
