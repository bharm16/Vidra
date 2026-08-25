import type { StudioProjectRecord, StudioTurnRecord } from "../types";

/**
 * The persistence surface StudioService and StudioSpendLedger consume.
 *
 * Extracted as a port so those consumers depend on the capability rather than
 * the concrete FirestoreStudioProjectStore, whose `getFirestore()` field
 * initialiser makes it unconstructable in a unit test. Firestore is the
 * production adapter; the tests' in-memory stand-ins are the test adapter.
 */
export interface StudioProjectStore {
  createProject(record: StudioProjectRecord): Promise<void>;
  getProject(projectId: string): Promise<StudioProjectRecord | null>;
  listProjects(
    userId: string,
    limitCount?: number,
  ): Promise<StudioProjectRecord[]>;
  updateProject(
    projectId: string,
    patch: Partial<StudioProjectRecord>,
  ): Promise<void>;
  listTurns(
    projectId: string,
    limitCount?: number,
  ): Promise<StudioTurnRecord[]>;
  getTurn(projectId: string, turnId: string): Promise<StudioTurnRecord | null>;
  reserveTurn(params: {
    turn: StudioTurnRecord;
    day: string;
    capCents: number;
  }): Promise<void>;
  saveTurn(turn: StudioTurnRecord): Promise<void>;
  refundCents(userId: string, day: string, cents: number): Promise<void>;
  finalizeTurn(
    projectId: string,
    turnId: string,
    patch: Pick<
      StudioTurnRecord,
      "status" | "calls" | "refundedCents" | "updatedAtMs"
    >,
  ): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
}
