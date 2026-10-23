import path from "node:path";
import { describe, expect, it } from "vitest";
import { modelDownloadPath } from "../modelDownloadPath";

const staging = path.resolve("/tmp/vidra-model-download-test");

describe("model download destinations", () => {
  it("retains ordinary nested model files beneath staging", () => {
    expect(modelDownloadPath(staging, "models/tokenizer/config.json", "models/"))
      .toBe(path.join(staging, "tokenizer", "config.json"));
    expect(modelDownloadPath(staging, "model.onnx", ""))
      .toBe(path.join(staging, "model.onnx"));
    // Percent sequences are literal GCS object-name bytes, never URL-decoded.
    expect(modelDownloadPath(staging, "models/percent%20name.json", "models/"))
      .toBe(path.join(staging, "percent%20name.json"));
  });

  it.each([
    "models/../outside",
    "models/nested/../../outside",
    "models/./model.onnx",
    "models//absolute",
    "models/",
    "models/C:/outside",
    "models/C:outside",
    "models/..\\outside",
    "models/\\\\server\\share",
    "models/nested\u0000file",
    "models/nested\nfile",
    "models/.. /outside",
    "models/nested./outside",
    "models/model.onnx:stream",
    "models/NUL",
    "models/con.txt",
  ])("rejects ambiguous or escaping object name %j", (name) => {
    expect(() => modelDownloadPath(staging, name, "models/"))
      .toThrow(/model object/i);
  });

  it("refuses unexpected prefix responses and absolute rootless names", () => {
    expect(() => modelDownloadPath(staging, "other/model.onnx", "models/"))
      .toThrow(/selected prefix/);
    expect(() => modelDownloadPath(staging, "/outside", ""))
      .toThrow(/model object/i);
  });
});
