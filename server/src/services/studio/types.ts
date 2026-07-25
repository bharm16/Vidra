/**
 * Studio-local types (Milestone 1).
 *
 * Server-local on purpose: the client needs none of these until the picker
 * ships (M2), at which point the slug/capability unions move to shared/.
 * Plan: docs/superpowers/plans/2026-07-24-the-studio-conversational-image-workspace.md
 */

export const STUDIO_MODEL_SLUGS = [
  "recraft-v4.1",
  "recraft-v4.1-svg",
  "recraft-v4.1-pro",
  "recraft-v4.1-pro-svg",
  "nano-banana-2",
  "nano-banana-2-lite",
  "nano-banana-pro",
  "gpt-image-2",
] as const;

export type StudioModelSlug = (typeof STUDIO_MODEL_SLUGS)[number];

/**
 * What an operation needs from a model. "design"/"svg"/"general" are
 * generate-capabilities (the LLM's routing hint); "edit" requires image input.
 */
export const STUDIO_CAPABILITIES = [
  "design",
  "svg",
  "general",
  "edit",
] as const;

export type StudioCapability = (typeof STUDIO_CAPABILITIES)[number];

export const STUDIO_UTILITY_OPERATIONS = [
  "remove_background",
  "vectorize",
] as const;

export type StudioUtilityOperation = (typeof STUDIO_UTILITY_OPERATIONS)[number];

export interface StudioModelEntry {
  slug: StudioModelSlug;
  displayName: string;
  replicateId: string;
  capabilities: readonly StudioCapability[];
  /**
   * Estimated cost per call in cents, used for the atomic daily spend
   * reservation. Overestimates are safe (they reserve more); entries marked
   * costVerified: false MUST be confirmed against Replicate before launch
   * (M1 exit gate).
   */
  costCentsPerCall: number;
  costVerified: boolean;
  /** From the reference picker; drives the UI hint and the timeout budget. */
  latencyHintSeconds: number;
  /**
   * Aspect ratios we allow through to this model. Requests outside the list
   * fall back to defaultAspectRatio (validate-and-fallback, never an
   * upstream 400).
   */
  aspectRatios: readonly string[];
  defaultAspectRatio: string;
}

export interface StudioUtilityEntry {
  operation: StudioUtilityOperation;
  replicateId: string;
  costCentsPerCall: number;
  costVerified: boolean;
  latencyHintSeconds: number;
}

/** One image produced by a turn, persisted under the turn record. */
export interface StudioImageRecord {
  id: string;
  storagePath: string;
  /** The exact prompt (generate) or instruction (edit) that produced it. */
  sourcePrompt: string;
  /** Producing model, or the utility operation for transform results. */
  model: StudioModelSlug | StudioUtilityOperation;
}

export type StudioTurnStatus = "running" | "complete" | "partial" | "failed";

/** Per-call slot in a turn: index-stable so the UI can render failures in place. */
export interface StudioCallRecord {
  index: number;
  status: "running" | "succeeded" | "failed";
  image?: StudioImageRecord;
  error?: string;
}

export interface StudioTurnRecord {
  id: string;
  projectId: string;
  userId: string;
  status: StudioTurnStatus;
  userMessage: string;
  /** The validated decision that ran. */
  decision: StudioDecision;
  /**
   * Model the operation resolved to (pin or cheapest-capable). Absent on
   * conversational turns (clarify/diagnose/negotiate) — no image model runs.
   */
  resolvedModel?: StudioModelSlug | undefined;
  calls: StudioCallRecord[];
  reservedCents: number;
  refundedCents: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface StudioProjectRecord {
  id: string;
  userId: string;
  title: string;
  // `| undefined` (exactOptionalPropertyTypes): explicit undefined is
  // stripped before Firestore sees it. `null` is the persisted "cleared"
  // state (Firestore merge writes cannot delete a field via omission).
  selectedImageId?: string | null | undefined;
  /** Absent or null = Auto mode. */
  pinnedModel?: StudioModelSlug | null | undefined;
  createdAtMs: number;
  updatedAtMs: number;
}

/**
 * The LLM's per-turn decision (plan: "LLM output schema"). M1 implements the
 * generate path with a hardcoded policy; the union is complete so the store
 * and service don't churn at M3/M4.
 */
export type StudioDecision =
  | {
      action: "clarify";
      questions: Array<{ text: string; quickPicks: string[] }>;
    }
  | {
      action: "generate";
      basePrompt: string;
      variants: [string, string, string, string];
      capability: Extract<StudioCapability, "design" | "svg" | "general">;
      // `| undefined` (exactOptionalPropertyTypes): lets Zod-parsed decisions
      // (whose optionals infer `string | undefined`) assign cleanly.
      aspectRatio?: string | undefined;
      suggestions: [string, string, string];
      title?: string | undefined;
    }
  | {
      action: "edit";
      instruction: string;
      sourceImageIds: string[];
      suggestions: [string, string, string];
    }
  | {
      action: "transform";
      operation: StudioUtilityOperation;
      sourceImageId: string;
      suggestions: [string, string, string];
    }
  | { action: "diagnose"; question: string; quickPicks: string[] }
  | {
      action: "negotiate";
      reason: string;
      options: Array<{ label: string; message: string }>;
    };
