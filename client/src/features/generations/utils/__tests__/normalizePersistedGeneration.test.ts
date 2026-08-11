import { describe, expect, it } from "vitest";
import {
  normalizePersistedGeneration,
  normalizePersistedGenerations,
} from "../normalizePersistedGeneration";

/**
 * The session contract keeps a generation record as an open bag, so these are
 * the shapes the wire actually delivers — not the shape `Generation` claims.
 * Each case here was a live defect before ADR-0021: the repositories cast the
 * bag straight across, so `tsc` vouched for four fields nothing guaranteed.
 */
describe("normalizePersistedGeneration", () => {
  const clipRecord = {
    id: "job-1",
    model: "sora-2",
    prompt: "a cat",
    status: "completed",
    mediaUrls: ["https://example.com/clip.mp4"],
    completedAt: "2026-08-10T12:00:00.000Z",
    ancestorGenerationId: "picture-1",
    promptVersionId: "v1",
  };

  describe("fields the wire does not guarantee", () => {
    it("stamps mediaType on a clip record that omits it", () => {
      // processVideoJob wrote no mediaType until 2026-08-10. Without this,
      // deriveSpaceNodes matches neither its picture nor its clip branch and
      // the take never becomes a node at all.
      expect(normalizePersistedGeneration(clipRecord)?.mediaType).toBe("video");
    });

    it("derives tier from the model, ignoring a stale persisted value", () => {
      const stamped = { ...clipRecord, tier: "draft" };
      expect(normalizePersistedGeneration(stamped)?.tier).toBe("render");
    });

    it("derives a draft tier for a draft-tier model", () => {
      const wan = { ...clipRecord, model: "wan-2.5" };
      expect(normalizePersistedGeneration(wan)?.tier).toBe("draft");
    });

    it("converts an ISO completedAt into epoch ms", () => {
      // The gallery sorts on this. As a string, `a.createdAt - b.createdAt`
      // is NaN and the comparator silently stops ordering anything.
      const result = normalizePersistedGeneration(clipRecord);
      expect(result?.completedAt).toBe(Date.parse("2026-08-10T12:00:00.000Z"));
      expect(typeof result?.createdAt).toBe("number");
      expect(Number.isFinite(result?.createdAt)).toBe(true);
    });

    it("falls back to completedAt when no createdAt was written", () => {
      const result = normalizePersistedGeneration(clipRecord);
      expect(result?.createdAt).toBe(result?.completedAt);
    });
  });

  describe("what it must not disturb", () => {
    it("keeps a persisted mediaType over the derived one", () => {
      const storyboard = {
        ...clipRecord,
        model: "flux-kontext",
        mediaType: "image-sequence",
      };
      expect(normalizePersistedGeneration(storyboard)?.mediaType).toBe(
        "image-sequence",
      );
    });

    it("derives the media type of a picture from its provider model id", () => {
      const picture = {
        ...clipRecord,
        model: "black-forest-labs/flux-schnell",
        mediaType: undefined,
      };
      expect(normalizePersistedGeneration(picture)?.mediaType).toBe("image");
    });

    it("carries the rest of the open bag through untouched", () => {
      const result = normalizePersistedGeneration({
        ...clipRecord,
        thumbnailUrl: "https://example.com/poster.jpg",
        isFavorite: true,
        archived: true,
      });
      // ancestorGenerationId and archived are read straight off the bag by
      // deriveSpaceNodes, so they are not on the `Generation` type — but they
      // must still survive normalization or the space loses its lineage edges.
      const bag = result as unknown as Record<string, unknown>;
      expect(bag.ancestorGenerationId).toBe("picture-1");
      expect(bag.archived).toBe(true);
      expect(result?.thumbnailUrl).toBe("https://example.com/poster.jpg");
      expect(result?.isFavorite).toBe(true);
    });
  });

  describe("records that cannot be takes", () => {
    it.each([[null], [undefined], ["string"], [{}], [{ id: "" }]])(
      "returns null for %p",
      (record) => {
        expect(normalizePersistedGeneration(record)).toBeNull();
      },
    );

    it("drops them from an array rather than failing the whole version", () => {
      expect(
        normalizePersistedGenerations([clipRecord, null, {}]),
      ).toHaveLength(1);
    });

    it("returns an empty array for a non-array", () => {
      expect(normalizePersistedGenerations(undefined)).toEqual([]);
    });
  });
});
