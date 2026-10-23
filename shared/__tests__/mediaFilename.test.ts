import { describe, expect, it } from "vitest";
import { mediaDownloadName } from "../workflow/mediaFilename";

const verified = (contentType?: "image/webp" | "video/mp4") => ({ state: "verified" as const, durationSeconds: 0, audio: "absent" as const, probeVersion: "probe", ...(contentType ? { contentType } : {}) });
const object = (storagePath: string) => ({ identity: "unknown" as const, assetId: "asset", storagePath });

describe("mediaDownloadName", () => {
  it("adds the extension the stored bytes need", () => {
    expect(mediaDownloadName({ label: "make the bicycle bright green", metadata: verified("image/webp"), object: object("image-previews/u/abc") })).toBe("make the bicycle bright green.webp");
    expect(mediaDownloadName({ label: "Lantern", metadata: { state: "pending" }, object: object("users/u/previews/videos/workflow-slot.mp4") })).toBe("Lantern.mp4");
  });

  it("keeps an existing extension and removes characters a file name cannot hold", () => {
    expect(mediaDownloadName({ label: "upload-test.png", metadata: verified(), object: object("users/u/imports/x.png") })).toBe("upload-test.png");
    expect(mediaDownloadName({ label: " a/b: c ", metadata: verified("video/mp4"), object: object("x") })).toBe("a b c.mp4");
    expect(mediaDownloadName({ label: "   ", metadata: verified("video/mp4"), object: object("x") })).toBe("vidra-media.mp4");
  });
});
