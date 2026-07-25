/**
 * Studio conversation policy engine (Milestone 3).
 *
 * Owns the Layer-1 LLM call (plan: "Architecture: two independent layers"):
 * builds the studio_turn prompt from the static template + dynamic context
 * (roster capabilities, pin state, conversation transcript), enforces JSON
 * via StructuredOutputEnforcer, deep-validates the decision union with Zod,
 * and runs referential validation — Zod/referential violations take the
 * same schema-retry path back to the LLM with error feedback.
 *
 * It never calls Replicate and never picks literal models; the server
 * executes whatever decision survives validation.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@infrastructure/Logger";
import type { AIResponse } from "@interfaces/IAIClient";
import { StructuredOutputEnforcer } from "@utils/StructuredOutputEnforcer";
import { StudioDecisionSchema, asStudioDecision } from "./decisionSchema";
import { validateDecisionReferences } from "./validateDecision";
import type {
  StudioDecision,
  StudioModelEntry,
  StudioTurnRecord,
} from "./types";

/** Minimal structural aiService port (matches StructuredOutputEnforcer's). */
export interface StudioAIService {
  execute(
    operation: string,
    options: Record<string, unknown>,
  ): Promise<AIResponse>;
}

export interface StudioTurnContext {
  userMessage: string;
  /** Resolved pin, or null = Auto mode. */
  pinnedModel: StudioModelEntry | null;
  roster: readonly StudioModelEntry[];
  /** Prior persisted turns, chronological. */
  history: readonly StudioTurnRecord[];
  selectedImageId: string | null;
  /** Every image id that exists in this project (server truth). */
  projectImageIds: ReadonlySet<string>;
  /**
   * Actions the caller can execute this milestone. A decision outside the
   * list is rejected exactly like a schema violation (feedback retry).
   */
  allowedActions: readonly StudioDecision["action"][];
}

/**
 * What StudioService depends on — an interface, not the class, so tests
 * and future policies can substitute structurally.
 */
export interface StudioTurnPolicy {
  decideTurn(context: StudioTurnContext): Promise<StudioDecision>;
}

export class StudioPolicyError extends Error {
  public readonly statusCode = 502;

  constructor(message: string) {
    super(message);
    this.name = "StudioPolicyError";
  }
}

const TEMPLATE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "templates",
  "studio-turn-system.md",
);

/** Total LLM asks per turn: first attempt + one corrective re-ask. */
const MAX_ATTEMPTS = 2;

/** Prompt-size bounds for long threads (M3 heuristics, refined at M4). */
const MAX_INVENTORY_IMAGES = 12;
const SOURCE_PROMPT_EXCERPT_CHARS = 140;

export class StudioPolicyEngine implements StudioTurnPolicy {
  private readonly ai: StudioAIService;
  private readonly log = logger.child({ service: "StudioPolicyEngine" });
  private templateCache: string | null = null;

  constructor(deps: { ai: StudioAIService }) {
    this.ai = deps.ai;
  }

  async decideTurn(context: StudioTurnContext): Promise<StudioDecision> {
    const baseSystemPrompt = this.buildSystemPrompt(context);
    const userMessage = this.buildUserMessage(context);

    let feedback: string | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const systemPrompt = feedback
        ? `${baseSystemPrompt}\n\n## PREVIOUS ATTEMPT REJECTED\n\n${feedback}\nRespond again with one JSON decision object following every rule above.`
        : baseSystemPrompt;

      const raw = await StructuredOutputEnforcer.enforceJSON<unknown>(
        this.ai,
        systemPrompt,
        {
          operation: "studio_turn",
          schema: null,
          maxRetries: 1,
          userMessage,
        },
      );

      const parsed = StudioDecisionSchema.safeParse(raw);
      if (!parsed.success) {
        feedback = `Your JSON did not match the decision schema: ${summarizeZodError(parsed.error)}.`;
        this.log.warn("Studio decision failed schema validation", {
          attempt,
          reason: feedback,
        });
        continue;
      }

      const decision = asStudioDecision(parsed.data);

      if (!context.allowedActions.includes(decision.action)) {
        feedback = `Action "${decision.action}" is not available this turn. Choose one of: ${context.allowedActions.join(", ")}.`;
        this.log.warn("Studio decision used a disallowed action", {
          attempt,
          action: decision.action,
        });
        continue;
      }

      const referential = validateDecisionReferences(
        decision,
        context.projectImageIds,
      );
      if (!referential.ok) {
        feedback = `Your decision was rejected: ${referential.reason}.`;
        this.log.warn("Studio decision failed referential validation", {
          attempt,
          reason: referential.reason,
        });
        continue;
      }

      return decision;
    }

    throw new StudioPolicyError(
      `Studio policy produced no valid decision after ${MAX_ATTEMPTS} attempts (last: ${feedback ?? "unknown"})`,
    );
  }

  /** Static template + the dynamic sections the template's rules reference. */
  private buildSystemPrompt(context: StudioTurnContext): string {
    const sections: string[] = [this.loadTemplate()];

    sections.push(
      "## MODEL ROSTER\n\n" +
        "| slug | capabilities | aspect ratios |\n|---|---|---|\n" +
        context.roster
          .map(
            (entry) =>
              `| ${entry.slug} | ${entry.capabilities.join(", ")} | ${entry.aspectRatios.join(", ")} |`,
          )
          .join("\n"),
    );

    sections.push(
      context.pinnedModel
        ? `## ACTIVE MODEL\n\nThe user pinned **${context.pinnedModel.slug}** (capabilities: ${context.pinnedModel.capabilities.join(", ")}). Every generate/edit runs on this model. If it cannot do what the user asks, follow behavior rule 7 (negotiate) — never silently reroute.`
        : "## ACTIVE MODEL\n\nAuto mode — the server routes each operation to a capable model using your `capability` hint.",
    );

    sections.push(
      `## ALLOWED ACTIONS THIS TURN\n\nYou must respond with one of: ${context.allowedActions.join(", ")}.`,
    );

    return sections.join("\n\n");
  }

  /**
   * Conversation transcript + project state, delivered with user-role trust:
   * everything here quotes or derives from user-authored content, so none of
   * it can escalate to system-instruction authority (prompt-injection
   * hygiene, same pattern as ShotInterpreterService).
   */
  private buildUserMessage(context: StudioTurnContext): string {
    const sections: string[] = [];

    if (context.history.length > 0) {
      sections.push(
        "## CONVERSATION SO FAR\n\n" +
          context.history.map((turn) => this.describeTurn(turn)).join("\n"),
      );
    }

    sections.push(this.describeProjectState(context));
    sections.push(`## NEW USER MESSAGE\n\n${context.userMessage}`);
    return sections.join("\n\n");
  }

  private describeTurn(turn: StudioTurnRecord): string {
    const lines = [`User: ${turn.userMessage}`];
    const decision = turn.decision;
    switch (decision.action) {
      case "clarify":
        lines.push(
          `Assistant: asked ${decision.questions.map((q) => `"${q.text}"`).join(" and ")}`,
        );
        break;
      case "generate": {
        const produced = turn.calls
          .filter((call) => call.status === "succeeded" && call.image)
          .map((call) => call.image?.id)
          .filter(Boolean);
        lines.push(
          `Assistant: generated ${produced.length} image(s) [ids: ${produced.join(", ") || "none"}] from basePrompt "${decision.basePrompt}"` +
            (turn.status === "failed" ? " (all calls failed)" : ""),
        );
        break;
      }
      case "edit": {
        const produced = turn.calls
          .filter((call) => call.status === "succeeded" && call.image)
          .map((call) => call.image?.id)
          .filter(Boolean);
        lines.push(
          `Assistant: edited [${decision.sourceImageIds.join(", ")}] → [${produced.join(", ") || "failed"}]: "${decision.instruction}"`,
        );
        break;
      }
      case "transform":
        lines.push(
          `Assistant: ran ${decision.operation} on ${decision.sourceImageId}`,
        );
        break;
      case "diagnose":
        lines.push(`Assistant: asked "${decision.question}"`);
        break;
      case "negotiate":
        lines.push(`Assistant: flagged a model limitation: ${decision.reason}`);
        break;
    }
    return lines.join("\n");
  }

  private describeProjectState(context: StudioTurnContext): string {
    const lines: string[] = ["## PROJECT STATE"];

    const basePrompt = this.latestBasePrompt(context.history);
    lines.push(
      basePrompt
        ? `Working basePrompt: ${basePrompt}`
        : "Working basePrompt: (none yet — no generation has run)",
    );

    const inventory = this.imageInventory(context.history);
    if (inventory.length === 0) {
      lines.push("Images in this project: none yet.");
    } else {
      const shown = inventory.slice(-MAX_INVENTORY_IMAGES);
      const omitted = inventory.length - shown.length;
      lines.push(
        "Images in this project (id — source prompt):" +
          (omitted > 0 ? ` (${omitted} earlier images omitted)` : ""),
      );
      for (const image of shown) {
        lines.push(`- ${image.id} — ${excerpt(image.sourcePrompt)}`);
      }
    }

    if (context.selectedImageId) {
      const selected = inventory.find(
        (image) => image.id === context.selectedImageId,
      );
      lines.push(
        selected
          ? `Selected image: ${selected.id} (source prompt: ${selected.sourcePrompt})`
          : `Selected image: ${context.selectedImageId}`,
      );
    } else {
      lines.push("Selected image: none.");
    }

    return lines.join("\n");
  }

  private latestBasePrompt(
    history: readonly StudioTurnRecord[],
  ): string | null {
    for (let i = history.length - 1; i >= 0; i--) {
      const decision = history[i]?.decision;
      if (decision?.action === "generate") return decision.basePrompt;
    }
    return null;
  }

  private imageInventory(
    history: readonly StudioTurnRecord[],
  ): Array<{ id: string; sourcePrompt: string }> {
    const images: Array<{ id: string; sourcePrompt: string }> = [];
    for (const turn of history) {
      for (const call of turn.calls) {
        if (call.status === "succeeded" && call.image) {
          images.push({
            id: call.image.id,
            sourcePrompt: call.image.sourcePrompt,
          });
        }
      }
    }
    return images;
  }

  private loadTemplate(): string {
    if (this.templateCache === null) {
      this.templateCache = readFileSync(TEMPLATE_PATH, "utf-8").trim();
    }
    return this.templateCache;
  }
}

function excerpt(text: string): string {
  return text.length <= SOURCE_PROMPT_EXCERPT_CHARS
    ? text
    : `${text.slice(0, SOURCE_PROMPT_EXCERPT_CHARS)}…`;
}

function summarizeZodError(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}
