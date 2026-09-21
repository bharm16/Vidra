import { describe, expect, it } from "vitest";
import {
  fetchAndSniffImageBytes,
  sniffImageFormat,
  sniffStoredImageBytes,
  validateFirstFrameResponse,
  validateSketchFrameResponse,
  validateStudioEditTurn,
} from "../validate";
import { tinyPngBytes } from "../tinyPng";
import { validateImageBuffer } from "../../../../server/src/utils/validateFileType";

/**
 * The smoke's output validation (issue #140): every response is held to the
 * same shared contract the replay cassette is held to, plus a magic-byte
 * sniff of the image itself.
 */

describe("sketch frame validation", () => {
  it("accepts a response satisfying the shared sketch-frame-result contract", () => {
    const result = validateSketchFrameResponse({
      images: [{ url: "https://fal.storage/frames/abc.webp" }],
    });
    expect(result).toEqual({
      ok: true,
      imageUrl: "https://fal.storage/frames/abc.webp",
    });
  });

  it("rejects a frame with no usable image — malformed, never a blank live output", () => {
    expect(validateSketchFrameResponse({ images: [] }).ok).toBe(false);
    expect(validateSketchFrameResponse({}).ok).toBe(false);
    expect(validateSketchFrameResponse({ images: [{ url: "" }] }).ok).toBe(false);
    expect(
      validateSketchFrameResponse({ images: [{ url: "https://x.test/a.webp" }], extra: 1 }).ok,
    ).toBe(true); // passthrough fields allowed, as the cassette contract allows
  });
});

describe("studio edit turn validation", () => {
  const succeededEditTurn = {
    status: "succeeded",
    decision: { action: "edit" },
    calls: [
      {
        status: "succeeded",
        image: { viewUrl: "https://objects.test/img", storagePath: "p/img" },
      },
    ],
  };

  it("accepts a succeeded first-turn edit with one image call, naming the studio-turn record", () => {
    const result = validateStudioEditTurn(succeededEditTurn);
    expect(result.ok).toBe(true);
    expect(result.imageUrl).toBe("https://objects.test/img");
    expect(result.records).toEqual([
      {
        leg: "studio-turn",
        outcome: "validated",
        detail: "studio_turn decision accepted (action=edit)",
      },
    ]);
  });

  it("rejects a failed turn", () => {
    const result = validateStudioEditTurn({
      ...succeededEditTurn,
      status: "failed",
    });
    expect(result.ok).toBe(false);
    expect(result.records[0]).toMatchObject({
      leg: "studio-turn",
      outcome: "failed",
    });
  });

  it("rejects a turn that decided not to edit — the first-turn edit must be available (#110)", () => {
    const result = validateStudioEditTurn({
      ...succeededEditTurn,
      decision: { action: "clarify" },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("issue #110");
    expect(result.records[0]).toMatchObject({ leg: "studio-turn", outcome: "invalid" });
  });

  it("rejects an edit that produced no image, naming the studio-edit-image leg", () => {
    const result = validateStudioEditTurn({
      status: "succeeded",
      decision: { action: "edit" },
      calls: [{ status: "failed" }],
    });
    expect(result.ok).toBe(false);
    expect(result.records).toEqual([
      { leg: "studio-turn", outcome: "validated", detail: "decision action=edit" },
      { leg: "studio-edit-image", outcome: "failed", detail: "no succeeded image call" },
    ]);
  });
});

describe("first frame validation", () => {
  it("accepts a success body satisfying the shared image-preview-result contract", () => {
    const result = validateFirstFrameResponse({
      success: true,
      data: {
        imageUrl: "https://replicate.delivery/flux.webp",
        model: "black-forest-labs/flux-schnell",
        durationMs: 1234,
        aspectRatio: "16:9",
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model).toBe("black-forest-labs/flux-schnell");
    }
  });

  it("rejects an error body and a contract-violating payload", () => {
    expect(validateFirstFrameResponse({ success: false }).ok).toBe(false);
    expect(
      validateFirstFrameResponse({ success: true, data: { imageUrl: "" } }).ok,
    ).toBe(false);
    expect(validateFirstFrameResponse(null).ok).toBe(false);
  });
});

describe("image byte sniffing", () => {
  it("recognizes the raster formats the providers emit", () => {
    expect(sniffImageFormat(tinyPngBytes(0x40))).toBe("png");
    expect(sniffImageFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(
      sniffImageFormat(Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
    ).toBe("webp/riff");
    expect(sniffImageFormat(Buffer.from("<html>404</html>"))).toBeNull();
  });

  it("the synthesized sketch drawing passes the product's own file-type validator", async () => {
    // The live providers really decode what they receive; this cross-check
    // proves the smoke's own picture would pass the same boundary the
    // accept door applies.
    const mime = await validateImageBuffer(tinyPngBytes(0x40, 16), "test");
    expect(mime).toBe("image/png");
  });

  it("fetchAndSniffImageBytes fails a URL that answers with non-image bytes", async () => {
    const html = await fetchAndSniffImageBytes("https://x.test/a", async () =>
      new Response("<html>forbidden</html>", { status: 200 }),
    );
    expect(html.ok).toBe(false);
    if (!html.ok) expect(html.reason).toContain("not a recognized raster");

    const notOk = await fetchAndSniffImageBytes("https://x.test/a", async () =>
      new Response("nope", { status: 403 }),
    );
    expect(notOk.ok).toBe(false);
    if (!notOk.ok) expect(notOk.reason).toContain("403");

    const badUrl = await fetchAndSniffImageBytes("data:image/png;base64,xxxx", async () => {
      throw new Error("should not fetch");
    });
    expect(badUrl.ok).toBe(false);
    if (!badUrl.ok) expect(badUrl.reason).toContain("not http(s)");
  });

  it("fetchAndSniffImageBytes accepts real image bytes", async () => {
    const bytes = tinyPngBytes(0x80);
    const result = await fetchAndSniffImageBytes("https://x.test/a.png", async () =>
      new Response(new Uint8Array(bytes), { status: 200 }),
    );
    expect(result).toEqual({ ok: true, format: "png", bytes: bytes.byteLength });
  });

  it("sniffStoredImageBytes rejects empty or non-image storage", () => {
    expect(sniffStoredImageBytes(undefined).ok).toBe(false);
    expect(sniffStoredImageBytes(Buffer.alloc(0)).ok).toBe(false);
    expect(sniffStoredImageBytes(Buffer.from("text bytes")).ok).toBe(false);
    expect(sniffStoredImageBytes(tinyPngBytes(1))).toEqual({ ok: true, format: "png" });
  });
});
