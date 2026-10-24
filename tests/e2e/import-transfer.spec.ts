import { expect, test } from "@playwright/test";
import { injectAuthUser, TEST_USER } from "./helpers/auth";
import { mockWorkspace } from "./helpers/workspace";

test("resumable transfer reads browser Range acknowledgements and sends no skipped bytes", async ({ page }) => {
  await injectAuthUser(page); await mockWorkspace(page, { profiles: [], requests: [], media: [] }); await page.goto("/app");
  const ranges: string[] = [];
  await page.route("**/controlled-upload", route => {
    ranges.push(route.request().headers()["content-range"] ?? "");
    const range = ranges.length === 1 ? "bytes=0-262143" : ranges.length === 2 ? "bytes=0-8650751" : undefined;
    return route.fulfill({ status: range ? 308 : 200, headers: range ? { Range: range } : {}, body: "" });
  });
  const progress = await page.evaluate(async ownerId => {
    const path = "/src/features/project-imports/api/importTransfer.ts";
    const module: { transferImport(owner: string, url: string, file: Blob, offset: number, signal: AbortSignal, onProgress: (percent: number) => void): Promise<void> } = await import(path);
    const percentages: number[] = [];
    await module.transferImport(ownerId, new URL("/controlled-upload", window.location.href).href, new Blob([new Uint8Array(9 * 1024 * 1024)], { type: "image/png" }), 0, new AbortController().signal, value => percentages.push(value));
    return percentages;
  }, TEST_USER.uid);
  expect(ranges).toEqual(["bytes 0-8388607/9437184", "bytes 262144-8650751/9437184", "bytes 8650752-9437183/9437184"]);
  expect(progress.at(-1)).toBe(100);
});
