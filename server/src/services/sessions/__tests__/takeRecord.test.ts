import { describe, expect, it } from "vitest";
import { buildCompletedTakeRecord } from "../takeRecord";

/**
 * The persisted take record had three writers assembling it inline — the
 * picture route, the storyboard route, and the video worker — which is why
 * af16e933 had to fix mediaType/tier/completedAt one writer at a time. This
 * builder is now the only way a server writer produces the record.
 */
describe("buildCompletedTakeRecord", () => {
  const base = {
    id: "gen-1",
    model: "flux-schnell",
    mediaType: "image" as const,
    prompt: "a dancer in the rain",
    promptVersionId: "v-1",
    mediaUrls: ["https://storage.example.com/pic.webp"],
    ancestorGenerationId: null,
  };

  it("stamps what every completed record shares", () => {
    const record = buildCompletedTakeRecord(base);
    expect(record.status).toBe("completed");
    expect(typeof record.completedAt).toBe("string");
    expect(Number.isFinite(Date.parse(record.completedAt as string))).toBe(
      true,
    );
    expect(record.id).toBe("gen-1");
    expect(record.mediaType).toBe("image");
    expect(record.ancestorGenerationId).toBeNull();
  });

  it("never writes a tier — it is derived from the model (ADR-0021)", () => {
    const record = buildCompletedTakeRecord(base);
    expect("tier" in record).toBe(false);
  });

  it("keeps the lineage edge a clip names", () => {
    const record = buildCompletedTakeRecord({
      ...base,
      mediaType: "video",
      ancestorGenerationId: "gen-pic-1",
    });
    expect(record.ancestorGenerationId).toBe("gen-pic-1");
  });

  it("omits optional fields rather than writing empty ones", () => {
    const record = buildCompletedTakeRecord(base);
    expect("mediaAssetIds" in record).toBe(false);
    expect("storagePath" in record).toBe(false);
    expect("thumbnailUrl" in record).toBe(false);
  });

  it("carries the optional fields a writer supplies", () => {
    const record = buildCompletedTakeRecord({
      ...base,
      mediaAssetIds: ["asset-1"],
      storagePath: "users/u1/generations/pic.webp",
      thumbnailUrl: "https://storage.example.com/thumb.webp",
    });
    expect(record.mediaAssetIds).toEqual(["asset-1"]);
    expect(record.storagePath).toBe("users/u1/generations/pic.webp");
    expect(record.thumbnailUrl).toBe("https://storage.example.com/thumb.webp");
  });

  it("keeps a null thumbnail — the storyboard writer records 'no still' explicitly", () => {
    const record = buildCompletedTakeRecord({ ...base, thumbnailUrl: null });
    expect(record.thumbnailUrl).toBeNull();
  });

  it("refuses a record its own wire contract would reject", () => {
    expect(() =>
      buildCompletedTakeRecord({
        ...base,
        // Not a string-or-null — the same shape the route 400s.
        ancestorGenerationId: 42 as unknown as string,
      }),
    ).toThrow();
  });
});
