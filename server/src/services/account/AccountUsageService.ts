import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import { AcceptedRequestSchema } from "@shared/schemas/workflow/request.schemas";
import { OwnerIdSchema } from "@shared/schemas/workflow/identity.schemas";
import { WorkflowError } from "@services/projects/WorkflowError";

const UsageRecordSchema = z.object({ userId: z.string(), day: z.string(), reservedCents: z.number().finite().nonnegative().optional(), reservedMillicents: z.number().finite().nonnegative().optional() });
export interface AccountUsage {
  resetAt: string;
  allowances: Array<{ kind: "studio" | "sketch"; state: "available" | "reached" }>;
  requests: Array<{ id: string; projectId: string; conversationId: string; label: string; acceptedAt: string; result: "ready" | "failed" | "running" | "needs-attention" | "cancelled" }>;
}
export interface AccountAllowanceConfig { studioCapCents: number; sketchCapCents: number; sketchFrameCostMillicents: number; }

/** Read-only projection of existing admission counters and immutable request history. */
export class AccountUsageService {
  constructor(private readonly database: Firestore, private readonly config: AccountAllowanceConfig, private readonly now: () => Date = () => new Date()) {}

  async get(owner: string): Promise<AccountUsage> {
    const ownerId = OwnerIdSchema.parse(owner);
    const at = this.now();
    const day = at.toISOString().slice(0, 10);
    const [studio, sketch, history] = await Promise.all([
      this.database.collection("studio_usage").doc(`${ownerId}_${day}`).get(),
      this.database.collection("sketch_usage").doc(`${ownerId}_${day}`).get(),
      this.database.collection("creation_requests").where("ownerId", "==", ownerId).orderBy("acceptedAt", "desc").limit(30).get(),
    ]);
    const reserved = (exists: boolean, data: unknown, key: "reservedCents" | "reservedMillicents"): number => {
      if (!exists) return 0;
      const usage = UsageRecordSchema.parse(data);
      if (usage.userId !== ownerId || usage.day !== day) throw new WorkflowError("access_denied", "This usage record is unavailable.");
      // A malformed existing counter is unavailable, never a fabricated zero.
      return z.number().finite().nonnegative().parse(usage[key]);
    };
    const studioUsed = reserved(studio.exists, studio.data(), "reservedCents");
    const sketchUsed = reserved(sketch.exists, sketch.data(), "reservedMillicents");
    const requests = history.docs.map(row => {
      const scope = z.object({ ownerId: OwnerIdSchema, id: z.string() }).parse(row.data());
      if (scope.ownerId !== ownerId || scope.id !== row.id) throw new WorkflowError("access_denied", "This usage history is unavailable.");
      const record = AcceptedRequestSchema.parse(row.data());
      const result: AccountUsage["requests"][number]["result"] = record.slots.every(slot => slot.delivery === "ready") ? "ready" : record.slots.some(slot => slot.outcome === "needs-attention" || slot.outcome === "unknown" || ["storage-failed", "attachment-failed", "lost"].includes(slot.delivery)) ? "needs-attention" : record.slots.some(slot => slot.outcome === "failed") ? "failed" : record.slots.every(slot => slot.outcome === "cancelled") ? "cancelled" : "running";
      const fallback = record.snapshot.action === "make-image" ? "Make picture" : record.snapshot.action === "make-video" ? "Make clip" : "Media request";
      return { id: record.id, projectId: record.projectId, conversationId: record.conversationId, label: record.snapshot.instructions.trim().slice(0, 120) || fallback, acceptedAt: record.acceptedAt, result };
    });
    return { resetAt: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1)).toISOString(), allowances: [{ kind: "studio", state: studioUsed >= this.config.studioCapCents ? "reached" : "available" }, { kind: "sketch", state: sketchUsed + this.config.sketchFrameCostMillicents > this.config.sketchCapCents * 1000 ? "reached" : "available" }], requests };
  }
}
