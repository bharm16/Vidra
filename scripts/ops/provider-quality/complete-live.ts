#!/usr/bin/env tsx
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { COMPLETION_PLANS, COMPLETION_RESERVED_CENTS } from "./completionPlan";
import { CompletionLedger } from "./completionLedger";
import {
  completeProviderOnce,
  loadCompletionCredentials,
  type LiveCompletionResult,
} from "./liveCompletion";

const args = process.argv.slice(2);
if (
  args.length !== 5 ||
  args[1] !== "--ledger" ||
  args[3] !== "--allocation-cents" ||
  !["--plan", "--run"].includes(args[0] ?? "") ||
  !args[2]
) {
  console.error(
    "Usage: npx tsx scripts/ops/provider-quality/complete-live.ts <--plan|--run> --ledger <directory> --allocation-cents <187..400> (run spends real money)",
  );
  process.exitCode = 2;
} else {
  const directory = resolve(args[2]);
  const maxCents = Number(args[4]);
  const ledger = new CompletionLedger(directory, maxCents);
  const credentials = loadCompletionCredentials();
  const credentialPresence = Object.fromEntries(
    Object.entries(credentials).map(([provider, value]) => [
      provider,
      Boolean(value?.trim()),
    ]),
  );
  if (args[0] === "--plan") {
    console.log(
      JSON.stringify(
        {
          mode: "plan-no-dispatch",
          ledger: directory,
          allocationCents: maxCents,
          reserveCents: COMPLETION_RESERVED_CENTS,
          credentialPresence,
          plans: COMPLETION_PLANS,
          quality: "not-evaluated",
        },
        null,
        2,
      ),
    );
  } else {
    // Executable preflight before any reservation or paid request.
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    const revision = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const results: LiveCompletionResult[] = [];
    const correctionAllocationPath = join(
      directory,
      "fal-existing-key-correction",
      "allocation.json",
    );
    const correctionCents = existsSync(correctionAllocationPath)
      ? Number(
          (
            JSON.parse(readFileSync(correctionAllocationPath, "utf8")) as {
              reservedCents: number;
            }
          ).reservedCents,
        )
      : 0;
    for (const plan of COMPLETION_PLANS) {
      const result = await completeProviderOnce(plan, ledger, credentials);
      results.push(result);
      console.log(
        JSON.stringify({
          provider: result.provider,
          model: result.model,
          status: result.status,
          elapsedMs: result.elapsedMs,
          reserveCents: result.reserveCents,
          reusedEvidence: result.reusedEvidence ?? false,
          reason: result.reason,
        }),
      );
      await writeFile(
        join(directory, "report.json"),
        `${JSON.stringify({ schema: "vidra-live-provider-completion/v1", revision, quality: "not-evaluated", allocationCents: maxCents, reserveCents: COMPLETION_RESERVED_CENTS + correctionCents, priorCorrectionEvidence: correctionCents ? "Original401 and canonical-credential correction are preserved in separate receipts" : null, actualBilledCost: "not-reconciled", results, pendingProviders: COMPLETION_PLANS.filter((remaining) => !results.some((seen) => seen.provider === remaining.provider)).map((remaining) => remaining.provider), exclusions: ["Kling: owner excluded", "Luma: unqualified legacy API", "Sora Videos API: shut down2026-09-24; OpenAI row proves text only"], boundary: "Wan: real free HTTP intake/worker/attachment/reopen/download over controlled persistence. Google: production adapter. OpenAI: aiService text. fal: real HTTP image. Browser/depth/deployed persistence remain separate." }, null, 2)}\n`,
      );
    }
    process.exitCode = results.every((result) => result.status === "completed")
      ? 0
      : 1;
    // The isolated real-app harness owns readiness timers. Every provider
    // result and the final report are durable before ending this CLI process.
    process.exit(process.exitCode);
  }
}
