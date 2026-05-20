import { API_CONFIG } from "@/config/api.config";
import { buildFirebaseAuthHeaders } from "@/services/http/firebaseAuth";
import type {
  ContinuityShot,
  ContinuitySession,
  CreateSessionInput,
  CreateShotInput,
  UpdateShotInput,
} from "../types";
import { z } from "zod";
import {
  SessionContinuityShotSchema,
  SessionContinuitySettingsSchema,
  SessionSceneProxySchema,
  SessionStyleReferenceSchema,
} from "@shared/schemas/session.schemas";
import { ContinuityApiResponseSchema } from "./schemas";

interface CreateSceneProxyInput {
  sourceShotId?: string;
  sourceVideoId?: string;
}

interface SceneProxyCameraInput {
  yaw?: number;
  pitch?: number;
  roll?: number;
  dolly?: number;
}

interface PreviewSceneProxyInput {
  camera?: SceneProxyCameraInput;
}

const SessionDtoSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["active", "completed", "archived"]),
    createdAt: z.string(),
    updatedAt: z.string(),
    continuity: z
      .object({
        shots: z.array(SessionContinuityShotSchema).default([]),
        primaryStyleReference:
          SessionStyleReferenceSchema.nullable().optional(),
        sceneProxy: SessionSceneProxySchema.nullable().optional(),
        settings: SessionContinuitySettingsSchema,
      })
      .optional(),
  })
  .passthrough();

type SessionDtoPayload = z.infer<typeof SessionDtoSchema>;

async function fetchWithAuth<T>(
  endpoint: string,
  schema: z.ZodType<T>,
  options: RequestInit = {},
): Promise<T> {
  const authHeaders = await buildFirebaseAuthHeaders();
  const response = await fetch(`${API_CONFIG.baseURL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...(options.headers || {}),
    },
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload?.error || payload?.message || "Continuity API error",
    );
  }

  const parsed = ContinuityApiResponseSchema(schema).safeParse(payload);
  if (!parsed.success) {
    throw new Error("Invalid continuity API response");
  }

  return parsed.data.data;
}

function sessionToContinuity(session: SessionDtoPayload): ContinuitySession {
  if (!session.continuity) {
    throw new Error("Session does not include continuity data");
  }

  return {
    id: session.id,
    userId: session.userId,
    name: session.name || "Continuity Session",
    ...(session.description ? { description: session.description } : {}),
    primaryStyleReference: session.continuity.primaryStyleReference ?? null,
    sceneProxy: session.continuity.sceneProxy ?? null,
    // Zod-inferred optional fields surface as `T | undefined`, but the
    // `SessionContinuityShot` interface uses `?:` (no explicit undefined)
    // under exactOptionalPropertyTypes. The runtime shape has been validated
    // by Zod parsing, so we bridge the inference gap here with a cast.
    shots: session.continuity.shots as unknown as ContinuityShot[],
    defaultSettings: session.continuity.settings,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

export const continuityApi = {
  createSession: async (input: CreateSessionInput) => {
    const session = await fetchWithAuth(
      "/sessions/continuity",
      SessionDtoSchema,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
    return sessionToContinuity(session);
  },

  listSessions: async () => {
    const sessions = await fetchWithAuth(
      "/sessions?includeContinuity=true&includePrompt=false",
      z.array(SessionDtoSchema),
    );
    return sessions.map((session) => sessionToContinuity(session));
  },

  getSession: async (sessionId: string) => {
    const session = await fetchWithAuth(
      `/sessions/${sessionId}`,
      SessionDtoSchema,
    );
    return sessionToContinuity(session);
  },

  addShot: (sessionId: string, input: CreateShotInput) =>
    fetchWithAuth(`/sessions/${sessionId}/shots`, SessionContinuityShotSchema, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateShot: (sessionId: string, shotId: string, updates: UpdateShotInput) =>
    fetchWithAuth(
      `/sessions/${sessionId}/shots/${shotId}`,
      SessionContinuityShotSchema,
      {
        method: "PATCH",
        body: JSON.stringify(updates),
      },
    ),

  generateShot: (sessionId: string, shotId: string) =>
    fetchWithAuth(
      `/sessions/${sessionId}/shots/${shotId}/generate`,
      SessionContinuityShotSchema,
      {
        method: "POST",
      },
    ),

  updateShotStyleReference: (
    sessionId: string,
    shotId: string,
    styleReferenceId: string | null,
  ) =>
    fetchWithAuth(
      `/sessions/${sessionId}/shots/${shotId}/style-reference`,
      SessionContinuityShotSchema,
      {
        method: "PUT",
        body: JSON.stringify({ styleReferenceId }),
      },
    ),

  updatePrimaryStyleReference: async (
    sessionId: string,
    input: Record<string, unknown>,
  ) => {
    const session = await fetchWithAuth(
      `/sessions/${sessionId}/style-reference`,
      SessionDtoSchema,
      {
        method: "PUT",
        body: JSON.stringify(input),
      },
    );
    return sessionToContinuity(session);
  },

  updateSessionSettings: async (
    sessionId: string,
    settings: Record<string, unknown>,
  ) => {
    const session = await fetchWithAuth(
      `/sessions/${sessionId}/settings`,
      SessionDtoSchema,
      {
        method: "PUT",
        body: JSON.stringify({ settings }),
      },
    );
    return sessionToContinuity(session);
  },

  createSceneProxy: async (sessionId: string, input: CreateSceneProxyInput) => {
    const session = await fetchWithAuth(
      `/sessions/${sessionId}/scene-proxy`,
      SessionDtoSchema,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
    return sessionToContinuity(session);
  },

  previewSceneProxy: (
    sessionId: string,
    shotId: string,
    input?: PreviewSceneProxyInput,
  ) =>
    fetchWithAuth(
      `/sessions/${sessionId}/shots/${shotId}/scene-proxy-preview`,
      SessionContinuityShotSchema,
      {
        method: "POST",
        body: JSON.stringify(input ?? {}),
      },
    ),
};

export default continuityApi;
