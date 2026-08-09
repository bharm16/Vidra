/**
 * Studio turn loop.
 *
 * Owns the operational contract from the plan's "Cost control and
 * robustness" section: atomic spend reservation before any fan-out,
 * per-call refunds on failure, partial-turn semantics, and async turn
 * execution (POST /turns responds as soon as the turn record exists; image
 * calls settle in the background and the client polls).
 *
 * Since M3 the per-turn decision comes from StudioPolicyEngine (the
 * conversation LLM). This service stays Layer-2: it executes decisions,
 * never writes prompts. Conversational decisions (clarify / diagnose /
 * negotiate) are terminal immediately — no reservation, no image calls.
 */

import { randomUUID } from "node:crypto";
import { logger } from "@infrastructure/Logger";
import { validatePathOwnership } from "@services/storage/utils/pathUtils";
import type { StudioModelRegistry } from "./StudioModelRegistry";
import type {
  StudioThinkingHooks,
  StudioTurnPolicy,
} from "./StudioPolicyEngine";
import type {
  StudioImageCallResult,
  StudioImageRunner,
} from "./providers/types";
import { StudioSpendLedger, type StudioReservation } from "./StudioSpendLedger";
import type { FirestoreStudioProjectStore } from "./storage/FirestoreStudioProjectStore";
import type {
  StudioAttachment,
  StudioCallRecord,
  StudioDecision,
  StudioImageRecord,
  StudioModelEntry,
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

/**
 * Wire shape for the project index: the record plus a freshly signed URL for
 * its denormalized cover. Signing is best-effort — a project whose cover
 * cannot be signed (or which has none yet) is returned without one, and the
 * index renders its placeholder.
 */
export interface StudioProjectView extends StudioProjectRecord {
  coverUrl?: string | undefined;
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
  runner: StudioImageRunner;
  storage: StudioImageStorage;
  policy: StudioTurnPolicy;
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

/** S-12: user-uploaded reference images per project. */
const MAX_ATTACHMENTS = 12;
const TITLE_MAX_CHARS = 60;

/** Every stored image id across a project's turns (succeeded calls only). */
function imageIdsOf(turns: readonly StudioTurnRecord[]): Set<string> {
  const imageIds = new Set<string>();
  for (const turn of turns) {
    for (const call of turn.calls) {
      if (call.status === "succeeded" && call.image) {
        imageIds.add(call.image.id);
      }
    }
  }
  return imageIds;
}

/**
 * Actions this service can execute at M3. edit/transform join at M4 (their
 * execution paths land there); until then the policy engine rejects them
 * with a corrective retry, exactly like a schema violation.
 *
 * clarify is FIRST-MESSAGE-ONLY (behavior 1: follow-ups never re-trigger
 * clarifying questions — regression caught live 2026-07-24): once any turn
 * exists, it is removed from the allowed set, so a proposed re-clarify is
 * structurally rejected rather than merely discouraged in the prompt.
 *
 * edit/transform need stored images, which can only exist after a prior
 * turn — they are follow-up actions by construction.
 */
const FIRST_TURN_ACTIONS = [
  "clarify",
  "generate",
  "diagnose",
  "negotiate",
] as const satisfies readonly StudioDecision["action"][];

const FOLLOW_UP_ACTIONS = [
  "generate",
  "edit",
  "transform",
  "diagnose",
  "negotiate",
] as const satisfies readonly StudioDecision["action"][];

export class StudioService {
  private readonly store: FirestoreStudioProjectStore;
  private readonly registry: StudioModelRegistry;
  private readonly runner: StudioImageRunner;
  private readonly storage: StudioImageStorage;
  private readonly policy: StudioTurnPolicy;
  private readonly ledger: StudioSpendLedger;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly log = logger.child({ service: "StudioService" });

  constructor(deps: StudioServiceDeps) {
    this.store = deps.store;
    this.registry = deps.registry;
    this.runner = deps.runner;
    this.storage = deps.storage;
    this.policy = deps.policy;
    this.now = deps.now ?? (() => new Date());
    this.idFactory = deps.idFactory ?? (() => randomUUID());
    this.ledger = new StudioSpendLedger({
      store: deps.store,
      dailyCapCents: deps.dailyCapCents,
      now: this.now,
    });
  }

  /**
   * Public picker roster: display data only — Replicate IDs and cost
   * estimates never leave the server (plan: "Model roster"). Latency hints
   * are the only per-model hint the picker shows (no cost, per S-37).
   */
  getModelRoster(): Array<{
    slug: string;
    displayName: string;
    capabilities: readonly string[];
    latencyHintSeconds: number;
  }> {
    return this.registry.listModels().map((entry) => ({
      slug: entry.slug,
      displayName: entry.displayName,
      capabilities: entry.capabilities,
      latencyHintSeconds: entry.latencyHintSeconds,
    }));
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

  /**
   * The project index's data. Covers are signed concurrently and degrade
   * independently: one unsignable path costs that row its thumbnail, never
   * the whole list (same policy decorateTurn uses for thread images).
   */
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

  /**
   * The cover fields for a settled turn's calls, or nothing when the turn
   * produced no image. The LAST succeeded call wins: a project's cover is
   * where the work got to, which is what "resume" should show.
   */
  private coverPatch(
    calls: readonly StudioCallRecord[],
  ): Pick<StudioProjectRecord, "coverImageId" | "coverStoragePath"> | null {
    for (let i = calls.length - 1; i >= 0; i -= 1) {
      const call = calls[i];
      if (call?.status === "succeeded" && call.image) {
        return {
          coverImageId: call.image.id,
          coverStoragePath: call.image.storagePath,
        };
      }
    }
    return null;
  }

  /**
   * Rename, pin a model, and/or set the selection. `pinnedModel: null`
   * clears the pin (Auto); `selectedImageId: null` clears the selection.
   * A non-null selection must reference an image stored in THIS project —
   * edits source from it (behavior 6), so a dangling id is a 400.
   */
  async updateProject(
    userId: string,
    projectId: string,
    patch: {
      title?: string | undefined;
      pinnedModel?: StudioModelSlug | null | undefined;
      selectedImageId?: string | null | undefined;
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
    if (patch.selectedImageId !== undefined) {
      if (patch.selectedImageId !== null) {
        const imageIds = await this.collectProjectImageIds(projectId);
        if (!imageIds.has(patch.selectedImageId)) {
          const error = new Error(
            "selectedImageId does not reference an image in this project",
          ) as Error & { statusCode: number };
          error.statusCode = 400;
          throw error;
        }
      }
      update.selectedImageId = patch.selectedImageId;
    }
    await this.store.updateProject(projectId, update);
    return { ...project, ...update };
  }

  private async collectProjectImageIds(
    projectId: string,
  ): Promise<Set<string>> {
    const ids = imageIdsOf(await this.store.listTurns(projectId));
    const project = await this.store.getProject(projectId);
    for (const attachment of project?.attachments ?? []) {
      ids.add(attachment.id);
    }
    return ids;
  }

  /**
   * Register a user-uploaded reference image (S-12). The bytes are already
   * in GCS via the storage route's signed-URL flow; this records the
   * attachment on the project so the conversation LLM can reference it as
   * an edit/transform source by id.
   */
  async addAttachment(
    userId: string,
    projectId: string,
    input: { storagePath: string; filename: string },
  ): Promise<StudioAttachment & { viewUrl: string }> {
    const project = await this.getProject(userId, projectId);
    const attachments = project.attachments ?? [];
    if (attachments.length >= MAX_ATTACHMENTS) {
      const error = new Error(
        `Attachment limit reached (${MAX_ATTACHMENTS} per project)`,
      ) as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }
    // The signed-URL flow scopes uploads under the caller's own prefix;
    // registering a path outside it would let ids alias other users' files.
    // Ownership is the storage module's rule — an anchored `users/<uid>/`
    // prefix, not a substring: `users/xabcy/…` is NOT owned by `abc`.
    if (!validatePathOwnership(input.storagePath, userId)) {
      const error = new Error("storagePath is not yours") as Error & {
        statusCode: number;
      };
      error.statusCode = 400;
      throw error;
    }

    // Minting the URL BEFORE the write is the second gate: getViewUrl runs
    // the same ownership check inside storage and throws 403 on a foreign
    // path. Its failure must fail the request — swallowing it registered
    // the attachment anyway, which is what made the check advisory.
    const { viewUrl } = await this.storage.getViewUrl(
      userId,
      input.storagePath,
    );

    const attachment: StudioAttachment = {
      id: `att-${this.idFactory()}`,
      storagePath: input.storagePath,
      filename: input.filename.trim().slice(0, 120) || "image",
      createdAtMs: this.now().getTime(),
    };
    await this.store.updateProject(projectId, {
      attachments: [...attachments, attachment],
      updatedAtMs: attachment.createdAtMs,
    });

    return { ...attachment, viewUrl };
  }

  /** Delete a project and its turns. Ownership reads as absence (404). */
  async deleteProject(userId: string, projectId: string): Promise<void> {
    await this.getProject(userId, projectId);
    await this.store.deleteProject(projectId);
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
    return this.decorateTurn(userId, turn);
  }

  /**
   * Full thread for project reopen: every persisted turn, chronological,
   * images decorated like the polling route.
   */
  async listTurnsWithFreshUrls(
    userId: string,
    projectId: string,
  ): Promise<StudioTurnView[]> {
    await this.getProject(userId, projectId);
    const turns = await this.store.listTurns(projectId);
    return Promise.all(turns.map((turn) => this.decorateTurn(userId, turn)));
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

  /**
   * Run one turn: ask the policy engine for a decision, then execute it.
   * Generate decisions atomically reserve spend, persist the running turn,
   * and kick off image calls in the background. Conversational decisions
   * (clarify / diagnose / negotiate) persist as already-terminal turns —
   * they cost nothing and are never blocked by the spend cap.
   */
  async runTurn(
    userId: string,
    projectId: string,
    userMessage: string,
    hooks?: StudioThinkingHooks,
    attachmentIds?: readonly string[],
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

    const history = await this.store.listTurns(projectId);
    const projectImageIds = imageIdsOf(history);
    const attachments = project.attachments ?? [];
    for (const attachment of attachments) {
      projectImageIds.add(attachment.id);
    }
    const messageAttachmentIds = (attachmentIds ?? []).filter((id) =>
      attachments.some((attachment) => attachment.id === id),
    );

    // Pin wins when it resolves; stale pins revert to Auto (cheapest capable).
    const pinned = this.registry.resolvePin(project.pinnedModel);

    const decision = await this.policy.decideTurn(
      {
        userMessage: message,
        projectTitle: project.title,
        pinnedModel: pinned,
        roster: this.registry.listModels(),
        history,
        selectedImageId: project.selectedImageId ?? null,
        projectImageIds,
        attachments,
        messageAttachmentIds,
        allowedActions:
          history.length === 0 ? FIRST_TURN_ACTIONS : FOLLOW_UP_ACTIONS,
      },
      hooks,
    );

    switch (decision.action) {
      case "generate":
        return this.startGenerateTurn(
          project,
          message,
          decision,
          pinned,
          messageAttachmentIds,
        );
      case "edit":
        return this.startEditTurn(
          project,
          history,
          message,
          decision,
          pinned,
          messageAttachmentIds,
        );
      case "transform":
        return this.startTransformTurn(
          project,
          history,
          message,
          decision,
          messageAttachmentIds,
        );
      default:
        return this.saveConversationalTurn(
          project,
          message,
          decision,
          messageAttachmentIds,
        );
    }
  }

  private async startGenerateTurn(
    project: StudioProjectRecord,
    message: string,
    decision: Extract<StudioDecision, { action: "generate" }>,
    pinned: StudioModelEntry | null,
    attachmentIds: readonly string[],
  ): Promise<RunTurnResult> {
    const model = pinned ?? this.registry.cheapestCapable(decision.capability);

    const turn = this.buildRunningTurn(project, message, decision, {
      resolvedModel: model.slug,
      callCount: GENERATE_BATCH_SIZE,
      reservedCents: model.costCentsPerCall * GENERATE_BATCH_SIZE,
      attachmentIds,
    });

    const { completion } = await this.ledger.reserve(turn, (reservation) =>
      this.executeGenerateTurn(project, turn, reservation),
    );
    return { turnId: turn.id, decision, completion };
  }

  /**
   * Edit: the LLM's instruction + 1..14 stored source images into an
   * edit-capable model (behavior 6). A pin only applies when it can edit —
   * incapable pins never reach here (the policy engine negotiates instead).
   */
  private async startEditTurn(
    project: StudioProjectRecord,
    history: StudioTurnRecord[],
    message: string,
    decision: Extract<StudioDecision, { action: "edit" }>,
    pinned: StudioModelEntry | null,
    attachmentIds: readonly string[],
  ): Promise<RunTurnResult> {
    const model =
      pinned && pinned.capabilities.includes("edit")
        ? pinned
        : this.registry.editDefault();

    const sources = this.resolveSourceImages(
      history,
      project.attachments ?? [],
      decision.sourceImageIds,
    );

    const turn = this.buildRunningTurn(project, message, decision, {
      resolvedModel: model.slug,
      callCount: 1,
      reservedCents: model.costCentsPerCall,
      attachmentIds,
    });

    const { completion } = await this.ledger.reserve(
      turn,
      async (reservation) => {
        const timeoutMs = this.registry.timeoutMsFor(model.slug);
        const sourceUrls = await Promise.all(
          sources.map(async (image) => {
            const { viewUrl } = await this.storage.getViewUrl(
              turn.userId,
              image.storagePath,
            );
            return viewUrl;
          }),
        );
        await this.settleSingleCallTurn(project, turn, reservation, {
          producedBy: model.slug,
          sourcePrompt: decision.instruction,
          run: () =>
            this.runner.run({
              model: model.replicateId,
              input: this.registry.buildEditInput(
                model.slug,
                decision.instruction,
                sourceUrls,
              ),
              userId: turn.userId,
              timeoutMs,
            }),
        });
      },
    );
    return { turnId: turn.id, decision, completion };
  }

  /** Transform: a prompt-less utility over one stored image (S-30). */
  private async startTransformTurn(
    project: StudioProjectRecord,
    history: StudioTurnRecord[],
    message: string,
    decision: Extract<StudioDecision, { action: "transform" }>,
    attachmentIds: readonly string[],
  ): Promise<RunTurnResult> {
    const utility = this.registry.getUtility(decision.operation);
    const [source] = this.resolveSourceImages(
      history,
      project.attachments ?? [],
      [decision.sourceImageId],
    );
    if (!source) {
      throw new Error("Transform source image not found");
    }

    const turn = this.buildRunningTurn(project, message, decision, {
      callCount: 1,
      reservedCents: utility.costCentsPerCall,
      attachmentIds,
    });

    const { completion } = await this.ledger.reserve(
      turn,
      async (reservation) => {
        const { viewUrl } = await this.storage.getViewUrl(
          turn.userId,
          source.storagePath,
        );
        await this.settleSingleCallTurn(project, turn, reservation, {
          producedBy: decision.operation,
          sourcePrompt: `${decision.operation} of ${source.id}`,
          run: () =>
            this.runner.run({
              model: utility.replicateId,
              input: this.registry.buildUtilityInput(
                decision.operation,
                viewUrl,
              ),
              userId: turn.userId,
              timeoutMs: this.registry.timeoutMsForUtility(decision.operation),
            }),
        });
      },
    );
    return { turnId: turn.id, decision, completion };
  }

  /** Shared turn-record scaffold for spend-bearing turns. */
  private buildRunningTurn(
    project: StudioProjectRecord,
    message: string,
    decision: StudioDecision,
    options: {
      resolvedModel?: StudioModelSlug;
      callCount: number;
      reservedCents: number;
      attachmentIds?: readonly string[];
    },
  ): StudioTurnRecord {
    const nowMs = this.now().getTime();
    return {
      id: this.idFactory(),
      projectId: project.id,
      userId: project.userId,
      status: "running",
      userMessage: message,
      decision,
      ...(options.resolvedModel
        ? { resolvedModel: options.resolvedModel }
        : {}),
      ...(options.attachmentIds && options.attachmentIds.length > 0
        ? { attachmentIds: [...options.attachmentIds] }
        : {}),
      calls: Array.from({ length: options.callCount }, (_, index) => ({
        index,
        status: "running" as const,
      })),
      reservedCents: options.reservedCents,
      refundedCents: 0,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };
  }

  /**
   * Look up stored image records for validated source ids. The policy
   * engine already verified existence; a miss here means turn data changed
   * mid-flight and is a hard error.
   */
  private resolveSourceImages(
    history: StudioTurnRecord[],
    attachments: readonly StudioAttachment[],
    sourceImageIds: readonly string[],
  ): Array<{ id: string; storagePath: string }> {
    const byId = new Map<string, { id: string; storagePath: string }>();
    for (const turn of history) {
      for (const call of turn.calls) {
        if (call.status === "succeeded" && call.image) {
          byId.set(call.image.id, call.image);
        }
      }
    }
    // User-attached references (S-12) are first-class sources.
    for (const attachment of attachments) {
      byId.set(attachment.id, attachment);
    }
    return sourceImageIds.map((id) => {
      const image = byId.get(id);
      if (!image) {
        throw new Error(`Source image ${id} not found in this project`);
      }
      return image;
    });
  }

  /**
   * Run one image call, report its outcome to the reservation (which
   * refunds and finalizes), then bump the project's timestamp.
   */
  private async settleSingleCallTurn(
    project: StudioProjectRecord,
    turn: StudioTurnRecord,
    reservation: StudioReservation,
    options: {
      producedBy: StudioImageRecord["model"];
      sourcePrompt: string;
      run: () => Promise<StudioImageCallResult>;
    },
  ): Promise<void> {
    let call: StudioCallRecord;
    try {
      const result = await options.run();
      const saved = await this.storage.saveFromUrl(
        turn.userId,
        result.imageUrl,
        "preview-image",
        {
          studioProjectId: project.id,
          studioTurnId: turn.id,
          model: options.producedBy,
        },
      );
      call = {
        index: 0,
        status: "succeeded",
        image: {
          id: this.idFactory(),
          storagePath: saved.storagePath,
          sourcePrompt: options.sourcePrompt,
          model: options.producedBy,
        },
      };
    } catch (error) {
      call = {
        index: 0,
        status: "failed",
        error: error instanceof Error ? error.message : "Image call failed",
      };
    }

    await reservation.settle([call]);
    await this.store.updateProject(project.id, {
      updatedAtMs: this.now().getTime(),
      ...(this.coverPatch([call]) ?? {}),
    });
  }

  /**
   * Persist a clarify/diagnose/negotiate turn as already terminal: zero
   * cost, no reservation (an over-cap user can still answer questions),
   * no background work.
   */
  private async saveConversationalTurn(
    project: StudioProjectRecord,
    message: string,
    decision: StudioDecision,
    attachmentIds: readonly string[],
  ): Promise<RunTurnResult> {
    const nowMs = this.now().getTime();
    const turn: StudioTurnRecord = {
      id: this.idFactory(),
      projectId: project.id,
      userId: project.userId,
      status: "complete",
      userMessage: message,
      decision,
      ...(attachmentIds.length > 0
        ? { attachmentIds: [...attachmentIds] }
        : {}),
      calls: [],
      reservedCents: 0,
      refundedCents: 0,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };
    await this.store.saveTurn(turn);
    await this.store.updateProject(project.id, { updatedAtMs: nowMs });
    return { turnId: turn.id, decision, completion: Promise.resolve() };
  }

  private async executeGenerateTurn(
    project: StudioProjectRecord,
    turn: StudioTurnRecord,
    reservation: StudioReservation,
  ): Promise<void> {
    if (turn.decision.action !== "generate" || !turn.resolvedModel) return;
    const decision = turn.decision;
    const model = this.registry.getModel(turn.resolvedModel);
    const timeoutMs = this.registry.timeoutMsFor(model.slug);

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

    await reservation.settle(calls);

    // First generation titles the project (behavior 8). The LLM's title is
    // preferred; a basePrompt-derived fallback guarantees the invariant
    // even when the optional field is omitted (regression, live 2026-07-24).
    const patch: Partial<StudioProjectRecord> = {
      updatedAtMs: this.now().getTime(),
      ...(this.coverPatch(calls) ?? {}),
    };
    if (project.title === "Untitled") {
      patch.title =
        decision.title?.trim() ||
        decision.basePrompt.slice(0, TITLE_MAX_CHARS).trim();
    }
    await this.store.updateProject(project.id, patch);
  }
}
