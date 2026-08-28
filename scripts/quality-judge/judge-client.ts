import OpenAI from "openai";

import { calculateLLMCost } from "../../server/src/config/llmCosts.js";
import {
  dimensionKeysFor,
  type AnyDimensions,
  type QualityScoredSurface,
} from "./judge-event-types.js";

export interface JudgeInput {
  rubric: string;
  surface: QualityScoredSurface;
  inputContent: Record<string, unknown>;
  outputContent: Record<string, unknown>;
}

export interface JudgeOutput {
  dimensions: AnyDimensions;
  reasoning: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

const JUDGE_MODEL = "gpt-4o-2024-08-06";

let cachedClient: OpenAI | null = null;
function client(): OpenAI {
  if (!cachedClient) cachedClient = new OpenAI();
  return cachedClient;
}

function buildUserMessage(args: JudgeInput): string {
  const payload = JSON.stringify(
    { inputContent: args.inputContent, outputContent: args.outputContent },
    null,
    2,
  );
  return `${args.rubric}\n\n\`\`\`json\n${payload}\n\`\`\`\n`;
}

function clampInt0to5(v: unknown): number {
  if (typeof v !== "number" || Number.isNaN(v)) {
    throw new Error(
      `Judge output: dimension value is not a number (got ${typeof v})`,
    );
  }
  const rounded = Math.round(v);
  if (rounded < 0) return 0;
  if (rounded > 5) return 5;
  return rounded;
}

function normalizeDimensions(
  raw: unknown,
  surface: QualityScoredSurface,
): AnyDimensions {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Judge output: dimensions is not an object");
  }
  const obj = raw as Record<string, unknown>;
  const keys = dimensionKeysFor(surface);
  const out: Record<string, number> = {};
  for (const k of keys) {
    if (!(k in obj)) {
      throw new Error(`Judge output: missing dimension '${k}'`);
    }
    out[k] = clampInt0to5(obj[k]);
  }
  return out as AnyDimensions;
}

export async function runJudge(args: JudgeInput): Promise<JudgeOutput> {
  const response = await client().chat.completions.create({
    model: JUDGE_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are evaluating the output of a video-prompt system. Return JSON only.",
      },
      { role: "user", content: buildUserMessage(args) },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "";
  let parsed: { dimensions?: unknown; reasoning?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Judge output: not valid JSON: ${raw.slice(0, 200)}`);
  }
  const dimensions = normalizeDimensions(parsed.dimensions, args.surface);
  const reasoning =
    typeof parsed.reasoning === "string" ? parsed.reasoning : "";
  const tokensIn = response.usage?.prompt_tokens ?? 0;
  const tokensOut = response.usage?.completion_tokens ?? 0;
  return {
    dimensions,
    reasoning,
    tokensIn,
    tokensOut,
    costUsd: calculateLLMCost(JUDGE_MODEL, tokensIn, tokensOut),
  };
}

export const JUDGE_MODEL_NAME = JUDGE_MODEL;
