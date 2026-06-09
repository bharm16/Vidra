import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createPostHogQueryClient,
  type PostHogQueryClient,
} from "../posthog-query-client.js";

const originalFetch = global.fetch;

describe("posthog-query-client", () => {
  beforeEach(() => {
    process.env.POSTHOG_PROJECT_API_KEY = "fake-personal-key";
    process.env.POSTHOG_PROJECT_ID = "123";
  });

  afterEach(() => {
    delete process.env.POSTHOG_PROJECT_API_KEY;
    delete process.env.POSTHOG_PROJECT_ID;
    global.fetch = originalFetch;
  });

  it("returns a noop client when keys are missing", async () => {
    delete process.env.POSTHOG_PROJECT_API_KEY;
    const client = createPostHogQueryClient();
    await expect(
      client.fetchEventsToScore("optimize.completed", 24, 1),
    ).resolves.toEqual([]);
    await expect(client.fetchAlreadyScoredIds([], "v", "m")).resolves.toEqual(
      new Set(),
    );
  });

  it("issues a HogQL query and maps results to events", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          [
            "00000000-0000-0000-0000-000000000001",
            "optimize.completed",
            { inputPrompt: "x", outputPrompt: "y", source: "synthetic" },
          ],
        ],
      }),
    }) as unknown as typeof fetch;

    const client = createPostHogQueryClient();
    const events = await client.fetchEventsToScore("optimize.completed", 24, 1);
    expect(events).toEqual([
      {
        uuid: "00000000-0000-0000-0000-000000000001",
        event: "optimize.completed",
        properties: {
          inputPrompt: "x",
          outputPrompt: "y",
          source: "synthetic",
        },
      },
    ]);

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[0]).toContain("/api/projects/123/query");
    const body = JSON.parse(call[1].body);
    expect(body.query.kind).toBe("HogQLQuery");
    expect(body.query.query).toContain("optimize.completed");
  });

  it("returns a set of already-scored ids", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [["id-1"], ["id-2"]],
      }),
    }) as unknown as typeof fetch;

    const client = createPostHogQueryClient();
    const seen = await client.fetchAlreadyScoredIds(
      ["id-1", "id-2", "id-3"],
      "v1",
      "gpt-4o-2024-08-06",
    );
    expect(seen).toEqual(new Set(["id-1", "id-2"]));
  });

  it("logs and returns empty when HTTP fails (best-effort)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "error",
    }) as unknown as typeof fetch;
    const client = createPostHogQueryClient();
    const events = await client.fetchEventsToScore("optimize.completed", 24, 1);
    expect(events).toEqual([]);
  });

  it("skips a row with malformed JSON properties, returns the valid rows", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          [
            "00000000-0000-0000-0000-000000000001",
            "optimize.completed",
            "{not-json",
          ],
          [
            "00000000-0000-0000-0000-000000000002",
            "optimize.completed",
            { inputPrompt: "ok", source: "synthetic" },
          ],
        ],
      }),
    }) as unknown as typeof fetch;

    const client = createPostHogQueryClient();
    const events = await client.fetchEventsToScore("optimize.completed", 24, 1);
    // Both rows are returned. The malformed row gets an empty properties object.
    expect(events).toHaveLength(2);
    expect(events[0]!.properties).toEqual({});
    expect(events[1]!.properties).toEqual({
      inputPrompt: "ok",
      source: "synthetic",
    });
  });

  it("encodes per-source sampling: synth/dogfood always, user at userSampleRate", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = createPostHogQueryClient();
    await client.fetchEventsToScore("optimize.completed", 24, 0.1);

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    const q = body.query.query as string;
    expect(q).toContain("'synthetic'");
    expect(q).toContain("'dogfood'");
    expect(q).toContain("'user'");
    // 10% sample → modulo 10
    expect(q).toContain("cityHash64(toString(uuid)) % 100 < 10");
  });
});
