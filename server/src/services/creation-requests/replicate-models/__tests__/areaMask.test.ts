import sharp from "sharp";
import { expect, it, vi } from "vitest";
import { blackEditMaskFromAlpha, createAreaMaskTools } from "../areaMask";

async function paintedMask(): Promise<Buffer> {
  // Left pixel painted (opaque ink), right pixel untouched (transparent).
  const pixels = Buffer.from([184, 160, 255, 255, 0, 0, 0, 0]);
  return sharp(pixels, { raw: { width: 2, height: 1, channels: 4 } })
    .png()
    .toBuffer();
}

it("turns painted pixels black and untouched pixels white at the source size", async () => {
  const uri = await blackEditMaskFromAlpha(await paintedMask());
  expect(uri).toMatch(/^data:image\/png;base64,/);
  const { data, info } = await sharp(
    Buffer.from(uri.split(",")[1] ?? "", "base64"),
  )
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect([info.width, info.height]).toEqual([2, 1]);
  expect([...data]).toEqual([0, 255]);
});

it("refuses an unreadable mask instead of editing the whole picture", async () => {
  const tools = createAreaMaskTools(
    vi.fn(async () => new Response("gone", { status: 404 })),
  );
  await expect(tools.blackEditMask("https://media.test/mask")).rejects.toThrow(
    "could not be read",
  );
});

it("refuses a mask whose declared size is over 10 MB without reading it", async () => {
  const body = new ReadableStream<Uint8Array>();
  const tools = createAreaMaskTools(
    vi.fn(async () => new Response(body, { headers: { "content-length": String(11 * 1024 * 1024) } })),
  );
  await expect(tools.blackEditMask("https://media.test/mask")).rejects.toThrow("too large");
  expect(body.locked).toBe(false);
});

it("stops reading a mask stream as soon as it passes 10 MB", async () => {
  const chunk = new Uint8Array(1024 * 1024);
  let sent = 0;
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { sent += 1; if (sent > 40) controller.close(); else controller.enqueue(chunk); },
    cancel,
  });
  const tools = createAreaMaskTools(vi.fn(async () => new Response(body)));
  await expect(tools.blackEditMask("https://media.test/mask")).rejects.toThrow("too large");
  expect(cancel).toHaveBeenCalledOnce();
  expect(sent).toBeLessThanOrEqual(13);
});
