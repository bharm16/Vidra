import { describe, it, expect } from "vitest";

import { validateImageBuffer } from "@utils/validateFileType";

// Minimal valid file headers (magic bytes) for each format
const PNG_HEADER = Buffer.from([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a, // PNG signature
  0x00,
  0x00,
  0x00,
  0x0d,
  0x49,
  0x48,
  0x44,
  0x52, // IHDR chunk
  0x00,
  0x00,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00,
  0x01, // 1x1 dimensions
  0x08,
  0x02,
  0x00,
  0x00,
  0x00,
  0x90,
  0x77,
  0x53, // bit depth, color type, CRC
  0xde,
]);

const JPEG_HEADER = Buffer.from([
  0xff,
  0xd8,
  0xff,
  0xe0, // JPEG SOI + APP0 marker
  0x00,
  0x10,
  0x4a,
  0x46,
  0x49,
  0x46,
  0x00,
  0x01, // JFIF header
  0x01,
  0x00,
  0x00,
  0x01,
  0x00,
  0x01,
  0x00,
  0x00,
]);

const WEBP_HEADER = Buffer.from([
  0x52,
  0x49,
  0x46,
  0x46, // RIFF
  0x24,
  0x00,
  0x00,
  0x00, // file size (placeholder)
  0x57,
  0x45,
  0x42,
  0x50, // WEBP
  0x56,
  0x50,
  0x38,
  0x20, // VP8 chunk
  0x18,
  0x00,
  0x00,
  0x00,
]);

const GIF_HEADER = Buffer.from([
  0x47,
  0x49,
  0x46,
  0x38,
  0x39,
  0x61, // GIF89a
  0x01,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00,
  0x00,
]);

describe("validateImageBuffer", () => {
  it("accepts valid PNG buffer", async () => {
    const mime = await validateImageBuffer(PNG_HEADER, "testField");
    expect(mime).toBe("image/png");
  });

  it("accepts valid JPEG buffer", async () => {
    const mime = await validateImageBuffer(JPEG_HEADER, "testField");
    expect(mime).toBe("image/jpeg");
  });

  it("accepts valid WebP buffer", async () => {
    const mime = await validateImageBuffer(WEBP_HEADER, "testField");
    expect(mime).toBe("image/webp");
  });

  it("accepts valid GIF buffer", async () => {
    const mime = await validateImageBuffer(GIF_HEADER, "testField");
    expect(mime).toBe("image/gif");
  });

  it("rejects random bytes (not an image)", async () => {
    const randomBytes = Buffer.from([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
    ]);
    await expect(validateImageBuffer(randomBytes, "upload")).rejects.toThrow(
      "Invalid file type for upload",
    );
  });

  it("rejects empty buffer", async () => {
    await expect(validateImageBuffer(Buffer.alloc(0), "empty")).rejects.toThrow(
      "Invalid file type for empty",
    );
  });

  it("includes detected MIME in error message for non-image files", async () => {
    // PDF magic bytes
    const pdfBuffer = Buffer.from([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34,
    ]);
    await expect(validateImageBuffer(pdfBuffer, "doc")).rejects.toThrow(
      "got application/pdf",
    );
  });
});
