import { Readable } from "node:stream";
import { expect, it, vi } from "vitest";
import { controlledNetwork } from "@services/owned-media/__tests__/controlledNetwork";
import { MAX_REPLICATE_IMAGE_BYTES, resolveImageInput } from "../imagePreprocessing";

const log = { info: vi.fn() };

it("preserves supported provider URLs and data URIs without a local fetch", async () => {
  const network = controlledNetwork(() => { throw new Error("Must not fetch passthrough input"); });
  for (const input of ["https://cdn.example.test/input.PNG?signature=fixture", "data:image/png;base64,cGljdHVyZQ=="]) {
    await expect(resolveImageInput(input, log, "startImage", network)).resolves.toBe(input);
  }
  expect(network.resolve).not.toHaveBeenCalled();
  expect(network.request).not.toHaveBeenCalled();
});

it("prepares an extensionless signed image as a bounded Blob with its actual MIME", async () => {
  const network = controlledNetwork(() => ({ body: Readable.from([Buffer.from("picture")]), headers: { "content-type": "image/webp" } }));
  const image = await resolveImageInput("https://cdn.example.test/input?signature=fixture", log, "style_reference", network);
  if (typeof image === "string") throw new Error("Expected a prepared Blob");
  expect(image.type).toBe("image/webp");
  expect(Buffer.from(await image.arrayBuffer()).toString()).toBe("picture");
});

it("rejects an extensionless private DNS target or an oversized image before preparation", async () => {
  const privateNetwork = controlledNetwork(() => ({}), [{ address: "10.0.0.1", family: 4 }]);
  await expect(resolveImageInput("http://internal.example.test/input", log, "startImage", privateNetwork)).rejects.toThrow("public host");
  expect(privateNetwork.request).not.toHaveBeenCalled();
  const tooLarge = controlledNetwork(() => ({ headers: { "content-type": "image/png", "content-length": String(MAX_REPLICATE_IMAGE_BYTES + 1) } }));
  await expect(resolveImageInput("https://cdn.example.test/input", log, "startImage", tooLarge)).rejects.toThrow("maximum size");
});

it("refuses a legacy key-bearing URL even when its supported extension would be passed through", async () => {
  const network = controlledNetwork(() => ({}));
  await expect(resolveImageInput("https://storage.googleapis.com/bucket/users/api-key:retired-key-fixture/input.png", log, "startImage", network)).rejects.toThrow("This media is unavailable");
  expect(network.request).not.toHaveBeenCalled();
});
