/**
 * A real PNG signature + IHDR. The asset/reference-image routes validate
 * uploads by magic bytes (validateImageBuffer -> fileTypeFromBuffer), so
 * arbitrary text is rejected as "expected image, got unknown". Was
 * byte-identical in both consuming suites; tests/unit/validate-file-type
 * keeps its own richer header set because fixtures are that suite's subject.
 */
export const PNG_BYTES = Buffer.from([
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
]);
