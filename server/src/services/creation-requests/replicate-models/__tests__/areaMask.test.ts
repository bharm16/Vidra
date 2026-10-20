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
