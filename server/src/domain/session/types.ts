/**
 * Neutral session record + DTO shapes.
 *
 * Lives outside `services/sessions/` so peer service domains (for example
 * `services/continuity/`) can reference `SessionRecord` without importing
 * from the sessions service layer. The concrete `SessionService`,
 * `SessionStore`, etc. stay in `services/sessions/`.
 */
import type { SessionPrompt, SessionStatus } from "@shared/types/session";
import type { ContinuitySession } from "@server/domain/continuity/types";

export interface SessionRecord {
  id: string;
  userId: string;
  name?: string;
  description?: string;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
  prompt?: SessionPrompt;
  continuity?: ContinuitySession;
  promptUuid?: string | null;
  hasContinuity?: boolean;
}

export interface SessionCreateRequest {
  name?: string;
  prompt?: SessionPrompt;
}

export interface SessionUpdateRequest {
  name?: string;
  description?: string;
  status?: SessionStatus;
  prompt?: Partial<SessionPrompt>;
}

export interface SessionListOptions {
  limit?: number;
  includeContinuity?: boolean;
  includePrompt?: boolean;
}

export interface SessionPromptUpdate {
  title?: string | null;
  input?: string;
  output?: string;
  targetModel?: string | null;
  generationParams?: Record<string, unknown> | null;
  keyframes?: SessionPrompt["keyframes"];
  mode?: string;
}

export interface SessionHighlightUpdate {
  highlightCache?: Record<string, unknown> | null;
  versionEntry?: {
    timestamp?: string;
  };
}

export interface SessionOutputUpdate {
  output?: string;
}

export interface SessionVersionsUpdate {
  versions?: SessionPrompt["versions"];
}
