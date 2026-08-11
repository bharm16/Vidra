import { describe, expect, it } from "vitest";
import { normalizePersistedVersions } from "../normalizePersistedVersions";

const version = {
  versionId: "v1",
  signature: "sig",
  prompt: "a cat",
  timestamp: "2026-08-10T12:00:00.000Z",
};

const frame = {
  generatedAt: "2026-08-10T12:00:00.000Z",
  imageUrl: "https://example.com/frame.png",
  storagePath: "users/u1/previews/images/frame.webp",
  assetId: "asset-1",
};

describe("normalizePersistedVersions", () => {
  // The first frame was persisted under `preview` until 2026-08-10. Sessions
  // written before the rename must keep their frames without a backfill, and
  // nothing past this boundary should have to know there were ever two names.
  describe("the retired preview spelling", () => {
    it("folds a legacy preview into firstFrame", () => {
      const [result] = normalizePersistedVersions([
        { ...version, ...{ preview: frame } },
      ]);
      expect(result?.firstFrame).toEqual(frame);
    });

    it("drops the old key so only one name survives the boundary", () => {
      const [result] = normalizePersistedVersions([
        { ...version, ...{ preview: frame } },
      ]);
      expect(
        (result as unknown as Record<string, unknown>).preview,
      ).toBeUndefined();
    });

    it("prefers firstFrame when a version carries both", () => {
      const legacy = { ...frame, assetId: "stale" };
      const [result] = normalizePersistedVersions([
        { ...version, ...{ preview: legacy, firstFrame: frame } },
      ]);
      expect(result?.firstFrame?.assetId).toBe("asset-1");
    });

    it("leaves a version with no frame alone", () => {
      const [result] = normalizePersistedVersions([version]);
      expect(result?.firstFrame).toBeUndefined();
      expect(result?.versionId).toBe("v1");
    });
  });

  describe("generations", () => {
    it("normalizes the open generation bags it carries", () => {
      const [result] = normalizePersistedVersions([
        {
          ...version,
          generations: [
            {
              id: "job-1",
              model: "sora-2",
              completedAt: "2026-08-10T12:00:00.000Z",
            },
          ],
        },
      ]);
      // Derived, not persisted — see ADR-0021 and the clip mediaType fix.
      expect(result?.generations?.[0]?.tier).toBe("render");
      expect(result?.generations?.[0]?.mediaType).toBe("video");
    });

    it("leaves a version without generations untouched", () => {
      expect(
        normalizePersistedVersions([version])[0]?.generations,
      ).toBeUndefined();
    });
  });

  it("returns an empty array for a non-array", () => {
    expect(normalizePersistedVersions(undefined)).toEqual([]);
  });
});
