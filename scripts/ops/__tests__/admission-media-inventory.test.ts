import { describe, expect, it } from "vitest";
import { inspectAdmissionMedia } from "../admission-media-inventory";

const snapshot = {
  bucket: "media",
  storagePath: "image-previews/creator/snapshot",
  generation: "17",
  sizeBytes: 42,
  metadata: { admissionSource: "sketch-snapshot" },
};
const bridge = {
  bucket: "media",
  storagePath: "users/creator/previews/images/bridge.webp",
  generation: "21",
  sizeBytes: 100,
  metadata: {
    studioProjectId: "project-1",
    originSessionId: "session-1",
    originGenerationId: "take-1",
  },
};
function inventory(
  documents: { path: string; data: Record<string, unknown> }[] = [],
): Record<string, unknown> {
  return {
    schemaVersion: "vidra-admission-media-inventory/v1",
    capturedAt: "2026-10-03T07:00:00.000Z",
    complete: true,
    missingSources: [],
    documents,
    objects: [snapshot, bridge],
  };
}

describe("admission-media dry-run (issue #137)", () => {
  it("identifies an unreferenced snapshot and losing bridge without enabling deletion", () => {
    const report = inspectAdmissionMedia(inventory());
    expect(report.verified).toBe(true);
    expect(report.deletionEnabled).toBe(false);
    expect(
      report.objects.map((object) => [
        object.kind,
        object.disposition,
        object.deletionAllowed,
      ]),
    ).toEqual([
      ["sketch-snapshot", "candidate", false],
      ["studio-bridge", "candidate", false],
    ]);
  });

  it.each([
    "sessions/session-1",
    "request_idempotency/receipt",
    "owed_take_attachments/take-1",
    "studio_projects/project-1/turns/turn-1",
    "shares/share-1",
  ])(
    "protects source inputs and archived/failed attachment records in %s",
    (path) => {
      const report = inspectAdmissionMedia(
        inventory([
          {
            path,
            data: {
              record: {
                archived: true,
                state: "failed",
                sourceInputs: [
                  { kind: "sketch", storagePath: snapshot.storagePath },
                ],
              },
            },
          },
        ]),
      );
      expect(report.objects[0]).toMatchObject({
        disposition: "referenced",
        references: [path],
        deletionAllowed: false,
      });
    },
  );

  it("protects an accepted copy even after its originating project is gone", () => {
    const report = inspectAdmissionMedia(
      inventory([
        {
          path: "sessions/destination",
          data: {
            prompt: {
              versions: [
                { generations: [{ storagePath: bridge.storagePath }] },
              ],
            },
          },
        },
      ]),
    );
    expect(report.objects[1]?.disposition).toBe("referenced");
  });

  it("protects the studio's independent copy after the originating session is gone", () => {
    const report = inspectAdmissionMedia(
      inventory([
        {
          path: "studio_projects/project-1",
          data: { attachments: [{ storagePath: bridge.storagePath }] },
        },
      ]),
    );
    expect(report.objects[1]?.disposition).toBe("referenced");
  });

  it.each([
    "snapshot",
    "gs://media/image-previews/creator/snapshot",
    "https://storage.googleapis.com/media/image-previews/creator/snapshot?expired=1",
    "https://media.storage.googleapis.com/image-previews/creator/snapshot?expired=1",
  ])("protects identity or URL reference %s", (value) => {
    const report = inspectAdmissionMedia(
      inventory([
        { path: "sessions/session-1", data: { mediaAssetIds: [value] } },
      ]),
    );
    expect(report.objects[0]?.disposition).toBe("referenced");
  });

  it("does not classify a partial export as evidence of abandonment", () => {
    const report = inspectAdmissionMedia({
      ...inventory(),
      complete: false,
      missingSources: ["request_idempotency"],
    });
    expect(report.verified).toBe(false);
    expect(
      report.objects.every((object) => object.disposition === "unknown"),
    ).toBe(true);
  });

  it("keeps untagged historical objects unknown even in a complete export", () => {
    const report = inspectAdmissionMedia({
      ...inventory(),
      objects: [{ ...snapshot, metadata: {} }],
    });
    expect(report.objects[0]?.disposition).toBe("unknown");
  });

  it("rejects malformed input before producing an eligibility report", () => {
    expect(() =>
      inspectAdmissionMedia({
        ...inventory(),
        objects: [{ ...snapshot, generation: "" }],
      }),
    ).toThrow();
  });
  it("holds unreferenced objects while an acceptance or studio turn is in flight", () => {
    const report = inspectAdmissionMedia(
      inventory([
        { path: "request_idempotency/pending", data: { status: "pending" } },
      ]),
    );
    expect(report.inFlightRecords).toEqual(["request_idempotency/pending"]);
    expect(
      report.objects.every((object) => object.disposition === "unknown"),
    ).toBe(true);
  });
});
