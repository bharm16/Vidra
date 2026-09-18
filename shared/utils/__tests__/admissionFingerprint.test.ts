import { describe, expect, it } from "vitest";
import {
  buildAdmissionAcceptanceFingerprint,
  type AdmissionAcceptanceFingerprintInput,
} from "../admissionFingerprint.js";

/**
 * The immutable half of a take's acceptance identity (ADR-0022 decision 6,
 * issue #114). This is the seam #128 (server resumption) and #129 (client
 * attempts) build on, so its contract is pinned here directly: equal inputs
 * fingerprint equally, and the fields the ticket names each move it.
 */

function baseInput(): AdmissionAcceptanceFingerprintInput {
  return {
    sessionId: "session-1",
    promptVersionId: "v1",
    origin: "studio",
    mediaDigest: "digest-a",
    productionProvenance: {
      state: "known",
      instruction: "remove the chair",
      model: "flux-kontext",
    },
    sourceInputs: [
      { kind: "take", generationId: "gen-A" },
      { kind: "studio-image", assetId: "asset-1", storagePath: "p/asset-1" },
    ],
    displayAncestorGenerationId: "gen-A",
  };
}

const stringify = (input: AdmissionAcceptanceFingerprintInput): string =>
  JSON.stringify(buildAdmissionAcceptanceFingerprint(input));

describe("buildAdmissionAcceptanceFingerprint (issue #114)", () => {
  it("is stable: the same acceptance fingerprints identically", () => {
    expect(stringify(baseInput())).toBe(stringify(baseInput()));
  });

  it("keeps a take source input by its generationId but drops the durable storage handles that a retry re-mints", () => {
    const fingerprint = buildAdmissionAcceptanceFingerprint(baseInput());

    expect(fingerprint.sourceInputs).toEqual([
      { kind: "take", generationId: "gen-A" },
      { kind: "studio-image" },
    ]);

    // The same acceptance re-stored under fresh handles is the same
    // fingerprint — the live-editor accept re-stores its snapshot per press.
    const reStored = baseInput();
    reStored.sourceInputs = [
      { kind: "take", generationId: "gen-A" },
      { kind: "studio-image", assetId: "asset-9", storagePath: "p/asset-9" },
    ];
    expect(stringify(reStored)).toBe(stringify(baseInput()));
  });

  it("moves when the media digest changes", () => {
    const other = baseInput();
    other.mediaDigest = "digest-b";
    expect(stringify(other)).not.toBe(stringify(baseInput()));
  });

  it("moves when the production provenance changes", () => {
    const other = baseInput();
    other.productionProvenance = {
      state: "known",
      instruction: "remove the lamp",
      model: "flux-kontext",
    };
    expect(stringify(other)).not.toBe(stringify(baseInput()));
  });

  it("moves when a take joins the source tuple, and when the display ancestor changes", () => {
    const added = baseInput();
    added.sourceInputs = [
      { kind: "take", generationId: "gen-A" },
      { kind: "take", generationId: "gen-B" },
      { kind: "studio-image", assetId: "asset-1", storagePath: "p/asset-1" },
    ];
    expect(stringify(added)).not.toBe(stringify(baseInput()));

    const reAncestored = baseInput();
    reAncestored.displayAncestorGenerationId = "gen-B";
    expect(stringify(reAncestored)).not.toBe(stringify(baseInput()));
  });

  it("carries no transient signed URL: none is an input, so none can be in the fingerprint", () => {
    const serialized = stringify(baseInput());
    expect(serialized).not.toContain("http");
    expect(serialized).toContain("digest-a");
  });
});
