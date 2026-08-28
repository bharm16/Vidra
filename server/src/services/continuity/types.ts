/**
 * Re-exports of the neutral continuity domain types.
 *
 * The canonical location is `server/src/domain/continuity/types.ts` — that is
 * where the type shapes live so both `services/sessions/` and
 * `services/continuity/` can depend on the same graph without importing
 * from each other.
 *
 * This facade is deliberate and permanent: service-local code imports
 * `./types`, cross-domain code imports the domain path — both are fine.
 * (An earlier version of this comment announced a migration to the domain
 * path that was never executed and never needed.)
 */
export type {
  GenerationMode,
  ContinuityMode,
  ContinuityMechanismUsed,
  StyleReference,
  StyleAnalysisMetadata,
  ProviderContinuityCapabilities,
  SeedInfo,
  FrameBridge,
  SceneProxy,
  SceneProxyRender,
  ContinuityShot,
  ContinuitySessionSettings,
  ContinuitySession,
  StyleMatchOptions,
  CharacterKeyframeOptions,
  CreateShotRequest,
  CreateSessionRequest,
  ContinuityStrategy,
  QualityGateResult,
} from "@server/domain/continuity/types";
