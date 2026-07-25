/**
 * Fetch wrappers for /api/studio (thin, Zod-validated, Firebase-authed —
 * same seam pattern as the realtime sketch's falI2i.ts).
 */

import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";
import { z } from "zod";
import {
  RunTurnResponseSchema,
  StudioModelInfoSchema,
  StudioProjectSchema,
  StudioTurnSchema,
  type RunTurnResponse,
  type StudioModelInfo,
  type StudioModelSlug,
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
    pinnedModel?: StudioModelSlug | null;
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
): Promise<RunTurnResponse> {
  const response = await fetch(`${BASE}/projects/${projectId}/turns`, {
    method: "POST",
    body: JSON.stringify({ message }),
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
