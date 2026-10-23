import { Readable } from "node:stream";
import { expect, it } from "vitest";
import { controlledNetwork } from "@services/owned-media/__tests__/controlledNetwork";
import { fetchAsVeoInline } from "../imageUtils";

it("converts bounded image bytes to base64 and preserves an allowed MIME type", async () => {
  const body = Buffer.from("hello-image");
  const network = controlledNetwork(() => ({ body: Readable.from([body]) }));
  expect(await fetchAsVeoInline("https://cdn.example.test/image", "image", network)).toEqual({ inlineData: { mimeType: "image/png", data: body.toString("base64") } });
});

it("refuses a failed response and content outside the media purpose", async () => {
  await expect(fetchAsVeoInline("https://cdn.example.test/missing", "image", controlledNetwork(() => ({ status: 404, statusText: "Not Found" })))).rejects.toThrow("404");
  await expect(fetchAsVeoInline("https://cdn.example.test/text", "image", controlledNetwork(() => ({ headers: { "content-type": "text/plain" } })))).rejects.toThrow("content type");
  await expect(fetchAsVeoInline("https://cdn.example.test/image", "video", controlledNetwork(() => ({})))).rejects.toThrow("content type");
});

it("rejects private/SSRF input URLs before opening a connection", async () => {
  const network = controlledNetwork(() => ({}));
  for (const url of ["http://169.254.169.254/latest/meta-data/", "http://[fe80::1]/secret"]) {
    await expect(fetchAsVeoInline(url, "image", network)).rejects.toThrow(/veoInlineMediaUrl/);
  }
  expect(network.request).not.toHaveBeenCalled();
});
