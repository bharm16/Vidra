import { describe, expect, it } from "vitest";
import { buildProxyUrl } from "../cameraMotionRenderer";

// Security-maintenance exception to ADR-0002's frozen-stack test policy:
// presentation must not route browser media through the authenticated proxy.
describe("camera motion media proxy", () => {
  it("uses the signed-url proxy instead of the convergence proxy", () => {
    const sourceUrl =
      "https://storage.googleapis.com/vidra-media-prod/users/user-1/previews/images/frame.webp?X-Goog-Signature=minted";

    expect(buildProxyUrl(sourceUrl)).toBe(
      `/api/storage/proxy?url=${encodeURIComponent(sourceUrl)}`,
    );
  });
});
