/**
 * Studio records, read-only.
 *
 * Studio retired into /app (ADR-0027): its models are workflow profiles and
 * no new turn can start. Its projects, turns and pictures stay readable for
 * their owner, and a turn a dead process left `running` is still settled from
 * its own records when it is next read, so its reserved cents are released
 * against the daily cap exactly once.
 */

import { logger } from "@infrastructure/Logger";
import { StudioSpendLedger } from "./StudioSpendLedger";
import type { StudioProjectStore } from "./storage/StudioProjectStore";
import type {
  StudioCallRecord,
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
  getViewUrl(
    userId: string,
    storagePath: string,
  ): Promise<{ viewUrl: string; expiresAt: string; storagePath: string }>;
}

/**
 * Wire shape for the project index: the record plus a freshly signed URL for
 * its denormalized cover. Signing is best-effort — a project whose cover
 * cannot be signed (or which has none) is returned without one.
 */
export interface StudioProjectView extends StudioProjectRecord {
  coverUrl?: string | undefined;
  /**
   * A freshly signed URL for the bridged session picture (ADR-0022 decision
   * 4), minted per read from the project's OWN copy — never persisted.
   */
  originImageUrl?: string | undefined;
}

/** Wire shape for a turn: images decorated with fresh signed URLs. */
export interface StudioTurnView extends Omit<StudioTurnRecord, "calls"> {
  calls: Array<
    StudioCallRecord & {
      image?: (StudioCallRecord["image"] & { viewUrl?: string }) | undefined;
    }
  >;
}

export interface StudioServiceDeps {
  store: StudioProjectStore;
  storage: StudioImageStorage;
  dailyCapCents: number;
  /** Turns read per project; Studio refused turns past this bound (#121). */
  maxTurnsPerProject?: number;
  now?: () => Date;
  /**
   * How long a `running` turn must sit untouched before a read treats it as
   * interrupted and settles it from its records (#126).
   */
  interruptedTurnGraceMs?: number;
}

/** The turn cap Studio enforced at creation, so this read window is complete. */
const MAX_TURNS_PER_PROJECT = 500;

/**
 * Well above the longest a turn could run (parallel calls of at most 180 s,
 * each checkpointing), so only a turn no live process could touch is settled.
 */
const INTERRUPTED_TURN_GRACE_MS = 10 * 60 * 1000;

export class StudioService {
  private readonly store: StudioProjectStore;
  private readonly storage: StudioImageStorage;
  private readonly ledger: StudioSpendLedger;
  private readonly maxTurnsPerProject: number;
  private readonly interruptedTurnGraceMs: number;
  private readonly now: () => Date;
  private readonly log = logger.child({ service: "StudioService" });

  constructor(deps: StudioServiceDeps) {
    this.store = deps.store;
    this.storage = deps.storage;
    this.maxTurnsPerProject = deps.maxTurnsPerProject ?? MAX_TURNS_PER_PROJECT;
    this.interruptedTurnGraceMs =
      deps.interruptedTurnGraceMs ?? INTERRUPTED_TURN_GRACE_MS;
    this.now = deps.now ?? (() => new Date());
    this.ledger = new StudioSpendLedger({
      store: deps.store,
      dailyCapCents: deps.dailyCapCents,
      now: this.now,
    });
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

  /** The record, plus a freshly signed URL for a bridged session picture. */
  async getProjectView(
    userId: string,
    projectId: string,
  ): Promise<StudioProjectView> {
    const project = await this.getProject(userId, projectId);
    const bridgedImageId = project.origin?.bridgedImageId;
    if (!bridgedImageId) return project;

    const bridged = (project.attachments ?? []).find(
      (attachment) => attachment.id === bridgedImageId,
    );
    if (!bridged) return project;

    try {
      const { viewUrl } = await this.storage.getViewUrl(
        userId,
        bridged.storagePath,
      );
      return { ...project, originImageUrl: viewUrl };
    } catch (error) {
      this.log.warn("Failed to mint bridged picture view URL", {
        projectId,
        storagePath: bridged.storagePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return project;
    }
  }

  /** The owner's projects; covers are signed independently and degrade alone. */
  async listProjects(userId: string): Promise<StudioProjectView[]> {
    const projects = await this.store.listProjects(userId);
    return Promise.all(
      projects.map(async (project) => {
        if (!project.coverStoragePath) return project;
        try {
          const { viewUrl } = await this.storage.getViewUrl(
            userId,
            project.coverStoragePath,
          );
          return { ...project, coverUrl: viewUrl };
        } catch (error) {
          this.log.warn("Failed to mint studio cover view URL", {
            projectId: project.id,
            storagePath: project.coverStoragePath,
            error: error instanceof Error ? error.message : String(error),
          });
          return project;
        }
      }),
    );
  }

  /** Delete a project and its turns. Ownership reads as absence (404). */
  async deleteProject(userId: string, projectId: string): Promise<void> {
    await this.getProject(userId, projectId);
    await this.store.deleteProject(projectId);
  }

  async getTurnWithFreshUrls(
    userId: string,
    projectId: string,
    turnId: string,
  ): Promise<StudioTurnView> {
    await this.getProject(userId, projectId);
    const turn = await this.store.getTurn(projectId, turnId);
    if (!turn) {
      throw new StudioNotFoundError("Studio turn");
    }
    return this.decorateTurn(userId, await this.reconcileIfInterrupted(turn));
  }

  /** Every persisted turn, chronological, images decorated with fresh URLs. */
  async listTurnsWithFreshUrls(
    userId: string,
    projectId: string,
  ): Promise<StudioTurnView[]> {
    await this.getProject(userId, projectId);
    const turns = await this.store.listTurns(
      projectId,
      this.maxTurnsPerProject,
    );
    const reconciled = await Promise.all(
      turns.map((turn) => this.reconcileIfInterrupted(turn)),
    );
    return Promise.all(
      reconciled.map((turn) => this.decorateTurn(userId, turn)),
    );
  }

  /**
   * Recover a turn a process death left `running` (#126): once it has gone
   * untouched past the grace window, settle it from its own records, keeping
   * the calls that succeeded and releasing only the unspent cents.
   * Best-effort and idempotent at the store; a fault retries on the next read.
   */
  private async reconcileIfInterrupted(
    turn: StudioTurnRecord,
  ): Promise<StudioTurnRecord> {
    if (turn.status !== "running") return turn;
    if (this.now().getTime() - turn.updatedAtMs < this.interruptedTurnGraceMs) {
      return turn;
    }
    try {
      await this.ledger.recoverTurn(turn);
      return (await this.store.getTurn(turn.projectId, turn.id)) ?? turn;
    } catch (error) {
      this.log.warn(
        "Studio interrupted-turn recovery failed; will retry on next read",
        {
          projectId: turn.projectId,
          turnId: turn.id,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return turn;
    }
  }

  private async decorateTurn(
    userId: string,
    turn: StudioTurnRecord,
  ): Promise<StudioTurnView> {
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
            turnId: turn.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return call;
        }
      }),
    );
    return { ...turn, calls };
  }
}
