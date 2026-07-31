// Shared contract for the /api/enhancement/prompt-coherence endpoint.
//
// These are not hand-written any more: every type here is inferred from the
// Zod schemas in shared/schemas/coherence.schemas.ts, which are the single
// declaration of the contract. The schema and the type cannot drift because
// there is only one of them.
export type {
  CoherenceEdit,
  CoherenceRecommendation,
  CoherenceFinding,
  CoherenceSpan,
  AppliedChange,
  CoherenceCheckRequest,
  CoherenceCheckResult,
} from "../schemas/coherence.schemas.js";
