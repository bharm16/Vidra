import { describe, expect, it } from "vitest";
import type {
  SessionPromptVersionEntry,
  SessionPromptKeyframe,
} from "@shared/types/session";
import {
  enforceImmutableKeyframes,
  enforceImmutableVersions,
  reconcileGenerationRecord,
} from "@utils/immutableMedia";

describe("server immutable media utils", () => {
  it("preserves first-frame storagePath and assetId when incoming differs", () => {
    const existing: SessionPromptVersionEntry = {
      versionId: "v1",
      signature: "sig",
      prompt: "prompt",
      timestamp: "now",
      firstFrame: {
        generatedAt: "now",
        imageUrl: "https://old.example.com/image.png",
        storagePath: "users/user1/previews/images/original.webp",
        assetId: "asset-123",
      },
    };
    const incoming: SessionPromptVersionEntry = {
      ...existing,
      firstFrame: {
        generatedAt: "now",
        imageUrl: "https://new.example.com/image.png",
        storagePath: "users/user1/previews/images/overwritten.webp",
        assetId: "asset-999",
      },
    };

    const result = enforceImmutableVersions([existing], [incoming]);

    expect(result.versions?.[0]?.firstFrame?.storagePath).toBe(
      "users/user1/previews/images/original.webp",
    );
    expect(result.versions?.[0]?.firstFrame?.assetId).toBe("asset-123");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  // The first frame was persisted under `preview` until 2026-08-10. A session
  // stored before the rename still holds it there, while a client that has
  // read and re-saved it sends `firstFrame`. Comparing the names directly
  // would read as "the client dropped the frame" and resurrect the old copy,
  // leaving two records of one frame in the document.
  it("coalesces the legacy preview spelling with an incoming firstFrame", () => {
    const existing: SessionPromptVersionEntry = {
      versionId: "v1",
      signature: "sig",
      prompt: "prompt",
      timestamp: "now",
      preview: {
        generatedAt: "now",
        imageUrl: "https://old.example.com/image.png",
        storagePath: "users/user1/previews/images/original.webp",
        assetId: "asset-123",
      },
    };
    const incoming: SessionPromptVersionEntry = {
      versionId: "v1",
      signature: "sig",
      prompt: "prompt",
      timestamp: "now",
      firstFrame: {
        generatedAt: "now",
        imageUrl: "https://new.example.com/image.png",
        storagePath: "users/user1/previews/images/overwritten.webp",
        assetId: "asset-999",
      },
    };

    const result = enforceImmutableVersions([existing], [incoming]);

    // The immutable identifiers still win across the spelling change...
    expect(result.versions?.[0]?.firstFrame?.storagePath).toBe(
      "users/user1/previews/images/original.webp",
    );
    expect(result.versions?.[0]?.firstFrame?.assetId).toBe("asset-123");
    // ...and the document is left with exactly one frame, under the new name.
    expect(result.versions?.[0]?.preview).toBeUndefined();
  });

  it("preserves generation mediaAssetIds when incoming differs", () => {
    const existing: SessionPromptVersionEntry = {
      versionId: "v1",
      signature: "sig",
      prompt: "prompt",
      timestamp: "now",
      generations: [
        {
          id: "gen-1",
          mediaUrls: ["https://old.example.com/video.mp4"],
          mediaAssetIds: ["users/user1/generations/original.mp4"],
        },
      ],
    };
    const incoming: SessionPromptVersionEntry = {
      ...existing,
      generations: [
        {
          id: "gen-1",
          mediaUrls: ["https://new.example.com/video.mp4"],
          mediaAssetIds: ["users/user1/generations/overwritten.mp4"],
        },
      ],
    };

    const result = enforceImmutableVersions([existing], [incoming]);
    const generation = result.versions?.[0]?.generations?.[0] as
      | Record<string, unknown>
      | undefined;

    expect(generation?.mediaAssetIds).toEqual([
      "users/user1/generations/original.mp4",
    ]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("preserves keyframe storagePath when incoming differs", () => {
    const existing: SessionPromptKeyframe[] = [
      {
        id: "kf-1",
        url: "https://old.example.com/frame.png",
        storagePath: "users/user1/previews/images/original.webp",
      },
    ];
    const incoming: SessionPromptKeyframe[] = [
      {
        id: "kf-1",
        url: "https://new.example.com/frame.png",
        storagePath: "users/user1/previews/images/overwritten.webp",
      },
    ];

    const result = enforceImmutableKeyframes(existing, incoming);
    expect(result.keyframes?.[0]?.storagePath).toBe(
      "users/user1/previews/images/original.webp",
    );
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("does not introduce undefined video fields", () => {
    const existing: SessionPromptVersionEntry = {
      versionId: "v1",
      signature: "sig",
      prompt: "prompt",
      timestamp: "now",
    };
    const incoming: SessionPromptVersionEntry = {
      versionId: "v1",
      signature: "sig",
      prompt: "prompt",
      timestamp: "now",
    };

    const result = enforceImmutableVersions([existing], [incoming]);
    const merged = result.versions?.[0];

    expect(Object.prototype.hasOwnProperty.call(merged ?? {}, "video")).toBe(
      false,
    );
    expect(Object.prototype.hasOwnProperty.call(merged ?? {}, "preview")).toBe(
      false,
    );
  });

  // A whole-array versions write must never clear history: versions and takes
  // only accumulate (issue #112).
  it("preserves stored versions when the incoming array is empty", () => {
    const existing: SessionPromptVersionEntry[] = [
      {
        versionId: "v1",
        signature: "sig",
        prompt: "p",
        timestamp: "now",
        generations: [{ id: "g1", mediaUrls: ["https://x/y.png"] } as never],
      },
    ];

    const result = enforceImmutableVersions(existing, []);

    expect(result.versions).toEqual(existing);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("leaves an empty array empty when there is nothing stored to preserve", () => {
    const result = enforceImmutableVersions([], []);
    expect(result.versions).toEqual([]);
    expect(result.warnings).toHaveLength(0);
  });
});

describe("reconcileGenerationRecord — the server-owned take facts (issue #112)", () => {
  const storedTake = (): Record<string, unknown> => ({
    id: "gen-1",
    mediaType: "image",
    prompt: "an astronaut on mars",
    status: "completed",
    completedAt: "2026-09-17T00:00:00.000Z",
    mediaUrls: ["https://signed.example.com/old.webp?token=old"],
    thumbnailUrl: "https://signed.example.com/old-thumb.webp?token=old",
    mediaAssetIds: ["users/u1/gen/orig.webp"],
    storagePath: "users/u1/gen/orig.webp",
    ancestorGenerationId: "pic-0",
    archived: true,
    origin: "upload",
    productionProvenance: { state: "unknown" },
    sourceInputs: [
      { kind: "upload", assetId: "a1", storagePath: "users/u1/gen/orig.webp" },
    ],
  });

  it.each([
    "origin",
    "productionProvenance",
    "sourceInputs",
    "ancestorGenerationId",
    "archived",
    "status",
    "completedAt",
    "storagePath",
    "mediaAssetIds",
  ])("preserves %s when a stale incoming record omits it", (field) => {
    const existing = storedTake();
    const incoming = storedTake();
    delete incoming[field];

    const { record, conflicts } = reconcileGenerationRecord(existing, incoming);

    expect(record[field]).toEqual(existing[field]);
    expect(conflicts).toHaveLength(0);
  });

  it("refreshes the signed URLs while keeping the durable identifiers", () => {
    const existing = storedTake();
    const incoming = {
      ...storedTake(),
      mediaUrls: ["https://signed.example.com/new.webp?token=new"],
      thumbnailUrl: "https://signed.example.com/new-thumb.webp?token=new",
    };

    const { record, conflicts } = reconcileGenerationRecord(existing, incoming);

    expect(record.mediaUrls).toEqual([
      "https://signed.example.com/new.webp?token=new",
    ]);
    expect(record.thumbnailUrl).toBe(
      "https://signed.example.com/new-thumb.webp?token=new",
    );
    expect(record.storagePath).toBe("users/u1/gen/orig.webp");
    expect(record.mediaAssetIds).toEqual(["users/u1/gen/orig.webp"]);
    expect(conflicts).toHaveLength(0);
  });

  it.each([
    ["origin", "generated"],
    ["ancestorGenerationId", "pic-tampered"],
    ["archived", false],
    ["storagePath", "users/attacker/gen/evil.webp"],
    [
      "productionProvenance",
      { state: "known", instruction: "made up", model: null },
    ],
    ["mediaAssetIds", ["users/attacker/gen/evil.webp"]],
  ] as const)(
    "reports a conflict and keeps the stored value when incoming alters %s",
    (field, altered) => {
      const existing = storedTake();
      const incoming = { ...storedTake(), [field]: altered };

      const { record, conflicts } = reconcileGenerationRecord(
        existing,
        incoming,
      );

      expect(record[field]).toEqual(existing[field]);
      expect(conflicts.map((conflict) => conflict.field)).toContain(field);
    },
  );

  it("never invents a fact a legacy stored take lacks", () => {
    const existing = {
      id: "gen-legacy",
      mediaType: "image",
      prompt: "old",
      status: "completed",
      mediaUrls: ["https://x/y.png"],
    };
    const incoming = {
      ...existing,
      origin: "generated",
      productionProvenance: { state: "unknown" },
    };

    const { record, conflicts } = reconcileGenerationRecord(existing, incoming);

    expect("origin" in record).toBe(false);
    expect("productionProvenance" in record).toBe(false);
    expect(conflicts).toHaveLength(0);
  });

  it("returns the incoming record unchanged when no stored take matches", () => {
    const incoming = storedTake();
    const { record, conflicts } = reconcileGenerationRecord(
      undefined,
      incoming,
    );
    expect(record).toBe(incoming);
    expect(conflicts).toHaveLength(0);
  });
});
