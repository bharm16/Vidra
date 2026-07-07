import { v4 as uuidv4 } from "uuid";
import { logger } from "@infrastructure/Logger";
import { generateId } from "@utils/uid";
import type {
  SessionDto,
  SessionContinuity,
  SessionContinuityShot,
  SessionStyleReference,
  SessionFrameBridge,
  SessionSeedInfo,
  SessionSceneProxy,
  SessionPrompt,
  SessionPromptVersionEntry,
} from "@shared/types/session";
import type {
  ContinuitySession,
  ContinuityShot,
  StyleReference,
  FrameBridge,
  SeedInfo,
  SceneProxy,
} from "@server/domain/continuity/types";
import type {
  SessionCreateRequest,
  SessionRecord,
  SessionUpdateRequest,
  SessionListOptions,
  SessionPromptUpdate,
  SessionHighlightUpdate,
  SessionOutputUpdate,
  SessionVersionsUpdate,
} from "./types";
import { SessionStore } from "./SessionStore";
import {
  enforceImmutableKeyframes,
  enforceImmutableVersions,
} from "@utils/immutableMedia";

/**
 * Minimal interface for the session → video-job cascade. Kept narrow so the
 * session domain doesn't pull in the full VideoJobStore at import time.
 */
export interface VideoJobCascade {
  cancelJobsForSession(sessionId: string): Promise<number>;
}

export class SessionService {
  private readonly log = logger.child({ service: "SessionService" });
  constructor(
    private sessionStore: SessionStore,
    private videoJobCascade?: VideoJobCascade,
  ) {}

  private async requireOwnedSession(
    userId: string,
    sessionId: string,
  ): Promise<SessionRecord> {
    const current = await this.sessionStore.get(sessionId);
    if (!current) {
      throw new SessionNotFoundError(sessionId);
    }
    if (current.userId !== userId) {
      throw new SessionAccessDeniedError(sessionId, userId, current.userId);
    }
    return current;
  }

  async createPromptSession(
    userId: string,
    request: SessionCreateRequest,
  ): Promise<SessionRecord> {
    const now = new Date();
    const prompt = request.prompt ? { ...request.prompt } : undefined;
    if (prompt) {
      if (!prompt.uuid) {
        prompt.uuid = uuidv4();
      }

      const existingSession = await this.sessionStore.findByPromptUuid(
        userId,
        prompt.uuid,
      );
      if (existingSession) {
        this.log.debug("Updating existing prompt session by prompt UUID", {
          userId,
          sessionId: existingSession.id,
          promptUuid: prompt.uuid,
        });
        return this.updateSession(existingSession.id, {
          ...(request.name !== undefined ? { name: request.name } : {}),
          prompt,
        });
      }
    }

    const session: SessionRecord = {
      id: this.generateSessionId(),
      userId,
      status: "active",
      createdAt: now,
      updatedAt: now,
      ...(request.name !== undefined ? { name: request.name } : {}),
      ...(prompt ? { prompt } : {}),
      ...(prompt?.uuid ? { promptUuid: prompt.uuid } : {}),
      hasContinuity: false,
    };

    await this.sessionStore.save(session);
    return session;
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    return this.sessionStore.get(sessionId);
  }

  async getSessionByPromptUuid(
    userId: string,
    promptUuid: string,
  ): Promise<SessionRecord | null> {
    return this.sessionStore.findByPromptUuid(userId, promptUuid);
  }

  async listSessions(
    userId: string,
    options: SessionListOptions = {},
  ): Promise<SessionRecord[]> {
    const sessions = await this.sessionStore.findByUser(userId, options.limit);
    const includePrompt = options.includePrompt ?? true;
    const includeContinuity = options.includeContinuity ?? true;

    const promptOnlyView = includePrompt && !includeContinuity;
    if (promptOnlyView) {
      return sessions.filter((session) => Boolean(session.prompt));
    }

    const continuityOnlyView = includeContinuity && !includePrompt;
    if (continuityOnlyView) {
      return sessions.filter((session) => Boolean(session.continuity));
    }

    return sessions;
  }

  async updateSession(
    sessionId: string,
    updates: SessionUpdateRequest,
  ): Promise<SessionRecord> {
    const current = await this.sessionStore.get(sessionId);
    if (!current) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    let mergedPrompt = updates.prompt
      ? {
          ...(current.prompt ?? { input: "", output: "" }),
          ...updates.prompt,
        }
      : current.prompt;

    if (updates.prompt && mergedPrompt) {
      if (updates.prompt.keyframes !== undefined) {
        const enforcedKeyframes = enforceImmutableKeyframes(
          current.prompt?.keyframes ?? null,
          mergedPrompt.keyframes ?? null,
        );
        if (enforcedKeyframes.warnings.length) {
          this.log.warn(
            "Preserved immutable keyframe references during session update",
            {
              sessionId,
              warningCount: enforcedKeyframes.warnings.length,
            },
          );
        }
        mergedPrompt = {
          ...mergedPrompt,
          keyframes: enforcedKeyframes.keyframes ?? null,
        };
      }
      if (updates.prompt.versions !== undefined) {
        const enforcedVersions = enforceImmutableVersions(
          current.prompt?.versions ?? null,
          mergedPrompt.versions ?? null,
        );
        if (enforcedVersions.warnings.length) {
          this.log.warn(
            "Preserved immutable media references during session update",
            {
              sessionId,
              warningCount: enforcedVersions.warnings.length,
            },
          );
        }
        const nextVersions = enforcedVersions.versions ?? undefined;
        mergedPrompt = {
          ...mergedPrompt,
          ...(nextVersions !== undefined ? { versions: nextVersions } : {}),
        };
      }
    }

    const next: SessionRecord = {
      ...current,
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.description !== undefined
        ? { description: updates.description }
        : {}),
      ...(updates.status ? { status: updates.status } : {}),
      ...(mergedPrompt ? { prompt: mergedPrompt } : {}),
      ...(mergedPrompt?.uuid ? { promptUuid: mergedPrompt.uuid } : {}),
      updatedAt: new Date(),
    };

    await this.sessionStore.save(next);
    return next;
  }

  async updateSessionForUser(
    userId: string,
    sessionId: string,
    updates: SessionUpdateRequest,
  ): Promise<SessionRecord> {
    await this.requireOwnedSession(userId, sessionId);
    return this.updateSession(sessionId, updates);
  }

  async updatePrompt(
    sessionId: string,
    updates: SessionPromptUpdate,
  ): Promise<SessionRecord> {
    const promptUpdates: Partial<SessionPrompt> = {
      ...(updates.title !== undefined ? { title: updates.title } : {}),
      ...(updates.input !== undefined ? { input: updates.input } : {}),
      ...(updates.output !== undefined ? { output: updates.output } : {}),
      ...(updates.targetModel !== undefined
        ? { targetModel: updates.targetModel }
        : {}),
      ...(updates.generationParams !== undefined
        ? { generationParams: updates.generationParams }
        : {}),
      ...(updates.keyframes !== undefined
        ? { keyframes: updates.keyframes }
        : {}),
      ...(updates.mode !== undefined ? { mode: updates.mode } : {}),
    };
    return this.updateSession(sessionId, { prompt: promptUpdates });
  }

  async updatePromptForUser(
    userId: string,
    sessionId: string,
    updates: SessionPromptUpdate,
  ): Promise<SessionRecord> {
    await this.requireOwnedSession(userId, sessionId);
    return this.updatePrompt(sessionId, updates);
  }

  async updateHighlights(
    sessionId: string,
    updates: SessionHighlightUpdate,
  ): Promise<SessionRecord> {
    const current = await this.sessionStore.get(sessionId);
    if (!current) throw new Error(`Session not found: ${sessionId}`);
    const prompt = current.prompt ?? { input: "", output: "" };
    const nextVersions = Array.isArray(prompt.versions)
      ? [...prompt.versions]
      : [];
    if (updates.versionEntry) {
      const timestamp =
        updates.versionEntry.timestamp ?? new Date().toISOString();
      const basePromptText =
        (typeof prompt.output === "string" && prompt.output.trim().length > 0
          ? prompt.output
          : prompt.input) || "";
      const nextEntry: SessionPromptVersionEntry = {
        versionId: generateId("highlight"),
        signature: "highlight-update",
        prompt: basePromptText,
        timestamp,
      };
      nextVersions.push({
        ...nextEntry,
      });
    }
    const next = {
      ...current,
      prompt: {
        ...prompt,
        ...(updates.highlightCache !== undefined
          ? { highlightCache: updates.highlightCache }
          : {}),
        ...(updates.versionEntry ? { versions: nextVersions } : {}),
      },
      updatedAt: new Date(),
    };
    await this.sessionStore.save(next);
    return next;
  }

  async updateHighlightsForUser(
    userId: string,
    sessionId: string,
    updates: SessionHighlightUpdate,
  ): Promise<SessionRecord> {
    await this.requireOwnedSession(userId, sessionId);
    return this.updateHighlights(sessionId, updates);
  }

  async updateOutput(
    sessionId: string,
    updates: SessionOutputUpdate,
  ): Promise<SessionRecord> {
    const promptUpdates: Partial<SessionPrompt> = {
      ...(updates.output !== undefined ? { output: updates.output } : {}),
    };
    return this.updateSession(sessionId, { prompt: promptUpdates });
  }

  async updateOutputForUser(
    userId: string,
    sessionId: string,
    updates: SessionOutputUpdate,
  ): Promise<SessionRecord> {
    return this.updateSessionForUser(userId, sessionId, { prompt: updates });
  }

  async updateVersions(
    sessionId: string,
    updates: SessionVersionsUpdate,
  ): Promise<SessionRecord> {
    const current = await this.sessionStore.get(sessionId);
    if (!current) throw new Error(`Session not found: ${sessionId}`);
    const prompt = current.prompt ?? { input: "", output: "" };
    let nextVersions = updates.versions;
    if (updates.versions !== undefined) {
      const enforced = enforceImmutableVersions(
        prompt.versions ?? null,
        updates.versions ?? null,
      );
      nextVersions = enforced.versions ?? undefined;
      if (enforced.warnings.length) {
        this.log.warn(
          "Preserved immutable media references during session version update",
          {
            sessionId,
            warningCount: enforced.warnings.length,
          },
        );
      }
    }
    const next = {
      ...current,
      prompt: {
        ...prompt,
        ...(nextVersions !== undefined ? { versions: nextVersions } : {}),
      },
      updatedAt: new Date(),
    };
    await this.sessionStore.save(next);
    return next;
  }

  async updateVersionsForUser(
    userId: string,
    sessionId: string,
    updates: SessionVersionsUpdate,
  ): Promise<SessionRecord> {
    await this.requireOwnedSession(userId, sessionId);
    return this.updateVersions(sessionId, updates);
  }

  /**
   * Atomically append a generation record to a specific prompt version's
   * generations array. This is the single-writer path for
   * "server-authoritative generation persistence" — preview handlers call this
   * after successfully generating media so the generation is durable before
   * the client re-fetches the session.
   *
   * If the target version does not exist yet, it is created in place with the
   * provided promptVersionId so the append is still durable. This handles the
   * draft-to-persisted transition where the client may POST with a version id
   * that only just materialized.
   *
   * NOTE: read-modify-write is not transactionally atomic across concurrent
   * calls in the current store. For human-paced UI flows the race window is
   * negligible; migrating to a transaction when Firestore backs the store is
   * a follow-up.
   */
  async appendGenerationToVersion(
    userId: string,
    sessionId: string,
    promptVersionId: string,
    generation: Record<string, unknown>,
  ): Promise<SessionRecord> {
    const current = await this.requireOwnedSession(userId, sessionId);
    const prompt = current.prompt ?? { input: "", output: "" };
    const versions = Array.isArray(prompt.versions) ? [...prompt.versions] : [];

    // Idempotent by generation id — a worker retry after a flaky
    // markCompleted could call us twice for the same job. Upsert by id
    // rather than appending blindly so we don't leave duplicates in the
    // session's generations array.
    const incomingId = typeof generation.id === "string" ? generation.id : null;

    const upsertGenerations = (
      existing: Array<Record<string, unknown>> | undefined,
    ): Array<Record<string, unknown>> => {
      const current = Array.isArray(existing) ? existing : [];
      if (!incomingId) return [...current, generation];
      const existingIdx = current.findIndex(
        (g) => typeof g.id === "string" && g.id === incomingId,
      );
      if (existingIdx >= 0) {
        const next = [...current];
        next[existingIdx] = { ...current[existingIdx], ...generation };
        return next;
      }
      return [...current, generation];
    };

    const idx = versions.findIndex((v) => v.versionId === promptVersionId);
    if (idx >= 0) {
      const existing = versions[idx]!;
      versions[idx] = {
        ...existing,
        generations: upsertGenerations(existing.generations),
      };
    } else {
      const basePromptText =
        (typeof prompt.output === "string" && prompt.output.trim().length > 0
          ? prompt.output
          : prompt.input) || "";
      versions.push({
        versionId: promptVersionId,
        signature: "server-append",
        prompt: basePromptText,
        timestamp: new Date().toISOString(),
        generations: upsertGenerations(undefined),
      });
    }

    const next: SessionRecord = {
      ...current,
      prompt: { ...prompt, versions },
      updatedAt: new Date(),
    };
    await this.sessionStore.save(next);
    return next;
  }

  /**
   * Soft-remove a generation (M5 / ADR-0012). Leaf-only: a generation is
   * removable iff no LIVE record in the session names it as ancestor — an
   * already-archived child is gone from the space, so it doesn't keep its
   * parent alive. The record persists with `archived: true`; the space
   * excludes it (computeLineageLayout skips archived). Ownership is enforced
   * by requireOwnedSession; throws GenerationNotRemovableError for a non-leaf
   * and GenerationNotFoundError for an unknown id.
   */
  async archiveGeneration(
    userId: string,
    sessionId: string,
    generationId: string,
  ): Promise<SessionRecord> {
    const current = await this.requireOwnedSession(userId, sessionId);
    const prompt = current.prompt ?? { input: "", output: "" };
    const versions = Array.isArray(prompt.versions) ? prompt.versions : [];

    const hasLiveChild = versions.some((version) =>
      (version.generations ?? []).some(
        (gen) =>
          gen.archived !== true && gen.ancestorGenerationId === generationId,
      ),
    );
    if (hasLiveChild) {
      throw new GenerationNotRemovableError(generationId);
    }

    let found = false;
    const nextVersions = versions.map((version) => {
      const generations = version.generations;
      if (!Array.isArray(generations)) return version;
      const idx = generations.findIndex((gen) => gen.id === generationId);
      if (idx < 0) return version;
      found = true;
      const nextGenerations = [...generations];
      nextGenerations[idx] = { ...generations[idx], archived: true };
      return { ...version, generations: nextGenerations };
    });
    if (!found) {
      throw new GenerationNotFoundError(generationId);
    }

    const next: SessionRecord = {
      ...current,
      prompt: { ...prompt, versions: nextVersions },
      updatedAt: new Date(),
    };
    await this.sessionStore.save(next);
    return next;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.cascadeVideoJobs(sessionId);
    await this.sessionStore.delete(sessionId);
  }

  async deleteSessionForUser(userId: string, sessionId: string): Promise<void> {
    await this.requireOwnedSession(userId, sessionId);
    await this.cascadeVideoJobs(sessionId);
    await this.sessionStore.delete(sessionId);
  }

  private async cascadeVideoJobs(sessionId: string): Promise<void> {
    if (!this.videoJobCascade) return;
    try {
      const cancelled =
        await this.videoJobCascade.cancelJobsForSession(sessionId);
      if (cancelled > 0) {
        this.log.info("Cascaded video job cancellation on session delete", {
          sessionId,
          cancelled,
        });
      }
    } catch (error) {
      // Non-fatal: we prefer to complete the session delete even if cascade
      // fails. The reconciler will catch orphaned in-flight jobs.
      this.log.warn("Video job cascade failed during session delete", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  toDto(session: SessionRecord): SessionDto {
    return {
      id: session.id,
      userId: session.userId,
      ...(session.name ? { name: session.name } : {}),
      ...(session.description ? { description: session.description } : {}),
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      ...(session.prompt ? { prompt: session.prompt } : {}),
      ...(session.continuity
        ? { continuity: this.mapContinuity(session.continuity) }
        : {}),
    };
  }

  private mapContinuity(session: ContinuitySession): SessionContinuity {
    return {
      shots: session.shots.map((shot) => this.mapShot(shot)),
      primaryStyleReference: session.primaryStyleReference
        ? this.mapStyleReference(session.primaryStyleReference)
        : null,
      sceneProxy: session.sceneProxy
        ? this.mapSceneProxy(session.sceneProxy)
        : null,
      settings: session.defaultSettings,
    };
  }

  private mapShot(shot: ContinuityShot): SessionContinuityShot {
    const mappedCamera = shot.camera
      ? {
          ...(shot.camera.yaw !== undefined ? { yaw: shot.camera.yaw } : {}),
          ...(shot.camera.pitch !== undefined
            ? { pitch: shot.camera.pitch }
            : {}),
          ...(shot.camera.roll !== undefined ? { roll: shot.camera.roll } : {}),
          ...(shot.camera.dolly !== undefined
            ? { dolly: shot.camera.dolly }
            : {}),
        }
      : null;

    return {
      id: shot.id,
      sessionId: shot.sessionId,
      sequenceIndex: shot.sequenceIndex,
      userPrompt: shot.userPrompt,
      continuityMode: shot.continuityMode,
      styleStrength: shot.styleStrength,
      styleReferenceId: shot.styleReferenceId,
      modelId: shot.modelId,
      status: shot.status,
      createdAt: shot.createdAt.toISOString(),
      ...(shot.generationMode ? { generationMode: shot.generationMode } : {}),
      ...(shot.generatedAt
        ? { generatedAt: shot.generatedAt.toISOString() }
        : {}),
      ...(shot.characterAssetId
        ? { characterAssetId: shot.characterAssetId }
        : {}),
      ...(shot.faceStrength !== undefined
        ? { faceStrength: shot.faceStrength }
        : {}),
      ...(mappedCamera && Object.keys(mappedCamera).length > 0
        ? { camera: mappedCamera }
        : {}),
      ...(shot.seedInfo ? { seedInfo: this.mapSeedInfo(shot.seedInfo) } : {}),
      ...(shot.inheritedSeed !== undefined
        ? { inheritedSeed: shot.inheritedSeed }
        : {}),
      ...(shot.videoAssetId ? { videoAssetId: shot.videoAssetId } : {}),
      ...(shot.previewAssetId ? { previewAssetId: shot.previewAssetId } : {}),
      ...(shot.generatedKeyframeUrl
        ? { generatedKeyframeUrl: shot.generatedKeyframeUrl }
        : {}),
      ...(shot.styleTransferApplied !== undefined
        ? { styleTransferApplied: shot.styleTransferApplied }
        : {}),
      ...(shot.styleDegraded !== undefined
        ? { styleDegraded: shot.styleDegraded }
        : {}),
      ...(shot.styleDegradedReason
        ? { styleDegradedReason: shot.styleDegradedReason }
        : {}),
      ...(shot.sceneProxyRenderUrl
        ? { sceneProxyRenderUrl: shot.sceneProxyRenderUrl }
        : {}),
      ...(shot.continuityMechanismUsed
        ? { continuityMechanismUsed: shot.continuityMechanismUsed }
        : {}),
      ...(shot.styleScore !== undefined ? { styleScore: shot.styleScore } : {}),
      ...(shot.identityScore !== undefined
        ? { identityScore: shot.identityScore }
        : {}),
      ...(shot.qualityScore !== undefined
        ? { qualityScore: shot.qualityScore }
        : {}),
      ...(shot.retryCount !== undefined ? { retryCount: shot.retryCount } : {}),
      ...(shot.error ? { error: shot.error } : {}),
      ...(shot.versions !== undefined ? { versions: shot.versions } : {}),
      ...(shot.frameBridge
        ? { frameBridge: this.mapFrameBridge(shot.frameBridge) }
        : {}),
      ...(shot.styleReference
        ? { styleReference: this.mapStyleReference(shot.styleReference) }
        : {}),
    };
  }

  private mapStyleReference(ref: StyleReference): SessionStyleReference {
    return {
      ...ref,
      extractedAt: ref.extractedAt?.toISOString(),
    };
  }

  private mapFrameBridge(frame: FrameBridge): SessionFrameBridge {
    return {
      ...frame,
      extractedAt: frame.extractedAt.toISOString(),
    };
  }

  private mapSeedInfo(seed: SeedInfo): SessionSeedInfo {
    return {
      ...seed,
      extractedAt: seed.extractedAt.toISOString(),
    };
  }

  private mapSceneProxy(proxy: SceneProxy): SessionSceneProxy {
    return {
      ...proxy,
      createdAt: proxy.createdAt?.toISOString(),
    };
  }

  private generateSessionId(): string {
    return generateId("session");
  }
}

export class SessionAccessDeniedError extends Error {
  constructor(
    readonly sessionId: string,
    readonly requestUserId: string,
    readonly ownerUserId: string,
  ) {
    super(`Access denied for session ${sessionId}`);
    this.name = "SessionAccessDeniedError";
  }
}

export class SessionNotFoundError extends Error {
  constructor(readonly sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}

export class GenerationNotFoundError extends Error {
  constructor(readonly generationId: string) {
    super(`Generation not found: ${generationId}`);
    this.name = "GenerationNotFoundError";
  }
}

export class GenerationNotRemovableError extends Error {
  constructor(readonly generationId: string) {
    super(`Generation has descendants and cannot be removed: ${generationId}`);
    this.name = "GenerationNotRemovableError";
  }
}
