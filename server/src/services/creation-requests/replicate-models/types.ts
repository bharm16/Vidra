import type { z } from "zod";
import type {
  CapabilityProfile,
  ParameterPolicy,
  ParameterValue,
} from "@shared/schemas/workflow/capability.schemas";
import type { InputRoleSchema } from "@shared/schemas/workflow/draft.schemas";
import type { MediaVersion } from "@shared/schemas/workflow/media.schemas";

export type InputRole = z.infer<typeof InputRoleSchema>;

/** One captured input: the signed URL the provider reads, and the exact version behind it. */
export interface ModelInput {
  url: string;
  version?: MediaVersion;
}

/** Everything a definition may read when shaping one provider call. */
export interface ModelCall {
  /** Exactly what the creator wrote; scripts and reframe guidance use this alone. */
  instructions: string;
  /** The creator's words with their captured context, as other generation profiles send. */
  sentInstructions: string;
  parameters: Record<string, ParameterValue>;
  inputs: Partial<Record<InputRole, ModelInput[]>>;
  seed?: number;
}

/** IO a definition may need while shaping input; injected so definitions stay testable. */
export interface ModelInputTools {
  /** Converts a Vidra area mask (painted = opaque) to a black-edits/white-keeps PNG data URI. */
  blackEditMask(url: string): Promise<string>;
}

export type ModelOutputKind = "image" | "video" | "audio" | "text";

/** The profile fields a definition owns; the catalog adds availability. */
export type ModelProfile = Omit<
  CapabilityProfile,
  "availability" | "unavailableReason"
>;

/**
 * One exact Replicate model operation: what it offers creators (its profile),
 * how a captured request becomes the model's input, and what it returns.
 */
export interface ReplicateModelDefinition {
  profile: ModelProfile;
  /** Hard budget for create + poll. Kept below the profile's recovery deadline. */
  timeoutMs: number;
  pollIntervalMs: number;
  /** A refusal proven before any provider call, so nothing is reserved or spent. */
  preflight?(call: ModelCall): string | undefined;
  input(
    call: ModelCall,
    tools: ModelInputTools,
  ): Promise<Record<string, unknown>> | Record<string, unknown>;
  /** Text outputs only: turns the provider's result into the words the creator receives. */
  text?(output: unknown, call: ModelCall): string;
}

export type { ParameterPolicy, ParameterValue };
