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
  patch: { title?: string; pinnedModel?: StudioModelSlug | null },
): Promise<StudioProject> {
  return request(`/projects/${projectId}`, StudioProjectSchema, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** 202: decision is final, image calls still running — poll getStudioTurn. */
export async function runStudioTurn(
  projectId: string,
  message: string,
): Promise<RunTurnResponse> {
  return request(`/projects/${projectId}/turns`, RunTurnResponseSchema, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
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
