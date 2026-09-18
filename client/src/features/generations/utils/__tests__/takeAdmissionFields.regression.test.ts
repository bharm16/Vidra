import { describe, expect, it } from "vitest";
import { SessionGenerationRecordSchema } from "@shared/schemas/session.schemas";
import type { Generation } from "../../types";
import { normalizePersistedGeneration } from "../normalizePersistedGeneration";
import {
  SERVER_OWNED_RECORD_FIELDS,
  preserveServerOwnedFields,
  readAncestorGenerationId,
  readMediaAssetId,
  readProductionProvenance,
  readSourceInputs,
  readStoragePath,
  readTakeOrigin,
} from "../serverOwnedRecordFields";

/**
 * The admission trio has to survive TWO client hazards, not one (issue #86,
 * ADR-0022 decisions 1-3).
 *
 * The first is the read: `SessionGenerationRecordSchema` is an open bag, so a
 * field the reader does not name is a field the reader can silently drop.
 *
 * The second is the merge, and it is the one that has bitten before. The
 * client's versions PATCH picks WHOLE records by completeness, so a runtime
 * object that wins the tie writes back a record missing every field only the
 * server ever set — which is how `ancestorGenerationId` used to be PATCHed
 * away and the picture→clip edge lost on reload. A field validated at the wire
 * and absent from `SERVER_OWNED_RECORD_FIELDS` is a field the client destroys
 * on the next save.
 *
 * The record shape below is what the server actually writes.
 */

const admittedUpload = {
  id: "gen-upload-1",
  model: null,
  mediaType: "image",
  prompt: "a runner on a rain-slicked street",
  status: "completed",
  mediaUrls: ["https://storage.example.com/asset-1"],
  mediaAssetIds: ["asset-1"],
  thumbnailUrl: "https://storage.example.com/asset-1",
  storagePath: "image-previews/user-1/asset-1",
  promptVersionId: "v1",
  ancestorGenerationId: null,
  origin: "upload",
  productionProvenance: { state: "unknown" },
  sourceInputs: [
    {
      kind: "upload",
      assetId: "asset-1",
      storagePath: "image-previews/user-1/asset-1",
    },
  ],
  completedAt: "2026-09-17T00:00:00.000Z",
};

const refinedStudioPicture = {
  id: "gen-studio-1",
  model: "flux-kontext",
  mediaType: "image",
  prompt: "a runner on a rain-slicked street",
  status: "completed",
  mediaUrls: ["https://storage.example.com/asset-2"],
  promptVersionId: "v1",
  // Decision 3: one display ancestor, chosen from the inputs below.
  ancestorGenerationId: "gen-source-picture",
  origin: "studio",
  productionProvenance: {
    state: "known",
    instruction: "remove the chair",
    model: "flux-kontext",
  },
  sourceInputs: [
    { kind: "take", generationId: "gen-source-picture" },
    { kind: "studio-image", assetId: "asset-2" },
  ],
  completedAt: "2026-09-17T00:01:00.000Z",
};

describe("take admission fields survive the client (ADR-0022 decisions 1-3)", () => {
  it("the record the server writes parses against the wire contract", () => {
    expect(
      SessionGenerationRecordSchema.safeParse(admittedUpload).success,
    ).toBe(true);
    expect(
      SessionGenerationRecordSchema.safeParse(refinedStudioPicture).success,
    ).toBe(true);
  });

  it("round-trips origin, production provenance and source inputs through the normalizer", () => {
    const take = normalizePersistedGeneration(admittedUpload);

    expect(take).not.toBeNull();
    if (!take) return;
    expect(readTakeOrigin(take)).toBe("upload");
    expect(readProductionProvenance(take)).toEqual({ state: "unknown" });
    expect(readSourceInputs(take)).toEqual([
      {
        kind: "upload",
        assetId: "asset-1",
        storagePath: "image-previews/user-1/asset-1",
      },
    ]);
    // The rest of the take is read as it always was.
    expect(take.mediaType).toBe("image");
    expect(take.promptVersionId).toBe("v1");
  });

  it("reads two source inputs and exactly one display ancestor off a refined picture", () => {
    const take = normalizePersistedGeneration(refinedStudioPicture);

    expect(take).not.toBeNull();
    if (!take) return;
    expect(readSourceInputs(take)).toHaveLength(2);
    expect(readSourceInputs(take).map((input) => input.kind)).toEqual([
      "take",
      "studio-image",
    ]);
    // Many inputs, one drawn relationship.
    expect(readAncestorGenerationId(take)).toBe("gen-source-picture");
  });

  it("reports an absent origin as unrecorded rather than defaulting it to generated", () => {
    const legacy = normalizePersistedGeneration({
      id: "gen-legacy",
      model: "wan-2.2",
      status: "completed",
    });

    expect(legacy).not.toBeNull();
    if (!legacy) return;
    // Inferring an origin is exactly what the closed set exists to prevent.
    expect(readTakeOrigin(legacy)).toBeUndefined();
  });

  it("names every admission field AND durable handle as server-owned, so a merge cannot drop it", () => {
    // The admission trio (decisions 1-3) plus the durable media handles
    // (issue #125): both are server-owned identity a whole-record merge must
    // not strand. The ephemeral URLs are deliberately absent — they refresh.
    expect([...SERVER_OWNED_RECORD_FIELDS]).toEqual([
      "ancestorGenerationId",
      "archived",
      "origin",
      "productionProvenance",
      "sourceInputs",
      "storagePath",
      "mediaAssetIds",
    ]);
  });

  it("restores the admission fields AND the durable handle after a merge that picks a runtime record without them", () => {
    const persisted = normalizePersistedGeneration(
      admittedUpload,
    ) as Generation;
    // The runtime object the client would otherwise write back: same take, no
    // memory of how it was admitted, and — the #125 hazard — no durable handle.
    const incoming = {
      id: "gen-upload-1",
      model: "unknown",
      tier: "draft",
      mediaType: "image",
      status: "completed",
      prompt: "a runner on a rain-slicked street",
      promptVersionId: "v1",
      mediaUrls: ["https://storage.example.com/asset-1"],
      createdAt: 0,
      completedAt: null,
    } as unknown as Generation;

    const merged = {
      ...incoming,
      ...preserveServerOwnedFields(incoming, persisted),
    } as Generation;

    expect(readTakeOrigin(merged)).toBe("upload");
    expect(readProductionProvenance(merged)).toEqual({ state: "unknown" });
    expect(readSourceInputs(merged)).toHaveLength(1);
    // Issue #125: the durable handle survives the merge, so the space node
    // keeps what it needs to re-arm or re-mint an expired URL.
    expect(readStoragePath(merged)).toBe("image-previews/user-1/asset-1");
    expect(readMediaAssetId(merged)).toBe("asset-1");
  });
});
