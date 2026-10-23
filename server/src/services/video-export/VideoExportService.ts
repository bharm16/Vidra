import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import { rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { canonicalJson } from "@shared/workflow/canonicalJson";
import { compositionFrames, sourceElementIds } from "@shared/video-edit/composition";
import { CreateVideoExportSchema, ExportIdSchema, VideoCaptionValidationDetailsSchema, VideoExportSchema, type VideoExport, type StoredVideoExport } from "@shared/schemas/workflow/video-edit.schemas";
import { OwnerIdSchema, ProjectIdSchema, VersionIdSchema } from "@shared/schemas/workflow/identity.schemas";
import type { ProjectStore } from "@services/projects/ProjectStore";
import type { MediaVersionIndex, MediaVersionPublishCandidate } from "@services/media-history/MediaVersionIndex";
import type { VideoEditStore } from "@services/video-editing/VideoEditStore";
import { requireWritableProject } from "@services/projects/projectAccess";
import { WorkflowError } from "@services/projects/WorkflowError";
import { sha256Hex } from "@utils/hash";
import {
  commitVideoExportReceiptInTransaction,
  recoverVideoExportReceiptInTransaction,
  workflowExecutionDraftKey,
} from "@services/admission/idempotency/workflowReceipts";
import { logger } from "@infrastructure/Logger";
import type { ExportStorage } from "./ExportStorage";
import { hashLocalFile } from "./ExportStorage";
import type { VideoRenderer, RenderedVideo } from "./NativeVideoRenderer";
import { RenderCancelledError } from "./NativeProcess";
import { CaptionPolicyError } from "./CaptionPolicyError";
import { SourceUnavailableError } from "./SourceUnavailableError";

const EvidenceSchema = z.strictObject({ localPath: z.string(), directory: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive(), frames: z.number().int().positive(), width: z.number().int().positive(), height: z.number().int().positive() });
/** Native execution is single-attempt. Durable status recovery never reclaims a render. */
export class VideoExportService {
  private readonly running = new Map<string, { controller: AbortController; promise: Promise<void> }>();
  private readonly repairing = new Map<string, Promise<void>>();
  private readonly repairAfter = new Map<string, number>();
  private nativeQueue: Promise<void> = Promise.resolve();
  private stopping = false;
  private draining: Promise<boolean> | undefined;
  constructor(private readonly database: Firestore, private readonly projects: ProjectStore, private readonly edits: VideoEditStore, private readonly media: MediaVersionIndex, private readonly storage: ExportStorage, private readonly renderer: VideoRenderer, private readonly now: () => string = () => new Date().toISOString()) {}

  async create(ownerId: string, projectId: string, editId: string, input: unknown): Promise<VideoExport> {
    const command = CreateVideoExportSchema.parse(input);
    const { submissionId: _submissionId, ...settings } = command;
    const payloadHash = sha256Hex(canonicalJson({ projectId, editId, ...settings }));
    const executionKey = workflowExecutionDraftKey(ownerId, command.executionDraftId, command.executionDraftRevision);
    const receiptScope = {
      ownerId,
      projectId,
      editId,
      submissionId: command.submissionId,
      executionDraftId: command.executionDraftId,
      executionDraftRevision: command.executionDraftRevision,
      payloadHash,
    };
    // An accepted receipt remains recoverable when a source, project or renderer changes.
    const recovered = await this.database.runTransaction(async transaction => {
      await this.projects.readOwned(transaction, ownerId, projectId);
      return recoverVideoExportReceiptInTransaction(this.database, transaction, receiptScope, (tx, exportId) =>
        this.readOwned(tx, ownerId, projectId, exportId),
      );
    });
    if (recovered) { this.schedule(recovered); return recovered; }
    if (this.stopping) throw new WorkflowError("capability_unavailable", "The renderer is stopping. This export was not accepted. Retry after reconnecting.");
    // No process/filesystem calls occur in the retryable acceptance transaction.
    const revision = await this.edits.revision(ownerId, projectId, editId, command.revision);
    if (command.preset !== revision.composition.preset) throw new WorkflowError("invalid_settings", "Save the output shape and each visual item's fit/fill/crop choice before exporting.");
    let renderer: string;
    try { renderer = await this.renderer.fingerprint(); await this.renderer.validateText(revision.composition); }
    catch (error) {
      if (error instanceof CaptionPolicyError) {
        const details = VideoCaptionValidationDetailsSchema.safeParse({ kind: "video-caption-validation", ownerId, projectId, editId, revision: revision.revision, issues: error.issues });
        if (details.success) throw new WorkflowError("invalid_settings", "One or more captions cannot be exported. Edit the identified captions before exporting.", details.data);
      }
      logger.warn("Native renderer check failed", { editId, error: error instanceof Error ? error.message : String(error) });
      throw new WorkflowError("capability_unavailable", this.safeFailure(error));
    }
    const id = ExportIdSchema.parse(`export_${executionKey}`); const timestamp = this.now();
    const record = await this.database.runTransaction(async transaction => {
      const project = await this.projects.readOwned(transaction, ownerId, projectId);
      const existing = await recoverVideoExportReceiptInTransaction(this.database, transaction, receiptScope, (tx, exportId) =>
        this.readOwned(tx, ownerId, projectId, exportId),
      );
      if (existing) return existing;
      requireWritableProject(project);
      if (this.stopping) throw new WorkflowError("capability_unavailable", "The renderer is stopping. This export was not accepted. Retry after reconnecting.");
      const saved = await this.edits.revision(ownerId, projectId, editId, command.revision, transaction);
      const sources = await this.edits.sources(ownerId, projectId, saved.composition, transaction);
      const issues = await this.edits.issues(projectId, saved.composition, sources, transaction);
      if (issues.length) throw new WorkflowError("invalid_settings", issues.map(issue => `${issue.elementId}: ${issue.message}`).join(" "));
      if (command.retryOf) { const previous = await this.readOwned(transaction, ownerId, projectId, command.retryOf); if (previous.state !== "failed" || previous.editId !== editId || previous.revision !== command.revision || canonicalJson(previous.composition) !== canonicalJson(saved.composition) || canonicalJson(previous.sources.map(source => ({ id: source.id, object: source.object }))) !== canonicalJson(sources.map(source => ({ id: source.id, object: source.object })))) throw new WorkflowError("invalid_settings", "Retry export requires a definitively failed export and its exact saved revision."); }
      const accepted = VideoExportSchema.parse({ schemaVersion: "vidra-workflow/v2", id, ownerId, projectId, editId, revision: command.revision, submissionId: command.submissionId, executionDraftId: command.executionDraftId, executionDraftRevision: command.executionDraftRevision, ...(command.retryOf ? { retryOf: command.retryOf } : {}), composition: saved.composition, compositionHash: sha256Hex(canonicalJson(saved.composition)), sources, renderer, attemptId: `attempt_${executionKey}`, state: "queued", progress: 0, createdAt: timestamp, updatedAt: timestamp });
      transaction.create(this.ref(projectId, id), accepted);
      commitVideoExportReceiptInTransaction(this.database, transaction, { ...receiptScope, exportId: id });
      transaction.create(this.attemptRef(projectId, id), { state: "queued", attemptId: accepted.attemptId, renderer, createdAt: timestamp });
      return accepted;
    });
    this.schedule(record); return record;
  }
  async list(ownerId: string, projectId: string): Promise<VideoExport[]> {
    await this.projects.get(ownerId, projectId); const rows = await this.database.collection("creation_projects").doc(ProjectIdSchema.parse(projectId)).collection("video_exports").orderBy("createdAt", "desc").limit(200).get();
    const records = rows.docs.map(row => this.owned(ownerId, projectId, row.id, row.data())).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); for (const record of records) if (record.state === "queued") this.schedule(record); return records;
  }
  async get(ownerId: string, projectId: string, id: string): Promise<VideoExport> {
    const record = await this.database.runTransaction(transaction => this.readOwned(transaction, ownerId, projectId, id));
    if (record.state === "queued") this.schedule(record);
    if ((record.state === "linking" || (record.state === "storing" && (record.message?.includes("Retry saving") || Date.parse(this.now()) - Date.parse(record.updatedAt) > 90_000))) && !this.stopping && !this.repairing.has(id) && Date.now() >= (this.repairAfter.get(id) ?? 0)) void this.repair(record).catch(error => { logger.warn("Export saving recovery could not be recorded", { exportId: id, error: error instanceof Error ? error.message : String(error) }); });
    if ((record.state === "rendering" || record.state === "cancel_requested") && !this.running.has(id) && Date.parse(this.now()) - Date.parse(record.updatedAt) > 90_000) return this.change(ownerId, projectId, id, [record.state], { state: "attention", message: "The renderer connection was lost. This attempt's outcome is unknown; it will not render again automatically." });
    return record;
  }
  async resume(ownerId: string, projectId: string, id: string): Promise<VideoExport> {
    const record = await this.get(ownerId, projectId, id);
    if (!this.stopping && (record.state === "storing" || record.state === "linking")) await this.repair(record);
    return this.get(ownerId, projectId, id);
  }
  async cancel(ownerId: string, projectId: string, id: string): Promise<VideoExport> {
    const record = await this.database.runTransaction(async transaction => {
      const current = await this.readOwned(transaction, ownerId, projectId, id);
      if (current.state === "queued") { const next = VideoExportSchema.parse({ ...current, state: "cancelled", message: "Export cancelled before rendering.", updatedAt: this.now() }); transaction.set(this.ref(projectId, id), next); transaction.set(this.attemptRef(projectId, id), { state: "cancelled", attemptId: next.attemptId, updatedAt: next.updatedAt }, { merge: true }); return next; }
      if (current.state === "storing" || current.state === "linking" || current.state === "ready") { const next = VideoExportSchema.parse({ ...current, message: current.state === "ready" ? "The export finished before cancellation. Its file is available." : "The export finished rendering before cancellation. Its file is being saved and will be kept.", updatedAt: this.now() }); transaction.set(this.ref(projectId, id), next); return next; }
      if (current.state !== "rendering" && current.state !== "cancel_requested") return current;
      const next = VideoExportSchema.parse({ ...current, state: "cancel_requested", message: "Stopping the renderer. Cancellation will be confirmed when it closes.", updatedAt: this.now() }); transaction.set(this.ref(projectId, id), next); return next;
    });
    const task = this.running.get(id);
    if (record.state === "cancel_requested" && task) { task.controller.abort(); await task.promise; }
    return this.get(ownerId, projectId, id);
  }
  async access(ownerId: string, projectId: string, id: string): Promise<{ url: string; expiresAt: string }> {
    const record = await this.get(ownerId, projectId, id);
    if (record.state !== "ready" || !record.stored) throw new WorkflowError("input_unavailable", "This export is not ready to download. Saving recovery keeps the same rendered file.");
    const object = await this.storage.inspect(record.stored.storagePath);
    if (!object || object.generation !== record.stored.generation || object.sha256 !== record.stored.sha256 || object.bytes !== record.stored.bytes) throw new WorkflowError("input_unavailable", "The exact stored export is unavailable. It will not render again during download recovery.");
    return this.storage.access(ownerId, record.stored.storagePath, record.stored.generation);
  }
  /** Stop new execution, finish active work, then abort native work and await closure. */
  drain(timeoutMs = 10_000): Promise<boolean> {
    if (this.draining) return this.draining;
    this.stopping = true;
    this.draining = this.drainPending(Math.max(0, Math.min(60_000, timeoutMs)));
    return this.draining;
  }
  private async drainPending(timeoutMs: number): Promise<boolean> {
    const pending = [...this.running.values()].map(task => task.promise).concat([...this.repairing.values()]);
    if (await this.settleWithin(pending, timeoutMs)) return true;
    for (const task of this.running.values()) task.controller.abort();
    // NativeProcess escalates after2s and rejects only after close. A stalled
    // storage/database boundary stays durable and cannot be called cancelled.
    return this.settleWithin(pending, 5000);
  }
  private settleWithin(pending: Promise<void>[], timeoutMs: number): Promise<boolean> {
    if (!pending.length) return Promise.resolve(true);
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      void Promise.allSettled(pending).then(() => { clearTimeout(timer); resolve(true); });
    });
  }
  private schedule(record: VideoExport): void {
    if (this.stopping || record.state !== "queued" || this.running.has(record.id)) return;
    const controller = new AbortController();
    // At most one native export executes in this API process; queue entries are durable.
    const promise = this.nativeQueue.then(() => this.execute(record, controller)).catch(error => { logger.error("Native export status could not be persisted", error instanceof Error ? error : new Error(String(error)), { exportId: record.id }); }).finally(() => { this.running.delete(record.id); });
    this.running.set(record.id, { controller, promise }); this.nativeQueue = promise;
  }
  private async execute(record: VideoExport, controller: AbortController): Promise<void> {
    if (this.stopping) return;
    const claimed = await this.database.runTransaction(async transaction => {
      const current = await this.readOwned(transaction, record.ownerId, record.projectId, record.id);
      if (current.state !== "queued" || this.stopping) return undefined;
      const project = await this.projects.readOwned(transaction, record.ownerId, record.projectId);
      if (this.stopping) return undefined;
      try { requireWritableProject(project); }
      catch (error) {
        if (!(error instanceof WorkflowError) || error.code !== "read_only") throw error;
        const cancelled = VideoExportSchema.parse({ ...current, state: "cancelled", progress: 0, message: "Export cancelled before rendering because this project is read-only.", updatedAt: this.now() });
        transaction.set(this.ref(record.projectId, record.id), cancelled);
        transaction.set(this.attemptRef(record.projectId, record.id), { state: "cancelled", attemptId: current.attemptId, message: cancelled.message, finishedAt: cancelled.updatedAt }, { merge: true });
        return undefined;
      }
      const next = VideoExportSchema.parse({ ...current, state: "rendering", message: "Rendering this saved revision.", updatedAt: this.now() });
      transaction.set(this.ref(record.projectId, record.id), next); transaction.set(this.attemptRef(record.projectId, record.id), { state: "rendering", attemptId: current.attemptId, startedAt: next.updatedAt }, { merge: true }); return next;
    });
    if (!claimed) return;
    let rendered: RenderedVideo;
    const heartbeat = setInterval(() => { void this.change(claimed.ownerId, claimed.projectId, claimed.id, ["rendering", "cancel_requested"], {}).catch(error => { logger.warn("Export heartbeat checkpoint failed", { exportId: claimed.id, error: error instanceof Error ? error.message : String(error) }); }); }, 15_000);
    heartbeat.unref();
    try {
      for (const source of claimed.sources) { const current = await this.media.get(claimed.ownerId, claimed.projectId, source.id); if (!current || current.ownerId !== claimed.ownerId || canonicalJson(current.object) !== canonicalJson(source.object)) throw new SourceUnavailableError(source.id, `Source ${source.id} is missing or no longer authorized. The edit is retained.`); }
      if (this.stopping) { await this.releaseUnstarted(claimed); return; }
      let lastProgress = 0;
      rendered = await this.renderer.render(claimed, controller.signal, value => { if (value - lastProgress < 0.05) return; lastProgress = value; void this.change(claimed.ownerId, claimed.projectId, claimed.id, ["rendering"], { progress: value }).catch(error => { logger.warn("Export progress checkpoint failed", { exportId: claimed.id, error: error instanceof Error ? error.message : String(error) }); }); });
    } catch (error) {
      const cancelled = controller.signal.aborted || error instanceof RenderCancelledError;
      await this.database.runTransaction(async transaction => {
        const current = await this.readOwned(transaction, claimed.ownerId, claimed.projectId, claimed.id);
        if (current.state !== "rendering" && current.state !== "cancel_requested") return;
        const state = cancelled ? "cancelled" : "failed";
        const message = cancelled ? "Export cancelled after the renderer stopped." : this.safeFailure(error);
        const failedVersionId = !cancelled && error instanceof SourceUnavailableError ? error.versionId : undefined;
        const failedItemId = failedVersionId === undefined ? undefined : sourceElementIds(current.composition, failedVersionId)[0];
        transaction.set(this.ref(claimed.projectId, claimed.id), VideoExportSchema.parse({ ...current, state, message, progress: 0, ...(failedVersionId === undefined ? {} : { failedVersionId }), ...(failedItemId === undefined ? {} : { failedItemId }), updatedAt: this.now() }));
        transaction.set(this.attemptRef(claimed.projectId, claimed.id), { state, message, finishedAt: this.now() }, { merge: true });
      }); return;
    } finally { clearInterval(heartbeat); }
    // Verified process completion wins a concurrent late cancellation; bytes are retained.
    await this.database.runTransaction(async transaction => {
      const current = await this.readOwned(transaction, claimed.ownerId, claimed.projectId, claimed.id);
      if (current.state !== "rendering" && current.state !== "cancel_requested") throw new WorkflowError("submission_conflict", "This attempt lost publication authority after rendering.");
      transaction.set(this.attemptRef(claimed.projectId, claimed.id), { state: "rendered", evidence: EvidenceSchema.parse(rendered), attemptId: claimed.attemptId, completedAt: this.now() }, { merge: true });
      transaction.set(this.ref(claimed.projectId, claimed.id), VideoExportSchema.parse({ ...current, state: "storing", progress: 1, message: "The video is rendered. Saving its file.", updatedAt: this.now() }));
    });
    await this.repair(await this.get(claimed.ownerId, claimed.projectId, claimed.id));
  }
  private async releaseUnstarted(record: VideoExport): Promise<void> {
    await this.database.runTransaction(async transaction => {
      const current = await this.readOwned(transaction, record.ownerId, record.projectId, record.id);
      if (current.state !== "rendering" && current.state !== "cancel_requested") return;
      const cancelled = current.state === "cancel_requested";
      const state = cancelled ? "cancelled" : "queued";
      const message = cancelled ? "Export cancelled before rendering." : "Export accepted. Rendering will resume after reconnecting.";
      transaction.set(this.ref(record.projectId, record.id), VideoExportSchema.parse({ ...current, state, progress: 0, message, updatedAt: this.now() }));
      transaction.set(this.attemptRef(record.projectId, record.id), { state, message }, { merge: true });
    });
  }
  private async repair(record: VideoExport): Promise<void> {
    const existing = this.repairing.get(record.id); if (existing) return existing;
    const promise = this.repairOutput(record).catch(async error => { this.repairAfter.set(record.id, Date.now() + 5000); await this.change(record.ownerId, record.projectId, record.id, ["storing", "linking"], { message: `${this.safeFailure(error)} Retry saving; this will not render again.` }); }).finally(() => { this.repairing.delete(record.id); }); this.repairing.set(record.id, promise); return promise;
  }
  private async repairOutput(original: VideoExport): Promise<void> {
    let record = await this.get(original.ownerId, original.projectId, original.id);
    if (record.state !== "storing" && record.state !== "linking") return;
    let stored = record.stored;
    const row = await this.attemptRef(record.projectId, record.id).get(); const attempt = z.object({ evidence: EvidenceSchema }).parse(row.data()); const evidence = attempt.evidence;
    const safeDirectory = resolve(tmpdir()) === dirname(evidence.directory) && resolve(evidence.directory) === evidence.directory && /^vidra-export-[A-Za-z0-9]{6}$/.test(basename(evidence.directory)) && evidence.localPath === join(evidence.directory, "output.mp4");
    if (!safeDirectory) { await this.change(record.ownerId, record.projectId, record.id, ["storing", "linking"], { state: "attention", message: "The rendered file checkpoint is invalid. No files will be read or removed." }); return; }
    const storagePath = `users/${record.ownerId}/exports/${record.id}/${record.attemptId}.mp4`;
    if (!stored) {
      let object = await this.storage.inspect(storagePath);
      if (!object) {
        let local;
        try { local = await hashLocalFile(evidence.localPath); } catch { if (Date.parse(this.now()) - Date.parse(record.updatedAt) <= 90_000) { this.repairAfter.set(record.id, Date.now() + 5000); return; } await this.change(record.ownerId, record.projectId, record.id, ["storing"], { state: "attention", message: "The verified rendered bytes were lost before durable storage. This attempt will not render again automatically." }); return; }
        if (local.sha256 !== evidence.sha256 || local.bytes !== evidence.bytes) throw new Error("The local rendered file no longer matches its verified output.");
        object = await this.storage.store(storagePath, evidence.localPath, { sha256: evidence.sha256, bytes: evidence.bytes });
      }
      if (object.storagePath !== storagePath || object.sha256 !== evidence.sha256 || object.bytes !== evidence.bytes) throw new Error("The durable object does not match the verified export bytes.");
      stored = { ...object, versionId: VersionIdSchema.parse(`version_${record.id}`) };
      record = await this.change(record.ownerId, record.projectId, record.id, ["storing"], { state: "linking", stored, message: "The file is stored. Adding it to the project." });
    }
    const immutableStored = stored;
    await this.database.runTransaction(async transaction => {
      const latest = await this.readOwned(transaction, record.ownerId, record.projectId, record.id); if (latest.state === "ready") return;
      if (latest.state !== "linking" || !latest.stored || canonicalJson(latest.stored) !== canonicalJson(immutableStored)) throw new WorkflowError("submission_conflict", "This export lost its exact stored-output link.");
      const project = await this.projects.readOwned(transaction, record.ownerId, record.projectId);
      await this.media.publishInTransaction(
        transaction,
        project,
        this.exportVersion(latest, immutableStored, evidence),
        {
          conflictMessage: "The media identity is bound to different bytes.",
          verifyExisting: (existing, candidate) => {
            if (canonicalJson(existing) !== canonicalJson(candidate)) throw new WorkflowError("submission_conflict", "The media identity is bound to different bytes.");
          },
        },
      );
      transaction.set(this.ref(record.projectId, record.id), VideoExportSchema.parse({ ...latest, state: "ready", message: "Export ready.", updatedAt: this.now() })); transaction.set(this.attemptRef(record.projectId, record.id), { state: "ready", updatedAt: this.now() }, { merge: true });
    });
    this.repairAfter.delete(record.id);
    await rm(evidence.directory, { recursive: true, force: true });
  }
  private exportVersion(record: VideoExport, stored: StoredVideoExport, evidence: z.infer<typeof EvidenceSchema>): MediaVersionPublishCandidate {
    return { id: stored.versionId, ownerId: record.ownerId, projectId: record.projectId, kind: "export", label: `Video · edit ${record.revision}`, origin: { kind: "export", exportId: record.id, editId: record.editId, revision: record.revision }, sourceInputs: [], object: { identity: "verified", assetId: stored.versionId, storagePath: stored.storagePath, generation: stored.generation, sha256: stored.sha256, bytes: stored.bytes }, metadata: { state: "verified", width: evidence.width, height: evidence.height, durationSeconds: compositionFrames(record.composition) / 30, audio: "present", framesPerSecond: 30, probeVersion: record.renderer }, createdAt: record.createdAt };
  }
  private async change(ownerId: string, projectId: string, id: string, allowed: VideoExport["state"][], update: Partial<Pick<VideoExport, "state" | "progress" | "message" | "stored">>): Promise<VideoExport> {
    return this.database.runTransaction(async transaction => { const current = await this.readOwned(transaction, ownerId, projectId, id); if (!allowed.includes(current.state)) return current; const next = VideoExportSchema.parse({ ...current, ...update, updatedAt: this.now() }); transaction.set(this.ref(projectId, id), next); return next; });
  }
  private async readOwned(transaction: Transaction, ownerId: string, projectId: string, id: string): Promise<VideoExport> { await this.projects.readOwned(transaction, ownerId, projectId); const row = await transaction.get(this.ref(projectId, id)); if (!row.exists) throw new WorkflowError("not_found", "This export is unavailable."); return this.owned(ownerId, projectId, id, row.data()); }
  private owned(ownerId: string, projectId: string, id: string, value: unknown): VideoExport { const scope = z.object({ ownerId: OwnerIdSchema, projectId: ProjectIdSchema, id: ExportIdSchema }).parse(value); if (scope.ownerId !== ownerId || scope.projectId !== projectId || scope.id !== id) throw new WorkflowError("access_denied", "This export is unavailable."); const record = VideoExportSchema.parse(value); if (sha256Hex(canonicalJson(record.composition)) !== record.compositionHash) throw new WorkflowError("input_unavailable", "This accepted export snapshot needs recovery. It cannot authorize another render."); return record; }
  private ref(projectId: string, id: string): DocumentReference { return this.database.collection("creation_projects").doc(ProjectIdSchema.parse(projectId)).collection("video_exports").doc(ExportIdSchema.parse(id)); }
  private attemptRef(projectId: string, id: string): DocumentReference { return this.ref(projectId, id).collection("execution").doc("attempt"); }
  private safeFailure(error: unknown): string { if (error instanceof WorkflowError) return error.message; if (error instanceof Error && /^(?:Text [A-Za-z0-9_-]+:|Source version_[A-Za-z0-9_-]+ |Audio [A-Za-z0-9_-]+ |The (?:sources|selected|exact renderer|rendered file|finalized export|export|preview|normalized preview))/.test(error.message)) return error.message.slice(0, 1500); return "The export could not complete this step."; }
}
