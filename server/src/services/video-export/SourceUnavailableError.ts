import { WorkflowError } from "@services/projects/WorkflowError";

/** A pinned source that cannot be read again; retrying the same export cannot succeed. */
export class SourceUnavailableError extends WorkflowError {
  constructor(readonly versionId: string, message: string) {
    super("input_unavailable", message, { versionId });
    this.name = "SourceUnavailableError";
  }
}
