/**
 * Pure serialization helpers for the continuity session document shape.
 *
 * Lives in `domain/` (not `services/`) so both `services/sessions/SessionStore`
 * and `services/continuity/storage/FirestoreContinuitySessionStore` can
 * serialize the same payload without one service domain importing from the
 * other.
 *
 * No I/O, no Firestore, no Node APIs — just deterministic transforms.
 */
import { z } from "zod";

import {
  SessionContinuityModeSchema,
  SessionShotStatusSchema,
} from "#shared/schemas/session.schemas";
import type {
  ContinuitySession,
  ContinuityShot,
} from "@server/domain/continuity/types";

const StoredShotSchema = z
  .object({
    id: z.string(),
    sessionId: z.string(),
    sequenceIndex: z.number(),
    userPrompt: z.string(),
    continuityMode: SessionContinuityModeSchema,
    styleStrength: z.number(),
    styleReferenceId: z.string().nullable(),
    modelId: z.string(),
    status: SessionShotStatusSchema,
    createdAt: z.number(),
  })
  .passthrough();

export interface StoredContinuitySession {
  userId: string;
  name: string;
  description?: string;
  primaryStyleReference: Record<string, unknown>;
  sceneProxy?: Record<string, unknown>;
  shots: Array<Record<string, unknown>>;
  defaultSettings: ContinuitySession["defaultSettings"];
  status: ContinuitySession["status"];
  createdAtMs: number;
  updatedAtMs: number;
  version?: number;
}

export const serializeContinuitySession = (
  session: ContinuitySession,
): StoredContinuitySession => ({
  userId: session.userId,
  name: session.name,
  ...(typeof session.description === "string"
    ? { description: session.description }
    : {}),
  primaryStyleReference: serializeStyleReference(session.primaryStyleReference),
  ...(session.sceneProxy
    ? { sceneProxy: serializeSceneProxy(session.sceneProxy) }
    : {}),
  shots: session.shots.map((shot) => serializeShot(shot)),
  defaultSettings: session.defaultSettings,
  status: session.status,
  createdAtMs: session.createdAt.getTime(),
  updatedAtMs: session.updatedAt.getTime(),
  ...(typeof session.version === "number" ? { version: session.version } : {}),
});

export const deserializeContinuitySession = (
  sessionId: string,
  stored: StoredContinuitySession,
): ContinuitySession => {
  const sceneProxy = stored.sceneProxy
    ? deserializeSceneProxy(stored.sceneProxy)
    : undefined;
  const version =
    typeof stored.version === "number" ? stored.version : undefined;
  return {
    id: sessionId,
    userId: stored.userId,
    name: stored.name,
    ...(typeof stored.description === "string"
      ? { description: stored.description }
      : {}),
    primaryStyleReference: deserializeStyleReference(
      stored.primaryStyleReference,
    ),
    ...(sceneProxy ? { sceneProxy } : {}),
    shots: stored.shots.map((shot) => deserializeShot(shot)),
    defaultSettings: stored.defaultSettings,
    status: stored.status,
    ...(version !== undefined ? { version } : {}),
    createdAt: new Date(stored.createdAtMs),
    updatedAt: new Date(stored.updatedAtMs),
  };
};

const serializeShot = (
  shot: ContinuityShot,
): Record<string, unknown> => ({
  ...Object.fromEntries(
    Object.entries({
      ...shot,
      createdAt: shot.createdAt.getTime(),
      ...(shot.generatedAt ? { generatedAt: shot.generatedAt.getTime() } : {}),
      ...(shot.frameBridge
        ? {
            frameBridge: {
              ...shot.frameBridge,
              extractedAt: shot.frameBridge.extractedAt.getTime(),
            },
          }
        : {}),
      ...(shot.styleReference
        ? { styleReference: serializeStyleReference(shot.styleReference) }
        : {}),
      ...(shot.seedInfo
        ? {
            seedInfo: {
              ...shot.seedInfo,
              extractedAt: shot.seedInfo.extractedAt.getTime(),
            },
          }
        : {}),
    }).filter(([, value]) => value !== undefined),
  ),
});

const deserializeShot = (
  raw: Record<string, unknown>,
): ContinuityShot => {
  const parsed = StoredShotSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid shot data in Firestore: ${parsed.error.message}`);
  }

  const data = parsed.data;
  const createdAt = new Date(data.createdAt);
  const generatedAt =
    typeof raw.generatedAt === "number" ? new Date(raw.generatedAt) : undefined;
  const seedInfoRaw = raw.seedInfo as Record<string, unknown> | undefined;
  const frameBridgeRaw = raw.frameBridge as Record<string, unknown> | undefined;
  const seedInfo =
    seedInfoRaw && typeof seedInfoRaw.seed === "number"
      ? {
          seed: seedInfoRaw.seed as number,
          provider: String(seedInfoRaw.provider || ""),
          modelId: String(seedInfoRaw.modelId || ""),
          extractedAt:
            typeof seedInfoRaw.extractedAt === "number"
              ? new Date(seedInfoRaw.extractedAt)
              : new Date(),
        }
      : undefined;

  const styleReferenceRaw = raw.styleReference as
    | Record<string, unknown>
    | undefined;

  const frameBridge = frameBridgeRaw
    ? ({
        ...frameBridgeRaw,
        extractedAt:
          typeof frameBridgeRaw.extractedAt === "number"
            ? new Date(frameBridgeRaw.extractedAt)
            : new Date(),
      } as NonNullable<ContinuityShot["frameBridge"]>)
    : undefined;

  const styleReference = styleReferenceRaw
    ? deserializeStyleReference(styleReferenceRaw)
    : undefined;

  return {
    ...data,
    createdAt,
    ...(generatedAt !== undefined ? { generatedAt } : {}),
    ...(seedInfo !== undefined ? { seedInfo } : {}),
    ...(frameBridge !== undefined ? { frameBridge } : {}),
    ...(styleReference !== undefined ? { styleReference } : {}),
  } as ContinuityShot;
};

const serializeStyleReference = (
  ref: ContinuitySession["primaryStyleReference"],
): Record<string, unknown> => ({
  ...ref,
  extractedAt: ref.extractedAt.getTime(),
});

const deserializeStyleReference = (
  raw: Record<string, unknown>,
): ContinuitySession["primaryStyleReference"] => {
  const extractedAt =
    typeof raw.extractedAt === "number"
      ? new Date(raw.extractedAt)
      : new Date();
  return { ...raw, extractedAt } as ContinuitySession["primaryStyleReference"];
};

const serializeSceneProxy = (
  proxy: ContinuitySession["sceneProxy"],
): Record<string, unknown> => ({
  ...proxy,
  createdAt: proxy?.createdAt ? proxy.createdAt.getTime() : Date.now(),
});

const deserializeSceneProxy = (
  raw: Record<string, unknown>,
): ContinuitySession["sceneProxy"] => {
  const createdAt =
    typeof raw.createdAt === "number" ? new Date(raw.createdAt) : new Date();
  return { ...raw, createdAt } as ContinuitySession["sceneProxy"];
};
