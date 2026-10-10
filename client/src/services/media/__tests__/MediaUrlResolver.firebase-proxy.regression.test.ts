/**
 * Regression test: Firebase Storage download URLs must be proxied.
 *
 * URLs from firebasestorage.googleapis.com with ?alt=media&token=...
 * were not rewritten through the media proxy because hasGcsSignedUrlParams
 * only checked for GCS v2/v4 signed URL parameters. Firebase download
 * URLs use different query params and must also be proxied to avoid ORB.
 */
import { describe, expect, it } from "vitest";
import { rewriteGcsUrlToProxy } from "../MediaUrlResolver";

describe("regression: Firebase Storage URLs are proxied", () => {
  it("rewrites firebasestorage.googleapis.com download URLs", () => {
    const firebaseUrl =
      "https://firebasestorage.googleapis.com/v0/b/my-bucket.appspot.com/o/assets%2Fimg.webp?alt=media&token=abc-123";

    const result = rewriteGcsUrlToProxy(firebaseUrl);

    expect(result).toContain("/api/storage/proxy?url=");
    expect(result).toContain(
      encodeURIComponent("firebasestorage.googleapis.com"),
    );
  });

  it("does not rewrite non-GCS URLs", () => {
    const otherUrl = "https://cdn.example.com/image.png";

    const result = rewriteGcsUrlToProxy(otherUrl);

    expect(result).toBe(otherUrl);
  });

  it("does not rewrite already-proxied URLs", () => {
    const proxied =
      "/api/storage/proxy?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Fimg.webp";

    const result = rewriteGcsUrlToProxy(proxied);

    expect(result).toBe(proxied);
  });
});
