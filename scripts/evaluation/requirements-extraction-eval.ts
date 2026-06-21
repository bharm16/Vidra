/**
 * Live quality eval for the model-intelligence requirements classifier.
 *
 * The deterministic policy (observations -> requirement flags) is unit-tested in
 * requirementsMapper.test.ts. PERCEPTION quality — does the LLM correctly read
 * water/fire/animal/style/negation from a prompt — can only be measured against
 * a real provider, so this scores AIServiceRequirementsClassifier over the same
 * hand-labeled golden set the old regex eval used.
 *
 * Run: npm run eval:requirements   (requires OPENAI_API_KEY / GROQ_API_KEY)
 *
 * Gate: correctLeaves >= BASELINE_CORRECT_LEAVES (the regex baseline). The LLM
 * should match or beat it, closing the negation/synonym/inflection blind spots
 * the regex structurally missed.
 */
import { config as loadEnv } from "dotenv";
import { AIModelService } from "../../server/src/services/ai-model/AIModelService.js";
import type { ClientsMap } from "../../server/src/services/ai-model/types.js";
import { OpenAICompatibleAdapter } from "../../server/src/clients/adapters/OpenAICompatibleAdapter.js";
import { AIServiceRequirementsClassifier } from "../../server/src/services/model-intelligence/services/RequirementsClassifier.js";
import {
  REQUIREMENTS_EVAL_CASES,
  type RequirementsEvalCase,
} from "../../server/src/services/model-intelligence/__tests__/fixtures/requirementsEvalCases.js";

loadEnv();

/** Regex-era baseline this rewrite must not regress below. */
const BASELINE_CORRECT_LEAVES = 23;

interface LeafResult {
  path: string;
  expected: unknown;
  actual: unknown;
  ok: boolean;
}

function compareLeaves(
  expected: Record<string, unknown>,
  actual: Record<string, unknown> | undefined,
  prefix: string,
): LeafResult[] {
  const results: LeafResult[] = [];
  for (const [key, expectedValue] of Object.entries(expected)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const actualValue = actual?.[key];
    if (
      expectedValue !== null &&
      typeof expectedValue === "object" &&
      !Array.isArray(expectedValue)
    ) {
      results.push(
        ...compareLeaves(
          expectedValue as Record<string, unknown>,
          actualValue as Record<string, unknown> | undefined,
          path,
        ),
      );
    } else {
      results.push({
        path,
        expected: expectedValue,
        actual: actualValue,
        ok: actualValue === expectedValue,
      });
    }
  }
  return results;
}

function createAIService(): AIModelService {
  const clients: ClientsMap = { openai: null };
  const openaiTimeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 60000);
  const groqTimeoutMs = Number(process.env.GROQ_TIMEOUT_MS || 30000);
  const openaiBaseURL =
    process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const groqBaseURL =
    process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

  if (process.env.OPENAI_API_KEY) {
    clients.openai = new OpenAICompatibleAdapter({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: openaiBaseURL,
      defaultModel: process.env.OPENAI_MODEL || "gpt-4o-2024-08-06",
      defaultTimeout: openaiTimeoutMs,
      providerName: "openai",
    });
  }

  if (process.env.GROQ_API_KEY) {
    clients.groq = new OpenAICompatibleAdapter({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: groqBaseURL,
      defaultModel: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      defaultTimeout: groqTimeoutMs,
      providerName: "groq",
    });
  }

  if (!clients.openai && clients.groq) {
    clients.openai = clients.groq;
  }
  if (!clients.openai) {
    throw new Error("No AI API keys found. Set OPENAI_API_KEY or GROQ_API_KEY");
  }

  return new AIModelService({ clients });
}

async function main(): Promise<void> {
  const classifier = new AIServiceRequirementsClassifier(createAIService());

  const perCase = await Promise.all(
    REQUIREMENTS_EVAL_CASES.map(async (evalCase: RequirementsEvalCase) => {
      const actual = (await classifier.classify(
        evalCase.prompt,
        evalCase.spans,
      )) as unknown as Record<string, unknown>;
      return {
        case: evalCase,
        leaves: compareLeaves(
          evalCase.expected as Record<string, unknown>,
          actual,
          "",
        ),
      };
    }),
  );

  const allLeaves = perCase.flatMap((p) => p.leaves);
  const totalLeaves = allLeaves.length;
  const correctLeaves = allLeaves.filter((l) => l.ok).length;

  const mismatches = perCase.flatMap((p) =>
    p.leaves
      .filter((l) => !l.ok)
      .map(
        (l) =>
          `  ✗ ${p.case.id}${p.case.regexBlindSpot ? " [wasRegexBlindSpot]" : ""} ` +
          `${l.path}: expected ${JSON.stringify(l.expected)}, got ${JSON.stringify(l.actual)}`,
      ),
  );

  console.log(
    `[requirements-extraction-eval] ${correctLeaves}/${totalLeaves} flags correct ` +
      `(${((correctLeaves / totalLeaves) * 100).toFixed(1)}%); baseline ${BASELINE_CORRECT_LEAVES}.\n` +
      `${mismatches.length} mismatch(es):\n${mismatches.join("\n") || "  (none)"}`,
  );

  if (correctLeaves < BASELINE_CORRECT_LEAVES) {
    console.error(
      `FAIL: ${correctLeaves} < baseline ${BASELINE_CORRECT_LEAVES} — perception regressed.`,
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("requirements-extraction-eval failed:", error);
  process.exitCode = 1;
});
