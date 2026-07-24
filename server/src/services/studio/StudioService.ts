/**
 * Studio turn loop (Milestone 1).
 *
 * Owns the operational contract from the plan's "Cost control and
 * robustness" section: atomic spend reservation before any fan-out,
 * per-call refunds on failure, partial-turn semantics, and async turn
 * execution (POST /turns responds as soon as the turn record exists; image
 * calls settle in the background and the client polls).
 *
 * The turn policy is HARDCODED at M1 (always generate 4 variants). The
 * LLM policy engine replaces `decideTurn` at M3 — the decision union,
 * store, and execution path are already shaped for it.
 */

import { randomUUID } from "node:crypto";
import { logger } from "@infrastructure/Logger";
import type { StudioModelRegistry } from "./StudioModelRegistry";
import type {
  ReplicateStudioImageRunner,
  StudioImageCallResult,
} from "./providers/ReplicateStudioImageRunner";
import {
  FirestoreStudioProjectStore,
  studioUsageDayKey,
} from "./storage/FirestoreStudioProjectStore";
import type {
  StudioCallRecord,
  StudioDecision,
  StudioModelSlug,
  StudioProjectRecord,
  StudioTurnRecord,
} from "./types";

export class StudioNotFoundError extends Error {
  public readonly statusCode = 404;

  constructor(what: string) {
    super(`${what} not found`);
    this.name = "StudioNotFoundError";
  }
}

/** Narrow storage port (structurally satisfied by StorageService). */
export interface StudioImageStorage {
  saveFromUrl(
    userId: string,
    sourceUrl: string,
    type: "preview-image",
    metadata?: Record<string, unknown>,
  ): Promise<{ storagePath: string }>;
  getViewUrl(
    userId: string,
    storagePath: string,
  ): Promise<{ viewUrl: string; expiresAt: string; storagePath: string }>;
}

/** Wire shape for turn polling: images decorated with fresh signed URLs. */
export interface StudioTurnView extends Omit<StudioTurnRecord, "calls"> {
  calls: Array<
    StudioCallRecord & {
      image?: (StudioCallRecord["image"] & { viewUrl?: string }) | undefined;
    }
  >;
}

export interface StudioServiceDeps {
  store: FirestoreStudioProjectStore;
  registry: StudioModelRegistry;
  runner: ReplicateStudioImageRunner;
  storage: StudioImageStorage;
  dailyCapCents: number;
  now?: () => Date;
  idFactory?: () => string;
}

export interface RunTurnResult {
  turnId: string;
  decision: StudioDecision;
  /**
   * Settles when the background image calls finish and the turn is
   * finalized. Routes ignore this (fire-and-forget); tests await it.
   */
  completion: Promise<void>;
}

const GENERATE_BATCH_SIZE = 4;
const TITLE_MAX_CHARS = 60;

export class StudioService {
  private readonly store: FirestoreStudioProjectStore;
  private readonly registry: StudioModelRegistry;
  private readonly runner: ReplicateStudioImageRunner;
  private readonly storage: StudioImageStorage;
  private readonly dailyCapCents: number;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly log = logger.child({ service: "StudioService" });

  constructor(deps: StudioServiceDeps) {
    this.store = deps.store;
    this.registry = deps.registry;
    this.runner = deps.runner;
    this.storage = deps.storage;
    this.dailyCapCents = deps.dailyCapCents;
    this.now = deps.now ?? (() => new Date());
    this.idFactory = deps.idFactory ?? (() => randomUUID());
  }

  async createProject(
    userId: string,
    title?: string,
  ): Promise<StudioProjectRecord> {
    const nowMs = this.now().getTime();
    const project: StudioProjectRecord = {
      id: this.idFactory(),
      userId,
      title: title?.trim() || "Untitled",
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };
    await this.store.createProject(project);
    return project;
  }

  async getProject(
    userId: string,
    projectId: string,
  ): Promise<StudioProjectRecord> {
    const project = await this.store.getProject(projectId);
    // Ownership mismatch reads as absence — never leak another user's ids.
    if (!project || project.userId !== userId) {
      throw new StudioNotFoundError("Studio project");
    }
    return project;
  }

  async listProjects(userId: string): Promise<StudioProjectRecord[]> {
    return this.store.listProjects(userId);
  }

  /** Rename and/or pin a model. `pinnedModel: null` clears the pin (Auto). */
  async updateProject(
    userId: string,
    projectId: string,
    patch: {
      title?: string | undefined;
      pinnedModel?: StudioModelSlug | null | undefined;
    },
  ): Promise<StudioProjectRecord> {
    const project = await this.getProject(userId, projectId);
    const update: Partial<StudioProjectRecord> = {
      updatedAtMs: this.now().getTime(),
    };
    if (patch.title !== undefined) {
      update.title = patch.title.trim() || project.title;
    }
    if (patch.pinnedModel !== undefined) {
      update.pinnedModel = patch.pinnedModel;
    }
    await this.store.updateProject(projectId, update);
    return { ...project, ...update };
  }

  async getTurn(
    userId: string,
    projectId: string,
    turnId: string,
  ): Promise<StudioTurnRecord> {
    await this.getProject(userId, projectId);
    const turn = await this.store.getTurn(projectId, turnId);
    if (!turn) {
      throw new StudioNotFoundError("Studio turn");
    }
    return turn;
  }

  /**
   * Turn for the polling route: stored images carry only storagePath, so a
   * fresh signed viewUrl is minted per read. A minting failure degrades to
   * an image without viewUrl (logged) rather than failing the poll.
   */
  async getTurnWithFreshUrls(
    userId: string,
    projectId: string,
    turnId: string,
  ): Promise<StudioTurnView> {
    const turn = await this.getTurn(userId, projectId, turnId);
    const calls = await Promise.all(
      turn.calls.map(async (call) => {
        if (!call.image) return call;
        try {
          const { viewUrl } = await this.storage.getViewUrl(
            userId,
            call.image.storagePath,
          );
          return { ...call, image: { ...call.image, viewUrl } };
        } catch (error) {
          this.log.warn("Failed to mint studio image view URL", {
            storagePath: call.image.storagePath,
            turnId,
            error: error instanceof Error ? error.message : String(error),
          });
          return call;
        }
      }),
    );
    return { ...turn, calls };
  }

  /**
   * Run one turn: decide (hardcoded M1 policy), atomically reserve spend,
   * persist the running turn, and kick off the image calls. Resolves as
   * soon as the turn is persisted — image work continues in the background.
   */
  async runTurn(
    userId: string,
    projectId: string,
    userMessage: string,
  ): Promise<RunTurnResult> {
    const project = await this.getProject(userId, projectId);
    const message = userMessage.trim();
    if (!message) {
      const error = new Error("Message is required") as Error & {
        statusCode: number;
      };
      error.statusCode = 400;
      throw error;
    }

    const decision = this.decideTurn(message);
    if (decision.action !== "generate") {
      throw new Error(
        `M1 policy only produces generate decisions, got: ${decision.action}`,
      );
    }

    // Pin wins when it resolves; stale pins revert to Auto (cheapest capable).
    const pinned = this.registry.resolvePin(project.pinnedModel);
    const model = pinned ?? this.registry.cheapestCapable(decision.capability);

    const nowMs = this.now().getTime();
    const turn: StudioTurnRecord = {
      id: this.idFactory(),
      projectId,
      userId,
      status: "running",
      userMessage: message,
      decision,
      resolvedModel: model.slug,
      calls: decision.variants.map((_, index) => ({
        index,
        status: "running" as const,
      })),
      reservedCents: model.costCentsPerCall * GENERATE_BATCH_SIZE,
      refundedCents: 0,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };

    const day = studioUsageDayKey(this.now());
    // Throws StudioCapExceededError before any image call can start.
    await this.store.reserveTurn({
      turn,
      day,
      capCents: this.dailyCapCents,
    });

    const completion = this.executeGenerateTurn(project, turn, day).catch(
      (error: unknown) => {
        this.log.error(
          "Studio turn execution crashed",
          error instanceof Error ? error : new Error(String(error)),
          { projectId, turnId: turn.id, userId },
        );
      },
    );

    return { turnId: turn.id, decision, completion };
  }

  /** M1 hardcoded policy: always generate 4 design variants of the message. */
  private decideTurn(message: string): StudioDecision {
    return {
      action: "generate",
      basePrompt: message,
      variants: [
        message,
        `${message} — alternative interpretation`,
        `${message} — minimal composition`,
        `${message} — bold composition`,
      ],
      capability: "design",
      suggestions: [
        "Give me more options",
        "Try it with a different style",
        "Make it simpler",
      ],
      title: message.slice(0, TITLE_MAX_CHARS),
    };
  }

  private async executeGenerateTurn(
    project: StudioProjectRecord,
    turn: StudioTurnRecord,
    day: string,
  ): Promise<void> {
    if (turn.decision.action !== "generate") return;
    const decision = turn.decision;
    const model = this.registry.getModel(turn.resolvedModel);
    const timeoutMs = this.registry.timeoutMsFor(model.slug);
    const perCallCents = model.costCentsPerCall;

    const settled = await Promise.allSettled(
      decision.variants.map((variant) =>
        this.runner
          .run({
            model: model.replicateId,
            input: this.registry.buildGenerateInput(
              model.slug,
              variant,
              decision.aspectRatio,
            ),
            userId: turn.userId,
            timeoutMs,
          })
          .then(async (result: StudioImageCallResult) => {
            const saved = await this.storage.saveFromUrl(
              turn.userId,
              result.imageUrl,
              "preview-image",
              {
                studioProjectId: project.id,
                studioTurnId: turn.id,
                model: model.slug,
              },
            );
            return { saved, variant };
          }),
      ),
    );

    const calls: StudioCallRecord[] = settled.map((outcome, index) => {
      if (outcome.status === "fulfilled") {
        return {
          index,
          status: "succeeded" as const,
          image: {
            id: this.idFactory(),
            storagePath: outcome.value.saved.storagePath,
            sourcePrompt: outcome.value.variant,
            model: model.slug,
          },
        };
      }
      const reason = outcome.reason as Error;
      return {
        index,
        status: "failed" as const,
        error: reason?.message ?? "Image call failed",
      };
    });

    const failedCount = calls.filter((c) => c.status === "failed").length;
    const succeededCount = calls.length - failedCount;
    const refundedCents = failedCount * perCallCents;

    // Failed calls never consume cap (plan: "Refunds").
    if (refundedCents > 0) {
      await this.store.refundCents(turn.userId, day, refundedCents);
    }

    const status =
      succeededCount === 0
        ? "failed"
        : failedCount > 0
          ? "partial"
          : "complete";

    await this.store.finalizeTurn(project.id, turn.id, {
      status,
      calls,
      refundedCents,
      updatedAtMs: this.now().getTime(),
    });

    // First generation titles the project (M1 heuristic; LLM title at M3).
    const patch: Partial<StudioProjectRecord> = {
      updatedAtMs: this.now().getTime(),
    };
    if (project.title === "Untitled" && decision.title) {
      patch.title = decision.title;
    }
    await this.store.updateProject(project.id, patch);
  }
}
