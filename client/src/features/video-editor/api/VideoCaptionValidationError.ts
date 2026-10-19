import type { VideoCaptionValidationDetails } from "@shared/schemas/workflow/video-edit.schemas";
import { WorkflowApiError } from "@/features/project-workspace/api/workflowApi";

/** A definitive rejection of one captured edit revision, not a saved edit mutation. */
export class VideoCaptionValidationError extends WorkflowApiError {
  constructor(message: string, readonly details: VideoCaptionValidationDetails) {
    super(message, 422, "invalid_settings");
    this.name = "VideoCaptionValidationError";
  }
}
