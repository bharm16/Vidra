import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { EventEmitter } from "events";

vi.mock("@infrastructure/Logger", () => {
  const base = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() };
  base.child.mockReturnValue(base);
  return { logger: base };
});

import { createOptimizeHandler } from "@routes/optimize/handlers/optimize";
import { GuidedWordingService } from "@services/prompt-optimization/services/GuidedWordingService";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";

const GUIDANCE: Record<string, string> = {
  "veo-profile": "Write spoken lines in quotation marks.",
  "wan-profile": "Leave things to avoid out of the words; Wan has its own field.",
};

function request(body: Record<string, unknown>): Request {
  const emitter = new EventEmitter();
  return Object.assign(emitter, { id: "req", body }) as unknown as Request;
}

function response(): Response {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    headersSent: false,
    writableEnded: false,
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }) as unknown as Response;
}

async function guidanceSentFor(profileId: string | undefined): Promise<unknown> {
  const service = { optimize: vi.fn(async () => ({ prompt: "better words", quality: {} })), compilePrompt: vi.fn() };
  const handler = createOptimizeHandler(service as never, (id) => GUIDANCE[id]);
  await handler(request({ prompt: "a woman says hello", mode: "video", ...(profileId ? { profileId } : {}) }), response());
  return (service.optimize.mock.calls[0] as unknown as [{ modelGuidance?: string }])[0].modelGuidance;
}

describe("Improve wording follows the selected profile's guidance", () => {
  it("sends each profile's own guidance", async () => {
    await expect(guidanceSentFor("veo-profile")).resolves.toBe(GUIDANCE["veo-profile"]);
    await expect(guidanceSentFor("wan-profile")).resolves.toBe(GUIDANCE["wan-profile"]);
  });

  it("sends no guidance for a profile without any, or without a profile", async () => {
    await expect(guidanceSentFor("upscale-profile")).resolves.toBeUndefined();
    await expect(guidanceSentFor(undefined)).resolves.toBeUndefined();
  });

  it("rewrites with the guidance as instructions and the creator's words as the message", async () => {
    const execute = vi.fn(async () => ({ text: '  The woman says "hello."  ' }));
    const ai = { execute, resolveExecution: vi.fn() } as unknown as AIExecutionPort;

    const result = await new GuidedWordingService(ai).rewrite("a woman says hello", GUIDANCE["veo-profile"] as string);

    expect(result.prompt).toBe('The woman says "hello."');
    const [operation, params] = execute.mock.calls[0] as unknown as [string, { systemPrompt: string; userMessage: string }];
    expect(operation).toBe("improve_wording");
    expect(params.systemPrompt).toContain(GUIDANCE["veo-profile"]);
    expect(params.systemPrompt).not.toContain("a woman says hello");
    expect(params.userMessage).toBe("a woman says hello");
  });

  it("fails rather than returning empty words", async () => {
    const ai = { execute: vi.fn(async () => ({ text: "  " })), resolveExecution: vi.fn() } as unknown as AIExecutionPort;
    await expect(new GuidedWordingService(ai).rewrite("words", "guidance")).rejects.toThrow();
  });
});
