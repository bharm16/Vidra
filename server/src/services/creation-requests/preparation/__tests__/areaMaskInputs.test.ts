import { expect, it } from "vitest";
import { MediaVersionSchema, type MediaVersion } from "@shared/schemas/workflow/media.schemas";
import { areaMaskMismatch } from "../areaMaskInputs";

const version = (id: string, width: number, height: number, origin: Record<string, unknown> = { kind: "upload" }): MediaVersion => MediaVersionSchema.parse({ schemaVersion: "vidra-workflow/v2", id, ownerId: "owner", projectId: "project_one", kind: "image", label: id, origin, sourceInputs: [], object: { identity: "unknown", assetId: id, storagePath: `users/owner/${id}.png` }, metadata: { state: "verified", width, height, durationSeconds: 0, audio: "absent", probeVersion: "test" }, association: "linked", createdAt: "2026-10-23T00:00:00.000Z" });
const picture = version("version_picture", 1600, 900);
const mask = version("version_mask_one", 1600, 900, { kind: "area-mask", versionId: "version_picture" });
const inputs = [{ role: "primary", versionId: picture.id }, { role: "mask", versionId: mask.id }];

it("accepts an area painted on the request's exact picture at its exact size", () => {
  expect(areaMaskMismatch(inputs, [picture, mask])).toBe(false);
  expect(areaMaskMismatch([inputs[0]!], [picture])).toBe(false);
});

it("blocks an area that belongs to another picture, another size, no picture, or is not a painted area", () => {
  expect(areaMaskMismatch(inputs, [version("version_other", 1600, 900), mask])).toBe(true);
  expect(areaMaskMismatch(inputs, [picture, version("version_mask_one", 800, 450, { kind: "area-mask", versionId: "version_picture" })])).toBe(true);
  expect(areaMaskMismatch([inputs[1]!], [mask])).toBe(true);
  expect(areaMaskMismatch(inputs, [picture, version("version_mask_one", 1600, 900)])).toBe(true);
});
