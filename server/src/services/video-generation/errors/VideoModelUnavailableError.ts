import { DomainError } from "@server/errors/DomainError";

/**
 * The requested video model cannot serve this generation — missing provider
 * key, unknown model id, or provider outage. Status defaults to 424 (failed
 * dependency) but availability checks may supply a more specific one.
 */
export class VideoModelUnavailableError extends DomainError {
  readonly code = "VIDEO_MODEL_UNAVAILABLE";

  constructor(
    message: string,
    private readonly statusCode: number = 424,
    details?: Record<string, unknown>,
  ) {
    super(message, details);
    this.name = "VideoModelUnavailableError";
  }

  getHttpStatus(): number {
    return this.statusCode;
  }

  getUserMessage(): string {
    return this.message;
  }
}
