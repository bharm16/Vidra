import assert from "node:assert/strict";
import { AIModelService } from "../../../server/src/services/ai-model/AIModelService";
import { LLMClient } from "../../../server/src/clients/LLMClient";
import { OpenAICompatibleAdapter } from "../../../server/src/clients/adapters/OpenAICompatibleAdapter";
import { StudioPolicyEngine } from "../../../server/src/services/studio/StudioPolicyEngine";
import { StudioService } from "../../../server/src/services/studio/StudioService";
import { StudioModelRegistry } from "../../../server/src/services/studio/StudioModelRegistry";
import { ReplicateStudioImageRunner } from "../../../server/src/services/studio/providers/ReplicateStudioImageRunner";
import { InMemoryStudioProjectStore } from "../../../tests/integration/helpers/cross-mode/boundaryDoubles";
import type {
  StudioDecision,
  StudioModelSlug,
} from "../../../server/src/services/studio/types";
import type { OfflineProviderTransport } from "./transport";
import type { QualityPathResult } from "./types";
import { QUALITY_EDIT, QUALITY_PROMPT, QUALITY_SOURCE } from "./fixtures";

const suggestions: [string, string, string] = [
  "Warmer light",
  "Tighter crop",
  "Cooler grade",
];

/** Real turn, policy, AI router, LLM client, registry and image SDK over external doubles. */
export async function evaluateStudioRouting(
  transport: OfflineProviderTransport,
): Promise<QualityPathResult[]> {
  const aiService = new AIModelService({
    clients: {
      openai: new LLMClient({
        providerName: "openai",
        defaultModel: "gpt-5.6-luna",
        adapter: new OpenAICompatibleAdapter({
          apiKey: "offline-quality-fixture-token",
          baseURL: "https://api.openai.com/v1",
          defaultModel: "gpt-5.6-luna",
        }),
      }),
    },
  });
  const cases: {
    id: string;
    pin: StudioModelSlug | null;
    decisions: StudioDecision[];
    expectedModel: string | null;
    count: number;
  }[] = [
    {
      id: "auto-generate",
      pin: null,
      decisions: [
        {
          action: "generate",
          basePrompt: QUALITY_PROMPT,
          variants: [
            QUALITY_PROMPT,
            QUALITY_PROMPT,
            QUALITY_PROMPT,
            QUALITY_PROMPT,
          ],
          capability: "general",
          aspectRatio: "9:16",
          suggestions,
        },
      ],
      expectedModel: "recraft-ai/recraft-v4.1",
      count: 4,
    },
    {
      id: "pinned-pro-generate",
      pin: "nano-banana-pro",
      decisions: [
        {
          action: "generate",
          basePrompt: QUALITY_PROMPT,
          variants: [
            QUALITY_PROMPT,
            QUALITY_PROMPT,
            QUALITY_PROMPT,
            QUALITY_PROMPT,
          ],
          capability: "general",
          aspectRatio: "9:16",
          suggestions,
        },
      ],
      expectedModel: "google/nano-banana-pro",
      count: 4,
    },
    {
      id: "auto-edit",
      pin: null,
      decisions: [
        {
          action: "edit",
          instruction: QUALITY_EDIT,
          sourceImageIds: ["source"],
          suggestions,
        },
      ],
      expectedModel: "google/nano-banana-2",
      count: 1,
    },
    {
      id: "pinned-lite-edit",
      pin: "nano-banana-2-lite",
      decisions: [
        {
          action: "edit",
          instruction: QUALITY_EDIT,
          sourceImageIds: ["source"],
          suggestions,
        },
      ],
      expectedModel: "google/nano-banana-2-lite",
      count: 1,
    },
    {
      id: "incapable-pin-negotiate",
      pin: "recraft-v4.1",
      decisions: [
        {
          action: "edit",
          instruction: QUALITY_EDIT,
          sourceImageIds: ["source"],
          suggestions,
        },
        {
          action: "negotiate",
          reason: "This pinned model cannot edit images.",
          options: [
            { label: "Choose an editor", message: "Use Nano Banana 2" },
          ],
        },
      ],
      expectedModel: null,
      count: 0,
    },
  ];
  const results: QualityPathResult[] = [];
  for (const entry of cases) {
    transport.received.length = 0;
    transport.llmRequests.length = 0;
    transport.unexpected.length = 0;
    transport.decisions.push(...entry.decisions);
    const store = new InMemoryStudioProjectStore();
    let copyId = 0;
    const service = new StudioService({
      store,
      registry: new StudioModelRegistry(),
      runner: new ReplicateStudioImageRunner({
        apiToken: "offline-quality-fixture-token",
      }),
      policy: new StudioPolicyEngine({ ai: aiService }),
      dailyCapCents: 1000,
      storage: {
        saveFromUrl: async (userId): Promise<{ storagePath: string }> => ({
          storagePath: `users/${userId}/previews/images/quality-${++copyId}.png`,
        }),
        getViewUrl: async (
          _userId,
          storagePath,
        ): Promise<{
          viewUrl: string;
          storagePath: string;
          expiresAt: string;
        }> => ({
          viewUrl: QUALITY_SOURCE,
          storagePath,
          expiresAt: "2099-01-01T00:00:00.000Z",
        }),
      },
    });
    let reason: string | undefined;
    try {
      const project = await service.createProject("quality-fixture");
      await store.updateProject(project.id, {
        pinnedModel: entry.pin,
        attachments: [
          {
            id: "source",
            storagePath: "users/quality-fixture/previews/images/source.png",
            filename: "source.png",
            createdAtMs: 0,
          },
        ],
      });
      const run = await service.runTurn(
        "quality-fixture",
        project.id,
        entry.count === 4 ? QUALITY_PROMPT : QUALITY_EDIT,
      );
      await run.completion;
      assert.equal(transport.unexpected.length, 0);
      assert.equal(
        transport.decisions.length,
        0,
        "all expected policy decisions consumed",
      );
      assert.equal(
        transport.received.length,
        entry.count,
        "no silent model reroute",
      );
      assert.ok(
        transport.received.every((call) => call.model === entry.expectedModel),
      );
      if (entry.count === 0) assert.equal(run.decision.action, "negotiate");
      const stored = await store.getTurn(project.id, run.turnId);
      assert.ok(stored);
      assert.ok(stored.calls.every((call) => call.status === "succeeded"));
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
    transport.decisions.length = 0;
    results.push({
      id: `studio/routing/${entry.id}`,
      operation: entry.count === 4 ? "generate" : "edit",
      model: entry.expectedModel ?? "no-image-model",
      configuration: {
        pinnedModel: entry.pin,
        llm: aiService.resolveExecution("studio_turn"),
        imageCallCount: entry.count,
        llmRequestCount: transport.llmRequests.length,
      },
      contract: reason ? "failed" : "passed",
      assertions: [
        "real policy through aiService over controlled external LLM response",
        "Auto default or explicit pin reaches expected HTTP model",
        "incapable pin negotiates without a paid image call",
        "turn settles successfully over controlled persistence",
      ],
      submitted: structuredClone(transport.received),
      ...(reason ? { reason } : {}),
      live: "not-verified",
      quality: "awaiting-owner-review",
    });
  }
  return results;
}
