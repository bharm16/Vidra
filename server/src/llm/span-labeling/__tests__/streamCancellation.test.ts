import { expect, it, vi } from "vitest";
import { GeminiSpanBehavior } from "../providers/gemini/GeminiSpanBehavior";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import type { StreamParams } from "@services/ai-model/types";
import { SubstringPositionCache } from "../cache/SubstringPositionCache";
it("aborts provider consumption when the span observer closes", async () => {
  let signal: AbortSignal | undefined;
  const stream = vi.fn(async (_operation: string, options: StreamParams): Promise<string> => { signal = options.signal; options.onChunk('{"text":"dancer","role":"subject.identity","confidence":0.9}\n'); return new Promise((_resolve, reject) => options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })); });
  const iterator = new GeminiSpanBehavior().streamSpans({ text: "A dancer", policy: {}, options: {}, enableRepair: false, cache: new SubstringPositionCache(), aiService: { stream } as unknown as AIExecutionPort });
  await iterator.next(); await iterator.return(); expect(signal?.aborted).toBe(true);
});

it("rejects a cancelled multi-chunk labeling pass instead of completing partial highlights", async () => {
  const { labelSpans } = await import("../SpanLabelingService");
  const cancellation = new AbortController();
  const execute = vi.fn(async (_operation, options): Promise<never> => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })));
  const port = { execute, resolveExecution: () => ({ client: "openai", provider: "openai", model: "gpt-4o", viaFallback: false }) } as unknown as AIExecutionPort;
  const result = labelSpans({ text: "A dancer spins. ".repeat(300), signal: cancellation.signal }, port);
  const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(execute).toHaveBeenCalled()); cancellation.abort(); await rejected;
});
