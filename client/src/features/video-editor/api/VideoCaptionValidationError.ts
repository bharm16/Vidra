import type { VideoCaptionValidationDetails } from "@shared/schemas/workflow/video-edit.schemas";
import { OwnedRequestError as WorkflowApiError } from "@/services/http/OwnedRequest";

/** A definitive rejection of one captured edit revision, not a saved edit mutation. */
export class VideoCaptionValidationError extends WorkflowApiError {
  constructor(message: string, readonly details: VideoCaptionValidationDetails) {
    super(message, 422, "invalid_settings");
    this.name = "VideoCaptionValidationError";
  }
}
