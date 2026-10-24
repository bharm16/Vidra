import { expect, it, vi } from "vitest";
import { readSpanLabelStream } from "../spanLabelingStream";
const span = { text: "dancer", start: 2, end: 8, category: "subject.identity", confidence: .9 };
const log = { debug: vi.fn(), warn: vi.fn() };
function reader(body: string): ReadableStreamDefaultReader<Uint8Array> { return new ReadableStream<Uint8Array>({ start(controller): void { controller.enqueue(new TextEncoder().encode(body)); controller.close(); } }).getReader(); }
it("rejects a server failure after partial progress", async () => {
  await expect(readSpanLabelStream(reader(JSON.stringify(span) + "\n" + JSON.stringify({ error: "Streaming failed", message: "provider unavailable" }) + "\n"), vi.fn(), log)).rejects.toThrow("provider unavailable");
});
it("replaces provisional spans with authoritative completion, including a final line without a newline", async () => {
  const final = { ...span, text: "young dancer", start: 0 };
  const body = JSON.stringify({ type: "span", span }) + "\n" + JSON.stringify({ type: "complete", result: { spans: [final], meta: { version: "v1" } } });
  await expect(readSpanLabelStream(reader(body), vi.fn(), log)).resolves.toMatchObject({ spans: [final], meta: { version: "v1" } });
});
