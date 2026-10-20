import type { AcceptedRequest } from "@shared/schemas/workflow/request.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { logger } from "@infrastructure/Logger";
import { WorkflowExecutionStore } from "./WorkflowExecutionStore";
import { WorkflowPreflightError, type ExecutionAttempt, type WorkflowNativeExecutor, type WorkflowOutputStorage } from "./types";

/** Bounded dispatch consumes durable authority; status polling never creates a second attempt. */
export class WorkflowExecutionService {
  private readonly pending = new Map<string, Promise<void>>();
  private readonly queue: Array<() => void> = [];
  private active = 0;
  private readonly log = logger.child({ service: "WorkflowExecutionService" });

  constructor(private readonly store: WorkflowExecutionStore, private readonly executor: WorkflowNativeExecutor, private readonly storage: WorkflowOutputStorage, private readonly concurrency = 2, private readonly now: () => number = Date.now) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error("Workflow execution concurrency must be between one and four");
  }

  async start(ownerId: string, requestId: string): Promise<AcceptedRequest> {
    const request = await this.store.get(ownerId, requestId);
    if (!this.pending.has(requestId)) {
      const completion = this.runBounded(() => this.execute(ownerId, requestId)).catch(error => {
        this.log.error("Accepted workflow execution needs recovery", error instanceof Error ? error : new Error(String(error)), { requestId });
      }).finally(() => { this.pending.delete(requestId); });
      this.pending.set(requestId, completion);
    }
    return request;
  }

  /** Startup recovery is restricted to already accepted work, never unsubmitted drafts. */
  async initialize(): Promise<void> {
    let after: string | undefined;
    for (;;) {
      const batch = await this.store.queued(20, after);
      for (const item of batch) await this.start(item.ownerId, item.requestId);
      if (batch.length < 20) return;
      after = batch.at(-1)?.requestId;
    }
  }

  async get(ownerId: string, requestId: string): Promise<AcceptedRequest> {
    await this.observeDeadline(ownerId, requestId);
    await this.start(ownerId, requestId);
    return this.store.get(ownerId, requestId);
  }

  async reconcile(ownerId: string, requestId: string): Promise<AcceptedRequest> {
    // Repairs checkpointed bytes and queued authority only. Unknown native invocations are never retried.
    await this.observeDeadline(ownerId, requestId);
    return this.start(ownerId, requestId);
  }

  async cancel(ownerId: string, requestId: string): Promise<AcceptedRequest> { return this.store.cancel(ownerId, requestId); }
  async recovery(ownerId: string): Promise<MediaVersion[]> { return this.store.recoveries(ownerId); }

  /** Exposed for orderly shutdown and deterministic tests; does not initiate work. */
  async drain(): Promise<void> { await Promise.all([...this.pending.values()]); }

  private async observeDeadline(ownerId: string, requestId: string): Promise<void> {
    for (const attempt of await this.store.attempts(ownerId, requestId)) if (attempt.state === "running" && Date.parse(attempt.deadlineAt) <= this.now()) await this.store.fail(attempt, "unknown");
  }

  private async runBounded(work: () => Promise<void>): Promise<void> {
    if (this.active >= this.concurrency) await new Promise<void>(resolve => this.queue.push(resolve));
    else this.active += 1;
    try { await work(); }
    finally { const next = this.queue.shift(); if (next) next(); else this.active -= 1; }
  }

  private async execute(ownerId: string, requestId: string): Promise<void> {
    const request = await this.store.get(ownerId, requestId);
    for (const slot of request.slots) {
      const claimed = await this.store.claim(ownerId, requestId, slot.id);
      const attempt = claimed.attempt;
      if (!attempt) continue;
      try {
        if (!this.executor.available(attempt.profile)) throw new WorkflowPreflightError("The captured adapter is unavailable");
        const output = await this.executor.execute(claimed.request, slot, attempt.profile, attempt.sentInstructions);
        await this.store.produced(attempt, output);
        await this.deliver({ ...attempt, state: "produced", output });
      } catch (error) {
        await this.store.fail(attempt, error instanceof WorkflowPreflightError ? "preflight" : "unknown", error instanceof WorkflowPreflightError ? error.message : undefined);
      }
    }
    for (const attempt of await this.store.attempts(ownerId, requestId)) {
      if (attempt.output && attempt.state !== "published") await this.deliver(attempt);
      else if (attempt.state === "running" && Date.parse(attempt.deadlineAt) <= this.now()) await this.store.fail(attempt, "unknown");
    }
    await this.store.finishOutbox(ownerId, requestId);
  }

  private async deliver(attempt: ExecutionAttempt): Promise<void> {
    if (!attempt.output) return;
    try {
      const verified = attempt.output.kind === "text" ? undefined : await this.storage.materialize(attempt, attempt.output);
      if (verified) await this.executor.checkOutput?.(attempt, verified);
      await this.store.publish(attempt, verified);
    } catch {
      await this.store.fail(attempt, "delivery");
    }
  }
}
