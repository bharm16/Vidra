import { DomainError } from "@server/errors/DomainError";

import type { ApiErrorCode } from "#shared/types/api";

type ShareErrorKind = Extract<
  ApiErrorCode,
  "SHARE_CLIP_NOT_FOUND" | "SHARE_NO_MEDIA"
>;

const STATUS_MAP: Record<ShareErrorKind, number> = {
  SHARE_CLIP_NOT_FOUND: 404,
  SHARE_NO_MEDIA: 400,
};

export class ShareError extends DomainError {
  readonly code: ShareErrorKind;

  constructor(
    kind: ShareErrorKind,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message, details);
    this.code = kind;
    this.name = "ShareError";
  }

  getHttpStatus(): number {
    return STATUS_MAP[this.code];
  }

  getUserMessage(): string {
    return this.message;
  }
}
