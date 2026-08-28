/**
 * Re-exports of the neutral session record + DTO shapes.
 *
 * The canonical location is `server/src/domain/session/types.ts`. Keeping the
 * shapes there lets peer service domains (like `services/continuity/`)
 * reference `SessionRecord` without importing from `services/sessions/`.
 *
 * This facade is deliberate and permanent: service-local code imports
 * `./types`, cross-domain code imports the domain path — both are fine.
 * (An earlier version of this comment announced a migration to the domain
 * path that was never executed and never needed.)
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
