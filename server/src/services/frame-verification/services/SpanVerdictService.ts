/**
 * SpanVerdictService
 *
 * Runs the vision judge: (spans, frame image) → per-span verdicts.
 * All LLM access goes through the injected AIExecutionPort.
 */

import { promises as fs } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { logger } from "@infrastructure/Logger";
import { assertUrlSafe } from "@server/shared/urlValidation";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import {
  SPAN_VERDICT_VALUES,
  type FrameVerificationSpan,
  type SpanVerdict,
  type SpanVerdictValue,
} from "../types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATE_PATH = join(
  __dirname,
  "..",
  "templates",
  "frame-verification-prompt.md",
);

const VerdictResponseSchema = z.object({
  verdicts: z.array(
    z.object({
      index: z.number().int().min(0),
      verdict: z.enum(SPAN_VERDICT_VALUES),
      confidence: z.number().min(0).max(1),
      evidence: z.string().optional(),
    }),
  ),
});

export class FrameVerificationParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrameVerificationParseError";
  }
}

/** Strip a leading/trailing markdown code fence without regex. */
export function stripCodeFence(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    cleaned = firstNewline === -1 ? "" : cleaned.slice(firstNewline + 1);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

export class SpanVerdictService {
  private static cachedPrompt: string | null = null;
  private readonly ai: AIExecutionPort;
  private readonly log = logger.child({ service: "SpanVerdictService" });

  constructor(aiService: AIExecutionPort) {
    this.ai = aiService;
  }

  async judge(
    image: string,
    spans: FrameVerificationSpan[],
  ): Promise<{ verdicts: SpanVerdict[]; model: string }> {
    const systemPrompt = await this.loadSystemPrompt();
    const imageDataUri = await this.toDataUri(image);

    const spanList = spans.map((span, index) => ({
      index,
      text: span.text,
      category: span.category,
    }));

    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Spans to verify against the image:",
              JSON.stringify({ spans: spanList }),
              "Return the verdicts JSON.",
            ].join("\n"),
          },
          {
            type: "image_url",
            // detail: 'high' — fine-grained spans (skin details, small props)
            // are unresolvable at the default downscaled resolution.
            image_url: { url: imageDataUri, detail: "high" as const },
          },
        ],
      },
    ];

    const response = await this.ai.execute("frame_verification", {
      systemPrompt,
      messages,
      maxTokens: 2048,
      temperature: 0,
      jsonMode: true,
      enableBookending: false,
    });

    const verdicts = this.parseVerdicts(response.text, spans);
    return { verdicts, model: response.metadata.model ?? "unknown" };
  }

  private parseVerdicts(
    text: string,
    spans: FrameVerificationSpan[],
  ): SpanVerdict[] {
    const cleaned = stripCodeFence(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new FrameVerificationParseError(
        "Frame verification response was not valid JSON",
      );
    }

    const validated = VerdictResponseSchema.safeParse(parsed);
    if (!validated.success) {
      throw new FrameVerificationParseError(
        `Frame verification response failed validation: ${validated.error.message}`,
      );
    }

    const byIndex = new Map<
      number,
      { verdict: SpanVerdictValue; confidence: number; evidence?: string }
    >();
    for (const entry of validated.data.verdicts) {
      byIndex.set(entry.index, {
        verdict: entry.verdict,
        confidence: entry.confidence,
        ...(entry.evidence !== undefined ? { evidence: entry.evidence } : {}),
      });
    }

    return spans.map((span, index) => {
      const entry = byIndex.get(index);
      if (!entry) {
        this.log.warn("Judge omitted a span; defaulting to uncertain", {
          index,
          spanText: span.text,
        });
        return { span, verdict: "uncertain" as const, confidence: 0 };
      }
      return {
        span,
        verdict: entry.verdict,
        confidence: entry.confidence,
        ...(entry.evidence !== undefined ? { evidence: entry.evidence } : {}),
      };
    });
  }

  /**
   * Accept base64 data URIs as-is; fetch http(s) URLs and convert so
   * signed URLs can't expire mid-flight (same approach as image observation).
   */
  private async toDataUri(image: string): Promise<string> {
    if (image.startsWith("data:")) {
      return image;
    }
    assertUrlSafe(image, "frameVerificationImageUrl");
    const response = await fetch(image);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch frame image: ${response.status} ${response.statusText}`,
      );
    }
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  }

  private async loadSystemPrompt(): Promise<string> {
    if (SpanVerdictService.cachedPrompt) {
      return SpanVerdictService.cachedPrompt;
    }
    const content = await fs.readFile(TEMPLATE_PATH, "utf-8");
    SpanVerdictService.cachedPrompt = content.trim();
    return SpanVerdictService.cachedPrompt;
  }
}
