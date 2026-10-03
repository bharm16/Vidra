import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  COMPLETION_PLANS,
  COMPLETION_PROVIDERS,
  type CompletionPlan,
  type CompletionProvider,
} from "./completionPlan";

const allocationSchema = z.object({
  schema: z.literal("vidra-completion-allocation/v1"),
  maxCents: z.number().int().positive(),
  reservedCents: z.number().int().positive(),
  plans: z.array(z.unknown()),
});

/** Exclusive durable claim before network dispatch. Claims are never removed by this runner. */
export function writeExclusiveEvidence(
  path: string,
  evidence: unknown,
): boolean {
  let descriptor: number;
  try {
    descriptor = openSync(path, "wx", 0o600);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST")
      return false;
    throw error;
  }
  try {
    writeFileSync(descriptor, `${JSON.stringify(evidence, null, 2)}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  return true;
}

export class CompletionLedger {
  constructor(
    readonly directory: string,
    maxCents: number,
    private readonly plans: readonly CompletionPlan[] = COMPLETION_PLANS,
  ) {
    const reservedCents = plans.reduce(
      (sum, plan) => sum + plan.reserveCents,
      0,
    );
    if (
      !Number.isInteger(maxCents) ||
      maxCents < reservedCents ||
      maxCents > 400
    )
      throw new Error(
        `Completion allocation must cover${reservedCents} cents and cannot exceed root's400-cent allocation`,
      );
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, "allocation.json");
    const expected = {
      schema: "vidra-completion-allocation/v1",
      maxCents,
      reservedCents,
      plans,
    };
    if (!writeExclusiveEvidence(path, expected)) {
      const existing = allocationSchema.parse(
        JSON.parse(readFileSync(path, "utf8")),
      );
      if (JSON.stringify(existing) !== JSON.stringify(expected))
        throw new Error(
          "Existing completion allocation differs; refusing a new paid run",
        );
    }
  }

  claim(plan: CompletionPlan): boolean {
    if (
      !COMPLETION_PROVIDERS.includes(plan.provider) ||
      !this.plans.some(
        (allowed) => JSON.stringify(allowed) === JSON.stringify(plan),
      )
    )
      throw new Error("Undeclared provider plan");
    return writeExclusiveEvidence(
      join(this.directory, `${plan.provider}.claim.json`),
      {
        ...plan,
        claimedAt: new Date().toISOString(),
        state: "reserved-before-dispatch",
      },
    );
  }

  claimDispatch(
    provider: CompletionProvider,
    request: Record<string, unknown>,
  ): void {
    if (!existsSync(join(this.directory, `${provider}.claim.json`)))
      throw new Error("Paid dispatch has no prior reservation");
    if (
      !writeExclusiveEvidence(
        join(this.directory, `${provider}.dispatch.json`),
        { provider, request, dispatchedAt: new Date().toISOString() },
      )
    )
      throw new Error(`Second paid POST refused for ${provider}`);
  }
}
