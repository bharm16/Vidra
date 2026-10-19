import type { VideoCaptionValidationDetails } from "@shared/schemas/workflow/video-edit.schemas";

/** A definitive caption-content rejection, never a native backend failure. */
export class CaptionPolicyError extends Error {
  constructor(readonly issues: VideoCaptionValidationDetails["issues"]) {
    super(issues.map(issue => issue.message).join(" "));
    this.name = "CaptionPolicyError";
  }
}
