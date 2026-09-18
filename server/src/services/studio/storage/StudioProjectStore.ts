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
  /**
   * Atomically claim a NEW project document. Returns `true` when this call
   * created it, `false` when a document with that id already existed and
   * nothing was written — the create-if-absent contract two concurrent "Refine
   * in the studio" presses race on (#127). The two presses derive the same
   * project id (`studioProjectIdForSessionPicture`), so an unconditional
   * overwrite here would let the later press replace the winner's project —
   * and any edits or selection it had made since; the atomic claim is what
   * serialises them, and the loser reads the winner back rather than writing.
   */
  createProject(record: StudioProjectRecord): Promise<boolean>;
  getProject(projectId: string): Promise<StudioProjectRecord | null>;
  /**
   * A user's projects, most-recently-updated first, capped at `limitCount`.
   * Ordering is the STORE's job, applied server-side, so the newest project
   * is never dropped when the count exceeds a fetch window (#121). Callers
   * pass the page size explicitly rather than leaning on a silent default.
   */
  listProjects(
    userId: string,
    limitCount?: number,
  ): Promise<StudioProjectRecord[]>;
  updateProject(
    projectId: string,
    patch: Partial<StudioProjectRecord>,
  ): Promise<void>;
  /**
   * A project's turns oldest-first, capped at `limitCount`. Callers that need
   * the whole thread pass an explicit limit at or above the turn cap the
   * service enforces at creation (#121), so the window is complete rather
   * than silently truncated.
   */
  listTurns(
    projectId: string,
    limitCount?: number,
  ): Promise<StudioTurnRecord[]>;
  getTurn(projectId: string, turnId: string): Promise<StudioTurnRecord | null>;
  /**
   * The turn whose succeeded calls produced `imageId`, looked up BY IDENTITY —
   * never by scanning a history page (#121, ADR-0022 decision 4). A known
   * produced image is retrievable no matter how many turns precede it, which
   * is what keeps "Use this in the session" working past any list window.
   * Returns null when no succeeded call in the project produced that image
   * (an attachment id, an unknown id, or a failed call all answer null).
   *
   * #132 reuses this contract; it is the studio's only produced-image-by-id
   * retrieval seam.
   */
  findTurnByProducedImageId(
    projectId: string,
    imageId: string,
  ): Promise<StudioTurnRecord | null>;
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
