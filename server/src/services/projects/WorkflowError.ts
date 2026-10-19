export type WorkflowErrorCode = "not_found" | "access_denied" | "read_only" | "revision_conflict" | "invalid_context" | "input_unavailable" | "capability_unavailable" | "invalid_settings" | "submission_conflict";

/** Domain failures never contain another owner's private record. */
export class WorkflowError extends DomainError {
  constructor(readonly code: WorkflowErrorCode, message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.name = "WorkflowError";
  }

  getHttpStatus(): number {
    switch (this.code) {
      case "not_found": return 404;
      case "access_denied": return 403;
      case "read_only":
      case "revision_conflict":
      case "submission_conflict": return 409;
      case "capability_unavailable": return 503;
      default: return 422;
    }
  }

  getUserMessage(): string { return this.message; }
}
import { DomainError } from "@server/errors/DomainError";
