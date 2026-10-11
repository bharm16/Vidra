import { z } from "zod";
import { CreationActionSchema, InputRoleSchema } from "./draft.schemas";
import { WorkflowSchemaVersion } from "./identity.schemas";

export const ParameterValueSchema = z.union([z.string(), z.number().finite(), z.boolean()]);
export type ParameterValue = z.infer<typeof ParameterValueSchema>;
export const ParameterDomainSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("enum"), values: z.array(ParameterValueSchema).min(1).max(100) }),
  z.strictObject({ kind: z.literal("range"), min: z.number().finite(), max: z.number().finite(), step: z.number().positive() }).refine(value => value.min <= value.max, "Parameter range is inverted"),
]);
export const ParameterPolicySchema = z.discriminatedUnion("policy", [
  z.strictObject({ policy: z.literal("editable"), domain: ParameterDomainSchema, defaultValue: ParameterValueSchema }),
  z.strictObject({ policy: z.literal("fixed"), value: ParameterValueSchema }),
  z.strictObject({ policy: z.literal("derived"), from: z.enum(["input-aspect", "input-duration", "frame-duration"]), role: InputRoleSchema.optional() }),
  z.strictObject({ policy: z.literal("unsupported"), reason: z.string().min(1) }),
  z.strictObject({ policy: z.literal("unknown"), reason: z.string().min(1) }),
]);
export type ParameterPolicy = z.infer<typeof ParameterPolicySchema>;

export const CapabilityProfileSchema = z.strictObject({
  schemaVersion: WorkflowSchemaVersion,
  id: z.string().min(1).max(160),
  revision: z.string().min(1).max(160),
  label: z.string().min(1).max(160),
  action: CreationActionSchema,
  provider: z.string().min(1).max(160),
  endpoint: z.string().min(1).max(300),
  mode: z.string().min(1).max(160),
  availability: z.enum(["qualified", "unqualified", "unavailable"]),
  unavailableReason: z.string().min(1).max(2000).optional(),
  inputs: z.array(z.strictObject({
    role: InputRoleSchema,
    kinds: z.array(z.enum(["image", "video", "audio"])).min(1),
    minCount: z.number().int().min(0).max(16),
    maxCount: z.number().int().min(1).max(16),
    maxBytes: z.number().int().positive().optional(),
    minDurationSeconds: z.number().positive().optional(),
    maxDurationSeconds: z.number().positive().optional(),
  }).refine(value => value.minCount <= value.maxCount, "Input limits are inverted")).max(7),
  output: z.strictObject({ kind: z.enum(["image", "video", "text", "file"]), maxCount: z.number().int().min(1).max(8) }),
  maxContextCharacters: z.number().int().positive().max(1000000),
  parameters: z.record(z.string().min(1).max(80), ParameterPolicySchema),
  constraints: z.array(z.strictObject({
    parameter: z.string().min(1),
    equals: ParameterValueSchema,
    requires: z.record(z.string().min(1), z.array(ParameterValueSchema).min(1)),
    reason: z.string().min(1),
  })).max(100).default([]),
  recovery: z.strictObject({
    start: z.enum(["supported", "unsupported", "unknown"]),
    status: z.enum(["supported", "unsupported", "unknown"]),
    cancel: z.enum(["supported", "unsupported", "unknown"]),
    result: z.enum(["supported", "unsupported", "unknown"]),
    deadlineSeconds: z.number().int().positive().max(86400),
  }),
  generatedAudio: z.enum(["unsupported", "always", "optional", "unknown"]),
  pricing: z.strictObject({ mode: z.literal("free"), maximumCreditsPerSlot: z.literal(0) }),
}).superRefine((profile, ctx) => {
  for (const [name, parameter] of Object.entries(profile.parameters)) {
    if (parameter.policy !== "editable") continue;
    const domain = parameter.domain;
    const value = parameter.defaultValue;
    const valid = domain.kind === "enum"
      ? domain.values.includes(value)
      : typeof value === "number" && value >= domain.min && value <= domain.max && Math.abs((value - domain.min) / domain.step - Math.round((value - domain.min) / domain.step)) < 1e-8;
    if (!valid) ctx.addIssue({ code: "custom", path: ["parameters", name, "defaultValue"], message: "Explicit default must belong to the parameter domain" });
  }
});
export type CapabilityProfile = z.infer<typeof CapabilityProfileSchema>;
