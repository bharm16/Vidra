/**
 * Re-exports of the neutral session record + DTO shapes.
 *
 * The canonical location is `server/src/domain/session/types.ts`. Keeping the
 * shapes there lets peer service domains (like `services/continuity/`)
 * reference `SessionRecord` without importing from `services/sessions/`.
 *
 * New code should import directly from `@server/domain/session/types`.
 */
export type {
  SessionRecord,
  SessionCreateRequest,
  SessionUpdateRequest,
  SessionListOptions,
  SessionPromptUpdate,
  SessionHighlightUpdate,
  SessionOutputUpdate,
  SessionVersionsUpdate,
} from "@server/domain/session/types";
