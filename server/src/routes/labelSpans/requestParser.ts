import { z } from "zod";
import type {
  LabelSpansParams,
  ValidationPolicy,
} from "@llm/span-labeling/types";

export interface ParsedLabelSpansRequest {
  payload: LabelSpansParams;
  text: string;
  maxSpans?: number;
  minConfidence?: number;
  policy?: ValidationPolicy;
  templateVersion?: string;
  isI2VMode?: boolean;
  streamVersion?: 2;
}

export type LabelSpansRequestParseResult =
  | { ok: true; data: ParsedLabelSpansRequest }
  | { ok: false; status: number; error: string };

const sanitizeNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
};

const LabelSpansRequestSchema = z
  .object({
    streamVersion: z.literal(2).optional(),
    text: z.string().min(1, "text is required"),
    maxSpans: z
      .preprocess(sanitizeNumber, z.number().int().min(1).max(80))
      .optional(),
    minConfidence: z
      .preprocess(sanitizeNumber, z.number().min(0).max(1))
      .optional(),
    policy: z.record(z.string(), z.unknown()).optional(),
    templateVersion: z.string().optional(),
    isI2VMode: z
      .preprocess(
        (value: unknown) =>
          typeof value === "boolean"
            ? value
            : typeof value === "string"
              ? value.toLowerCase() === "true"
              : undefined,
        z.boolean(),
      )
      .optional(),
  })
  .strip();

export function parseLabelSpansRequest(
  body: unknown,
): LabelSpansRequestParseResult {
  const parsed = LabelSpansRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      status: 400,
      error: issue?.message || "Invalid request",
    };
  }

  const { text, maxSpans, minConfidence, policy, templateVersion, isI2VMode } =
    parsed.data;

  const normalizedIsI2VMode = Boolean(isI2VMode);

  const resolvedTemplateVersion =
    templateVersion || (normalizedIsI2VMode ? "i2v-v1" : undefined);

  const payload: LabelSpansParams = {
    text,
    ...(maxSpans !== undefined ? { maxSpans } : {}),
    ...(minConfidence !== undefined ? { minConfidence } : {}),
    ...(policy ? { policy: policy as ValidationPolicy } : {}),
    ...(resolvedTemplateVersion
      ? { templateVersion: resolvedTemplateVersion }
      : {}),
  };

  return {
    ok: true,
    data: {
      payload,
      ...(parsed.data.streamVersion ? { streamVersion: parsed.data.streamVersion } : {}),
      text,
      ...(maxSpans !== undefined ? { maxSpans } : {}),
      ...(minConfidence !== undefined ? { minConfidence } : {}),
      ...(policy ? { policy: policy as ValidationPolicy } : {}),
      ...(resolvedTemplateVersion
        ? { templateVersion: resolvedTemplateVersion }
        : {}),
      ...(normalizedIsI2VMode ? { isI2VMode: true } : {}),
    },
  };
}
